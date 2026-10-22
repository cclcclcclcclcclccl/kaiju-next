import { z } from 'zod';
import { heroes, heroById } from './catalog.ts';
import { emptyDraft, draftSchema, poolSchema, matchSchema } from './model.ts';
import {
  emptyPro,
  profileSchema,
  snapshotSchema,
  reviewSchema,
  jungleSchema,
} from './pro/model.ts';
import { backupSchema, backupCounts, backupHeroIds, personalStateSchema } from './pro/backup.ts';
import type { PersonalState } from './pro/backup.ts';
import { parseSeries } from './pro/seriesBp.ts';
import { recommend, noteFor } from './tactics.ts';
import { latestSnapshot } from './pro/analytics.ts';
import { plusQuerySchema, plusUrl } from './pro/sourcePlus.ts';
import { tianyuanQuerySchema } from './pro/tianyuan.ts';
import { reviewConfig } from './reviewMode.ts';

type Stored = {
  data: PersonalState;
  revision: string;
  seriesRevision: number;
  history: {
    id: number;
    reason: string;
    savedAt: string;
    before: PersonalState['pool'];
    after: PersonalState['pool'];
  }[];
  checkpoint?: PersonalState;
};
type Manifest = { entries: Record<string, { file: string; sha256: string }>; builtAt: string };
const fail = (message: string, status = 400): never => {
  throw Object.assign(new Error(message), { status });
};
const same = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const aa = a as Record<string, unknown>,
    bb = b as Record<string, unknown>;
  return (
    Object.keys(aa).length === Object.keys(bb).length &&
    Object.keys(aa).every((k) => Object.hasOwn(bb, k) && same(aa[k], bb[k]))
  );
};
const sha = async (value: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
const fresh = (): Stored => ({
  data: { pool: [], draft: emptyDraft(), matches: [], plans: [], ...emptyPro(), bpSeries: null },
  revision: crypto.randomUUID(),
  seriesRevision: 0,
  history: [],
});
let database: Promise<IDBDatabase> | undefined;
function db() {
  return (database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('zizai-online-personal-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('workspace');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      database = undefined;
      reject(Error('浏览器存储不可用，请允许本站保存数据后重试。'));
    };
    request.onblocked = () => reject(Error('请关闭此网站的其他旧页面后重新打开。'));
  }));
}
async function read(): Promise<Stored> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const request = database.transaction('workspace').objectStore('workspace').get('personal');
    request.onsuccess = () => resolve(request.result ?? fresh());
    request.onerror = () => reject(Error('读取浏览器记录失败，未清空已有资料。'));
  });
}
async function write(state: Stored) {
  state.data = personalStateSchema.parse(state.data);
  if (backupHeroIds(state.data).some((id) => !heroById(id)))
    fail('包含英雄图鉴中不存在的英雄，未保存。');
  const database = await db();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction('workspace', 'readwrite');
    transaction.objectStore('workspace').put(state, 'personal');
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () =>
      reject(Error('浏览器保存失败，可能空间不足。请保留输入并导出备份，未显示保存成功。'));
  });
}
let manifestPromise: Promise<Manifest> | undefined;
async function archive(path: string): Promise<unknown> {
  const base = reviewConfig!.base + 'review-data/';
  const manifest = await (manifestPromise ??= fetch(base + 'manifest.json')
    .then(async (r) => {
      if (!r.ok) throw Error('公开资料索引暂时无法读取，请检查网络后重试。');
      return r.json();
    })
    .catch((e) => {
      manifestPromise = undefined;
      throw e;
    }));
  const url = new URL(path, 'https://review.invalid');
  let key = url.pathname;
  const params = Object.fromEntries(url.searchParams);
  if (key === '/tianyuan') {
    const q = tianyuanQuerySchema.parse(params);
    key =
      '/tianyuan/' +
      [
        q.kind,
        ['analysis', 'duration'].includes(q.kind) ? 'undated' : (q.date ?? 'undated'),
        q.mode ?? 0,
        q.heroId ?? 0,
      ].join('-');
  } else if (key === '/source-plus') key = plusUrl(plusQuerySchema.parse(params));
  else if (key === '/official/hero-rank') key += '/' + [params.segment, params.position].join('-');
  const entry = manifest.entries[key];
  if (!entry)
    fail(
      '在线版未收录此日期或条件的真实数据，请选择已收录日期；不会用其他分段或日期的数据代替。',
      404,
    );
  const response = await fetch(base + entry.file);
  if (!response.ok) fail('该公开资料暂时无法下载，请重试。', response.status);
  const text = await response.text();
  if ((await sha(text)) !== entry.sha256) fail('公开资料校验失败，请刷新页面后重试。');
  return JSON.parse(text);
}

