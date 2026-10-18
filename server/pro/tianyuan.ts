import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
  parseTianyuan,
  tianyuanQuerySchema,
  tianyuanUrl,
  sourceDate,
} from '../../src/player/pro/tianyuan.ts';
import type { TianyuanPacket, TianyuanQuery, TianyuanStat } from '../../src/player/pro/tianyuan.ts';
import { sourceTierDate } from '../../src/player/pro/publicBoard.ts';

export function createTianyuan(options: {
  directory: string;
  heroIds: number[];
  fetcher?: typeof fetch;
  now?: () => number;
  delayMs?: number;
}) {
  const fetcher = options.fetcher ?? fetch,
    now = options.now ?? Date.now;
  const active = new Map<string, Promise<TianyuanPacket>>(),
    memory = new Map<string, TianyuanPacket>(),
    retry = new Map<string, number>();
  let queue: Promise<unknown> = Promise.resolve(),
    lastRequest = 0;
  const checks = new Map<string, { checkedAt: string; state: string; error?: string }>();
  function get(input: TianyuanQuery): Promise<TianyuanPacket> {
    const q = tianyuanQuerySchema.parse(input);
    if (q.heroId && !options.heroIds.includes(q.heroId)) throw Error('英雄不在资料目录中');
    if (q.date && q.date > new Date(now() + 8 * 3600000).toISOString().slice(0, 10))
      throw Error('不可请求未来数据');
    // Undated endpoints remain undated, even when called from a dated hero page.
    if (['duration', 'analysis'].includes(q.kind)) delete q.date;
    const key = [q.kind, q.date ?? 'undated', q.mode ?? 0, q.heroId ?? 0].join('-');
    if (active.has(key)) return active.get(key)!;
    const pending = read(q, key)
      .then((packet) => {
        checks.set(key, { checkedAt: new Date(now()).toISOString(), state: packet.cache });
        return packet;
      })
      .catch((error) => {
        checks.set(key, {
          checkedAt: new Date(now()).toISOString(),
          state: 'error',
          error: (error as Error).message,
        });
        throw error;
      })
      .finally(() => active.delete(key));
    active.set(key, pending);
    return pending;
  }
  async function read(q: TianyuanQuery, key: string): Promise<TianyuanPacket> {
    const file = join(options.directory, 'cache', key + '.json');
    let saved = memory.get(key);
    if (!saved)
      try {
        const p = JSON.parse(await readFile(file, 'utf8')) as TianyuanPacket;
        if (p.url !== tianyuanUrl(q)) throw Error('缓存来源不匹配');
        p.data = parseTianyuan(p.data, q);
        // Older parsed caches omitted image fields. Recover from the original
        // response with a verified hash, retaining the original dates and provenance.
        if (['skin', 'equip'].includes(q.kind) && /^[a-f0-9]{64}$/.test(p.rawSha256)) {
          try {
            const raw = await readFile(
              join(options.directory, 'raw', p.rawSha256 + '.json'),
              'utf8',
            );
            if (createHash('sha256').update(raw).digest('hex') === p.rawSha256)
              p.data = parseTianyuan(JSON.parse(raw), q);
          } catch {
            /* A missing raw file does not invalidate existing statistics. */
          }
        }
        saved = p;
        memory.set(key, p);
      } catch {
        /* no usable cache */
      }
    const age = saved ? now() - Date.parse(saved.fetchedAt) : Infinity;
    if (saved && age >= 0 && age < 3600000) return { ...saved, cache: 'cached' };
    try {
      if ((retry.get(key) ?? 0) > now()) throw Error('来源暂不可用，请稍后重试');
      const task = queue.then(async () => {
        const wait = Math.max(0, (options.delayMs ?? 1000) - (Date.now() - lastRequest));
        if (wait) await new Promise((r) => setTimeout(r, wait));
        lastRequest = Date.now();
        const url = tianyuanUrl(q),
          response = await fetcher(url, {
            headers: { Accept: 'application/json' },
            redirect: 'error',
            signal: AbortSignal.timeout(15000),
          });
        if (!response.ok) throw Error('来源HTTP ' + response.status);
        const raw = await response.text();
        if (raw.length > 8 * 1024 * 1024) throw Error('来源响应过大');
        const data = parseTianyuan(JSON.parse(raw), q),
          hash = createHash('sha256').update(raw).digest('hex');
        const dates =
          q.kind === 'stats' ? (data as TianyuanStat[]).map((r) => r.dbUpdatedAt).sort() : [];
        const sourceUpdatedAt = dates.at(-1);
        if (sourceUpdatedAt && Date.parse(sourceUpdatedAt) > now() + 5 * 60000)
          throw Error('来源更新时间异常');
        if (saved?.sourceUpdatedAt && sourceUpdatedAt && sourceUpdatedAt < saved.sourceUpdatedAt)
          throw Error('来源更新时间回退');
        const packet: TianyuanPacket = {
          source: '天元之弈数据站',
          sourceClass: 'third-party-public',
          url,
          query: q,
          requestedDate: q.date,
          sourceUpdatedAt,
          fetchedAt: new Date(now()).toISOString(),
          rawSha256: hash,
          cache: 'fresh',
          data,
        };
        await mkdir(join(options.directory, 'raw'), { recursive: true });
        await mkdir(join(options.directory, 'cache'), { recursive: true });
        await writeFile(join(options.directory, 'raw', hash + '.json'), raw, { flag: 'wx' }).catch(
          (e) => {
            if (e.code !== 'EEXIST') throw e;
          },
        );
        const temp = file + '.' + randomUUID() + '.tmp';
        await writeFile(temp, JSON.stringify(packet, null, 2));
        await rename(temp, file);
        memory.set(key, packet);
        retry.delete(key);
        return packet;
      });
      queue = task.catch(() => {});
      return await task;
    } catch (error) {
      if ((retry.get(key) ?? 0) <= now()) retry.set(key, now() + 60000);
      if (saved)
        return {
          ...saved,
          cache: 'stale',
          warning: '本次更新失败，显示此前同一查询的缓存；来源日期和获取时间未改写。',
        };
      throw new Error('天元之弈公开数据暂不可用：' + (error as Error).message);
    }
  }
  async function status() {
    const date = sourceDate(now());
    const rows = await Promise.all(
      [1, 3, 4, 5].map(async (mode) => {
        const key = ['stats', date, mode, 0].join('-'),
          q = { kind: 'stats' as const, date, mode };
        let packet = memory.get(key);
        if (!packet)
          try {
            const saved = JSON.parse(
              await readFile(join(options.directory, 'cache', key + '.json'), 'utf8'),
            ) as TianyuanPacket;
            if (saved.url !== tianyuanUrl(q)) throw Error('来源不匹配');
            saved.data = parseTianyuan(saved.data, q);
            packet = saved;
          } catch {}
        const age = packet ? now() - Date.parse(packet.fetchedAt) : Infinity,
          check = checks.get(key);
        return {
          mode,
          queryDate: date,
          records: packet ? (packet.data as TianyuanStat[]).length : 0,
          state:
            check?.state === 'stale' || check?.state === 'error'
              ? check.state
              : packet
                ? age >= 0 && age < 3600000
                  ? 'cached'
                  : 'expired'
                : 'missing',
          checkedAt: check?.checkedAt,
          fetchedAt: packet?.fetchedAt,
          sourceUpdatedAt: packet?.sourceUpdatedAt,
          inProgress: active.has(key),
        };
      }),
    );
    return { rows, observedAt: new Date(now()).toISOString() };
  }
  return { get, status };
}

export function scheduleTianyuan(source: Pick<ReturnType<typeof createTianyuan>, 'get'>) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = async () => {
    const date = sourceDate();
    for (const mode of [1, 3, 4, 5]) {
      if (stopped) return;
      await source.get({ kind: 'stats', date, mode }).catch(() => {});
    }
    if (stopped) return;
    await source.get({ kind: 'tier', date: sourceTierDate() }).catch(() => {});
    if (!stopped) {
      timer = setTimeout(() => void run(), 60 * 60 * 1000);
      timer.unref();
    }
  };
  void run();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
