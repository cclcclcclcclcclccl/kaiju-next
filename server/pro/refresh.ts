import { mkdir, writeFile, rename, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { OfficialQuery, OfficialRankResult } from '../../src/player/pro/official.ts';

export const RANK_REFRESH_INTERVAL = 35 * 60 * 1000;
type Result = {
  segment: number;
  position: number;
  state: 'fresh' | 'cached' | 'stale' | 'error';
  sourceDate?: string;
  fetchedAt?: string;
  rows: number;
  error?: string;
};
export type RefreshStatus = {
  running: boolean;
  automatic?: boolean;
  intervalMinutes: number;
  startedAt?: string;
  completedAt?: string;
  nextCheckAt?: string;
  results: Result[];
  persistenceError?: string;
};
export function createRankRefresh(
  ranks: { get(q: OfficialQuery): Promise<OfficialRankResult> },
  directory: string,
  now = Date.now,
) {
  let state: RefreshStatus = { running: false, intervalMinutes: 35, results: [] };
  let pending: Promise<RefreshStatus> | undefined;
  let automatic = false;
  const file = join(directory, 'status.json');
  async function atomic(file: string, value: unknown) {
    const temporary = file + '.' + randomUUID() + '.tmp';
    await writeFile(temporary, JSON.stringify(value, null, 2));
    await rename(temporary, file);
  }
  async function perform() {
    const startedAt = new Date(now()).toISOString();
    state = { running: true, intervalMinutes: 35, startedAt, results: [] };
    // Sequential requests limit upstream load. Existing cache deduplicates with UI requests.
    for (const segment of [1, 3, 4])
      for (const position of [1, 2, 3, 4, 5]) {
        try {
          const result = await ranks.get({ segment, position });
          state.results.push({
            segment,
            position,
            state: result.cache,
            sourceDate: result.data.sourceUpdatedOn,
            fetchedAt: result.data.fetchedAt,
            rows: result.data.rows.length,
          });
          if (result.cache !== 'stale') {
            try {
              const target = join(directory, result.data.sourceUpdatedOn);
              await mkdir(target, { recursive: true });
              // Preserve revised same-day observations without archiving identical checks repeatedly.
              const hash = createHash('sha256')
                .update(JSON.stringify(result.data.rows))
                .digest('hex')
                .slice(0, 16);
              await writeFile(
                join(target, `${segment}-${position}-${hash}.json`),
                JSON.stringify(result.data, null, 2),
                { flag: 'wx' },
              ).catch((e) => {
                if (e.code !== 'EEXIST') throw e;
              });
            } catch {
              state.persistenceError = '历史归档写入失败，当前榜单仍可读取';
            }
          }
        } catch (e) {
          state.results.push({
            segment,
            position,
            state: 'error',
            rows: 0,
            error: (e as Error).message,
          });
        }
      }
    state.running = false;
    state.completedAt = new Date(now()).toISOString();
    state.nextCheckAt = automatic
      ? new Date(now() + RANK_REFRESH_INTERVAL).toISOString()
      : undefined;
    try {
      await mkdir(directory, { recursive: true });
      await atomic(file, state);
    } catch {
      state.persistenceError = '更新状态写入失败，下次启动将重新检查';
    }
    return structuredClone(state);
  }
  return {
    setAutomatic(enabled: boolean) {
      automatic = enabled;
      if (!enabled) state.nextCheckAt = undefined;
    },
    run() {
      return (pending ??= perform().finally(() => {
        pending = undefined;
      }));
    },
    async status(): Promise<RefreshStatus> {
      if (state.startedAt) return { ...structuredClone(state), automatic };
      try {
        const saved = JSON.parse(await readFile(file, 'utf8'));
        return { ...saved, running: false, automatic, nextCheckAt: undefined };
      } catch {
        return { ...structuredClone(state), automatic };
      }
    },
  };
}

export function scheduleRankRefresh(refresh: {
  run(): Promise<unknown>;
  setAutomatic(enabled: boolean): void;
}) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = async () => {
    try {
      await refresh.run();
    } catch {
      /* Retain previous cache; retry at the next interval. */
    }
    if (!stopped) {
      timer = setTimeout(() => void run(), RANK_REFRESH_INTERVAL);
      timer.unref();
    }
  };
  refresh.setAutomatic(true);
  void run();
  return () => {
    stopped = true;
    refresh.setAutomatic(false);
    if (timer) clearTimeout(timer);
  };
}