export async function browserApi<T>(path: string, body?: unknown): Promise<T> {
  const route = new URL(path, 'https://review.invalid').pathname;
  if (route === '/status')
    return {
      product: '自在弈境',
      productId: 'kaiju-player-companion',
      version: '0.26.1-online',
      modelConfigured: false,
      publicSharing: false,
      heroCount: heroes.length,
      identity: { name: '浏览器访客', mode: 'guest' },
    } as T;
  if (route === '/social' && body === undefined) return { user: null, friends: [] } as T;
  if (route === '/pro/ocr-status') return { ready: false, engine: '在线版未部署 OCR 服务' } as T;
  if (
    ['/tianyuan', '/source-plus', '/resources', '/official/hero-rank', '/kpl/cases'].includes(
      route,
    ) &&
    body === undefined
  )
    return (await archive(path)) as T;
  if (route === '/official/update-status')
    return {
      automatic: false,
      running: false,
      results: [],
      completedAt: reviewConfig?.builtAt,
    } as T;
  if (route === '/tianyuan/status') return { rows: [] } as T;
  if (
    ['/auth/', '/social/'].some((prefix) => route.startsWith(prefix)) ||
    [
      '/coach',
      '/pro/recognize-profile',
      '/pro/recognize-stat-table',
      '/pro/review-analyze',
      '/pro/review-handoff',
      '/pro/review-handoff-result',
    ].includes(route)
  )
    fail(
      '固定在线版未部署账号联机、服务器识别或 AI 模型服务。可直接体验图鉴、真实数据快照、BP、个人档案和手动复盘；完整服务请运行作品包。',
      503,
    );
  if (!navigator.locks)
    fail('当前浏览器不支持安全保存，请使用新版 Edge、Chrome、Firefox 或 Safari。');
  return navigator.locks.request('zizai-online-workspace', async () => {
    const state = await read(),
      d = state.data;
    const input = body as any;
    const timestamp = new Date().toISOString();
    const meta = () => ({ id: crypto.randomUUID(), createdAt: timestamp });
    const conflict = () =>
      fail('资料已在另一个页面修改，本次没有覆盖。请先导出当前输入，再重新读取记录。', 409);
    let result: unknown;
    let changed = body !== undefined;
    if (route === '/workspace')
      result = { pool: d.pool, draft: d.draft, matches: d.matches, plans: d.plans };
    else if (route === '/pro')
      result = { profile: d.profile, snapshots: d.snapshots, reviews: d.reviews, runs: d.runs };
    else if (route === '/pool-status')
      result = {
        mode: 'guest',
        name: '当前浏览器',
        pool: d.pool,
        guestPool: [],
        history: state.history,
        savedAt: state.history[0]?.savedAt ?? null,
      };
    else if (['/pool-edit', '/pool-restore', '/pool'].includes(route) && body !== undefined) {
      const before = structuredClone(d.pool);
      if (route === '/pool') d.pool = poolSchema.parse(body);
      else if (route === '/pool-restore') {
        for (const row of poolSchema.parse(input.pool))
          if (!d.pool.some((p) => p.heroId === row.heroId)) d.pool.push(row);
      } else {
        const level = z.enum(['learning', 'comfortable', 'main']).nullable();
        const changes = z
          .array(z.object({ heroId: z.number().int().positive(), expected: level, level }).strict())
          .min(1)
          .max(150)
          .parse(input.changes);
        if (new Set(changes.map((c) => c.heroId)).size !== changes.length) fail('重复英雄修改');
        for (const c of changes)
          if ((d.pool.find((p) => p.heroId === c.heroId)?.level ?? null) !== c.expected) conflict();
        for (const c of changes) {
          d.pool = d.pool.filter((p) => p.heroId !== c.heroId);
          if (c.level) d.pool.push({ heroId: c.heroId, level: c.level });
        }
      }
      state.history.unshift({
        id: Date.now(),
        reason: '浏览器保存',
        savedAt: timestamp,
        before,
        after: structuredClone(d.pool),
      });
      state.history = state.history.slice(0, 40);
      result = d.pool;
    } else if (route === '/draft' && body !== undefined) result = d.draft = draftSchema.parse(body);
    else if (route === '/pro/profile-save' && body !== undefined) {
      if (!same(profileSchema.parse(input.expected), d.profile)) conflict();
      d.profile = profileSchema.parse(input.profile);
      result = { saved: true };
    } else if (route === '/matches' && body !== undefined) {
      const saved = { ...matchSchema.parse(body), ...meta(), done: false };
      d.matches.unshift(saved);
      result = saved;
    } else if (['/match-update', '/match-check'].includes(route) && body !== undefined) {
      const old = d.matches.find((m) => m.id === input.id);
      if (!old || !same(old, input.expected)) conflict();
      const saved =
        route === '/match-update'
          ? {
              ...matchSchema.parse(input.match),
              id: old!.id,
              createdAt: old!.createdAt,
              done: old!.done,
            }
          : { ...old!, done: z.boolean().parse(input.done) };
      d.matches = d.matches.map((m) => (m.id === saved.id ? saved : m));
      result = saved;
    } else if (route === '/plans' && body !== undefined) {
      const draft = draftSchema.parse(input.draft),
        hero = heroById(input.heroId);
      const choice = recommend(draft, heroes, {
        profile: d.profile,
        snapshot: latestSnapshot(d.snapshots, draft.segment ?? '大众分段'),
      }).find((r) => r.hero.id === hero?.id);
      if (!hero || !choice) fail('阵容已变化，请重新选择当前候选');
      const note = noteFor(hero!);
      const saved = {
        ...meta(),
        name: z.string().trim().min(1).max(60).parse(input.name),
        draft,
        heroId: hero!.id,
        summary: [
          hero!.name + ' · ' + draft.role,
          ...choice!.reasons,
          '取舍：' + note.tradeoff,
          '下一局练习：' + note.drill,
        ].join('\n'),
      };
      d.plans.unshift(saved);
      result = saved;
    } else if (route === '/pro/snapshot' && body !== undefined) {
      const snapshot = snapshotSchema.parse(body);
      if (snapshot.rows.some((r) => !heroById(r.heroId)?.roles.includes(r.role)))
        fail('统计分路与公开目录不符');
      const saved = { ...snapshot, id: crypto.randomUUID(), importedAt: timestamp };
      d.snapshots.unshift(saved);
      result = saved;
    } else if (route === '/pro/snapshot-remove' && body !== undefined) {
      d.snapshots = d.snapshots.filter((s) => s.id !== input.id);
      result = { ok: true };
    } else if (route === '/pro/jungle' && body !== undefined) {
      const saved = { ...jungleSchema.parse(body), ...meta() };
      d.runs.unshift(saved);
      result = saved;
    } else if (route === '/pro/review-get' && body !== undefined) {
      changed = false;
      const old = d.reviews.find((r) => r.id === input.id);
      if (!old) fail('复盘不存在', 404);
      result = { ...old, revision: await sha(JSON.stringify(old)) };
    } else if (route === '/pro/review-save' && body !== undefined) {
      const old = d.reviews.find((r) => r.id === input.id);
      if (
        (input.id && !old) ||
        (old ? await sha(JSON.stringify(old)) : null) !== input.expectedRevision
      )
        conflict();
      const saved = {
        ...reviewSchema.parse(input.review),
        ...(old ? { id: old.id, createdAt: old.createdAt } : meta()),
      };
      d.reviews = [saved, ...d.reviews.filter((r) => r.id !== saved.id)];
      result = { ...saved, revision: await sha(JSON.stringify(saved)) };
    } else if (route === '/pro/review-remove' && body !== undefined) {
      d.reviews = d.reviews.filter((r) => r.id !== input.id);
      result = { ok: true };
    } else if (route === '/pro/bp-series') {
      if (body !== undefined) {
        if (input.owner !== 'browser' || input.expected !== state.seriesRevision) conflict();
        d.bpSeries = parseSeries(input.series);
        state.seriesRevision++;
      }
      result = {
        series: d.bpSeries,
        revision: state.seriesRevision,
        owner: 'browser',
        name: '当前浏览器',
      };
    } else if (route === '/backup' || route === '/backup/checkpoint') {
      const data = route.endsWith('checkpoint') ? state.checkpoint : d;
      if (!data) fail('暂无恢复前备份', 404);
      result = backupSchema.parse({
        format: 'kaiju-personal-backup-v1',
        exportedAt: timestamp,
        data,
      });
    } else if (['/backup/preview', '/backup/restore'].includes(route) && body !== undefined) {
      const backup = backupSchema.parse(input.backup);
      if (backupHeroIds(backup.data).some((id) => !heroById(id))) fail('备份包含不存在的英雄');
      const revision = await sha(JSON.stringify(d));
      if (route.endsWith('preview')) {
        changed = false;
        result = {
          revision,
          current: backupCounts(d),
          incoming: backupCounts(backup.data),
          scope: '当前浏览器独立空间',
        };
      } else {
        if (input.confirmed !== true || input.expectedRevision !== revision) conflict();
        state.checkpoint = structuredClone(d);
        state.data = {
          ...backup.data,
          bpSeries: backup.data.bpSeries === undefined ? d.bpSeries : backup.data.bpSeries,
        };
        state.seriesRevision++;
        result = { restored: true };
      }
    } else fail('固定在线版暂未提供这项服务；完整功能可运行作品包体验。', 503);
    if (changed) {
      state.revision = crypto.randomUUID();
      await write(state);
    }
    return structuredClone(result) as T;
  });
}
