import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { plusQuerySchema, plusUrl, parsePlus } from '../../src/player/pro/sourcePlus.ts';
import type { PlusQuery, PlusPacket } from '../../src/player/pro/sourcePlus.ts';
export function createSourcePlus(directory: string, fetcher: typeof fetch = fetch) {
  const active = new Map<string, Promise<PlusPacket>>();
  let queue: Promise<unknown> = Promise.resolve(),
    last = 0,
    lastMatch = 0;
  const retry = new Map<string, number>();
  const get = (input: PlusQuery) => {
    const q = plusQuerySchema.parse(input),
      url = plusUrl(q);
    if (q.date && q.date > new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10))
      throw Error('不可请求未来日期');
    const key = createHash('sha256').update(url).digest('hex');
    if (active.has(key)) return active.get(key)!;
    const task = (async () => {
      const file = join(directory, 'cache', key + '.json');
      let saved: PlusPacket | undefined;
      try {
        const s = JSON.parse(await readFile(file, 'utf8')) as PlusPacket;
        if (s.url === url) {
          s.data = parsePlus(s.data, q.kind);
          saved = s;
        }
      } catch {}
      const ttl = q.kind === 'codes' ? 15000 : q.kind === 'votes' ? 60000 : 3600000;
      if (
        saved &&
        Date.now() - Date.parse(saved.fetchedAt) >= 0 &&
        Date.now() - Date.parse(saved.fetchedAt) < ttl
      )
        return { ...saved, cache: 'cached' as const };
      try {
        if ((retry.get(key) ?? 0) > Date.now()) throw Error('来源暂不可用，请稍后重试');
        const request = queue.then(async () => {
          const wait = Math.max(
            0,
            1000 - (Date.now() - last),
            q.kind === 'matches' ? 5000 - (Date.now() - lastMatch) : 0,
          );
          if (wait) await new Promise((r) => setTimeout(r, wait));
          last = Date.now();
          if (q.kind === 'matches') lastMatch = last;
          const res = await fetcher(url, {
            headers: { Accept: 'application/json' },
            redirect: 'error',
            signal: AbortSignal.timeout(18000),
          });
          if (!res.ok) throw Error('来源 HTTP ' + res.status);
          const raw = await res.text();
          if (raw.length > 10 * 1024 * 1024) throw Error('来源响应过大');
          const data = parsePlus(JSON.parse(raw), q.kind),
            sha = createHash('sha256').update(raw).digest('hex');
          if (q.heroId && data.heroId !== undefined && Number(data.heroId) !== q.heroId)
            throw Error('来源英雄身份不匹配');
          if (q.date && data.date && String(data.date).slice(0, 10) !== q.date)
            throw Error('来源统计日期不匹配');
          const packet: PlusPacket = {
            source: '天元之弈数据站' + (q.kind === 'votes' ? '（上游：苏苏的荣耀助手）' : ''),
            sourceClass: 'third-party-public',
            url,
            query: q,
            fetchedAt: new Date().toISOString(),
            rawSha256: sha,
            cache: 'fresh',
            data,
          };
          await mkdir(join(directory, 'raw'), { recursive: true });
          await mkdir(join(directory, 'cache'), { recursive: true });
          await writeFile(join(directory, 'raw', sha + '.json'), raw);
          const tmp = file + '.' + randomUUID() + '.tmp';
          await writeFile(tmp, JSON.stringify(packet));
          await rename(tmp, file);
          return packet;
        });
        queue = request.catch(() => {});
        return await request;
      } catch (e) {
        retry.set(key, Date.now() + 30000);
        if (saved)
          return {
            ...saved,
            cache: 'stale' as const,
            warning: '本次更新失败，显示同一查询的旧缓存：' + (e as Error).message,
          };
        throw e;
      }
    })().finally(() => active.delete(key));
    active.set(key, task);
    return task;
  };
  return { get };
}
