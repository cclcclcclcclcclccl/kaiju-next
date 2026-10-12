import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { Hero } from '../../src/player/model.ts';
import type { Resources, ResourceResult, UpdateArticle } from '../../src/player/pro/resources.ts';
const EQUIPMENT = 'https://pvp.qq.com/web201605/js/item.json',
  SKINS = 'https://pvp.qq.com/zlkdatasys/heroskinlist.json';
const safeURL = z
  .string()
  .url()
  .refine((value) => {
    const u = new URL(value);
    return (
      u.protocol === 'https:' &&
      [
        'pvp.qq.com',
        'game.gtimg.cn',
        'apps.game.qq.com',
        'game-1255653016.file.myqcloud.com',
      ].includes(u.hostname) &&
      !u.username &&
      !u.password
    );
  });
export const resourceSchema = z
  .object({
    fetchedAt: z.string().datetime(),
    equipment: z
      .array(
        z.object({
          id: z.number().int().positive(),
          name: z.string().min(1),
          type: z.string(),
          price: z.number().int().nonnegative(),
          description: z.string(),
          source: safeURL,
        }),
      )
      .min(1)
      .max(500),
    skins: z
      .array(
        z.object({
          id: z.string().min(1),
          heroId: z.number().int().positive(),
          heroName: z.string().min(1),
          name: z.string().min(1),
          quality: z.string(),
          releasedOn: z.string(),
          description: z.string(),
          image: z.union([z.literal(''), safeURL]),
          source: safeURL,
        }),
      )
      .min(1)
      .max(5000),
    updates: z
      .array(
        z.object({
          id: z.number().int().positive(),
          title: z.string().min(1),
          publishedAt: z.string(),
          source: safeURL,
          environment: z.enum(['正式服', '体验服']),
          text: z.string(),
          heroIds: z.array(z.number().int().positive()),
          kind: z.enum(['版本公告', '官方资讯']),
        }),
      )
      .max(20),
    sources: z.array(safeURL),
    warnings: z.array(z.string()),
  })
  .refine(
    (d) =>
      new Set(d.equipment.map((e) => e.id)).size === d.equipment.length &&
      new Set(d.skins.map((s) => s.id)).size === d.skins.length,
    '目录存在重复记录',
  );
export const cleanText = (text: unknown) =>
  String(text ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(?:p|div|li)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .trim();
export function parseOfficialAssignment(text: string) {
  const match = text.trim().match(/^var\s+searchObj\s*=\s*([\s\S]*?)\s*;?$/);
  if (!match) throw new Error('公告格式异常');
  return JSON.parse(match[1]);
}
export function newsURL(now = Date.now()) {
  const time = String(Math.floor(now / 1000));
  // Public website's client-side request parameters, not a player credential.
  const sign = createHash('md5')
    .update('234ce0aef3020cb83887883877b64869' + 'web_pc18' + time)
    .digest('hex');
  return (
    'https://apps.game.qq.com/cmc/cross?' +
    new URLSearchParams({
      serviceId: '18',
      filter: 'channel',
      sortby: 'sIdxTime',
      source: 'web_pc',
      limit: '20',
      logic: 'or',
      typeids: '1',
      withtop: 'no',
      chanid: '1762',
      start: '0',
      exclusiveChannel: '4',
      exclusiveChannelSign: sign,
      time,
    })
  );
}
export async function fetchResources(
  heroes: Hero[],
  fetcher: typeof fetch = fetch,
): Promise<Resources> {
  const get = async (url: string) => {
    const r = await fetcher(url, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error('官方来源暂不可读');
    const raw = await r.text();
    if (raw.length > 5_000_000) throw new Error('官方响应过大');
    return raw;
  };
  const [itemText, skinText, newsText] = await Promise.all([
    get(EQUIPMENT),
    get(SKINS),
    get(newsURL()),
  ]);
  const itemRaw = JSON.parse(itemText),
    skinRaw = JSON.parse(skinText),
    newsRaw = JSON.parse(newsText);
  if (
    !Array.isArray(itemRaw) ||
    itemRaw.length < 30 ||
    !Array.isArray(skinRaw.pflb20_3469) ||
    skinRaw.pflb20_3469.length < 100 ||
    !Array.isArray(newsRaw.data?.items)
  )
    throw new Error('官方目录结构异常，保留旧资料');
  const types = ['', '攻击', '法术', '防御', '移动', '打野', '游走'];
  const equipment = itemRaw.map((x: any) => ({
    id: Number(x.item_id),
    name: cleanText(x.item_name),
    type: types[Number(x.item_type)] ?? '其他',
    price: Number(x.total_price),
    description: [cleanText(x.des1), cleanText(x.des2)].filter(Boolean).join('\n'),
    source: EQUIPMENT,
  }));
  if (
    equipment.some(
      (x: any) => !Number.isInteger(x.id) || !x.name || !Number.isFinite(x.price) || x.price < 0,
    )
  )
    throw new Error('装备字段异常');
  const warnings: string[] = [];
  const seen = new Set<string>(),
    officialIds = new Set<string>();
  const skins = skinRaw.pflb20_3469.flatMap((x: any) => {
    const hero = heroes.find((h) => h.name === x.yxmclb_9965);
    if (!hero) {
      warnings.push('皮肤英雄暂未映射：' + cleanText(x.yxmclb_9965));
      return [];
    }
    const id = String(x.pfidlb_3934) + ':' + hero.id + ':' + cleanText(x.pfmclb_7523);
    if (seen.has(id)) {
      warnings.push('已去除官方重复皮肤记录：' + cleanText(x.pfmclb_7523));
      return [];
    }
    seen.add(id);
    if (officialIds.has(String(x.pfidlb_3934)))
      warnings.push('官方 ID 对应多个皮肤，已按名称分开：' + cleanText(x.pfmclb_7523));
    officialIds.add(String(x.pfidlb_3934));
    const rawImage = String(x.fmlb_4536 ?? '').replace(/^\/\//, 'https://');
    let image = '';
    try {
      const u = new URL(rawImage);
      if (
        u.protocol === 'https:' &&
        ['game.gtimg.cn', 'game-1255653016.file.myqcloud.com'].includes(u.hostname)
      )
        image = u.href;
    } catch {}
    return [
      {
        id,
        heroId: hero.id,
        heroName: hero.name,
        name: cleanText(x.pfmclb_7523),
        quality: cleanText(x.pfpzlb_3289),
        releasedOn: String(x.sxsjlb_1516 ?? '').replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'),
        description: cleanText(x.yjhjsl_5003),
        image,
        source: SKINS,
      },
    ];
  });
  const rows = newsRaw.data.items
    .filter((x: any) => /^\d+$/.test(String(x.iId)) && typeof x.sTitle === 'string')
    .slice(0, 20);
  const relevant = rows.filter((x: any) => /版本|平衡|更新/.test(x.sTitle)).slice(0, 6);
  const detailResults = await Promise.allSettled(
    relevant.map(async (x: any) => {
      const raw = await get(
        `https://apps.game.qq.com/wmp/v3.1/public/searchNews.php?p0=18&source=web_pc&id=${x.iId}`,
      );
      const d = parseOfficialAssignment(raw);
      if (d.status !== 0 || !d.msg) throw new Error('公告正文不可读');
      return { id: Number(x.iId), text: cleanText(d.msg.sContent ?? d.msg.sDesc).slice(0, 30000) };
    }),
  );
  const details = new Map(
    detailResults.flatMap((r) =>
      r.status === 'fulfilled' ? [[r.value.id, r.value.text] as const] : [],
    ),
  );
  if (detailResults.some((r) => r.status === 'rejected'))
    warnings.push('部分公告正文未读取成功，仅展示标题与来源');
  const updates: UpdateArticle[] = rows.map((x: any) => {
    const text = details.get(Number(x.iId)) ?? '';
    return {
      id: Number(x.iId),
      title: cleanText(x.sTitle),
      publishedAt: String(x.sIdxTime),
      source: `https://pvp.qq.com/web201706/newsdetail.shtml?tid=${x.iId}`,
      environment: /体验服/.test(x.sTitle) ? '体验服' : '正式服',
      text,
      heroIds: heroes.filter((h) => (x.sTitle + '\n' + text).includes(h.name)).map((h) => h.id),
      kind: /版本|平衡|更新/.test(x.sTitle) ? '版本公告' : '官方资讯',
    };
  });
  return resourceSchema.parse({
    fetchedAt: new Date().toISOString(),
    equipment,
    skins,
    updates,
    sources: [
      EQUIPMENT,
      SKINS,
      'https://apps.game.qq.com/cmc/cross',
      'https://game.gtimg.cn/images/js/pvpcommon/api.js',
    ],
    warnings,
  });
}
export function createResources(
  heroes: Hero[],
  cacheDir: string,
  options: { fetcher?: typeof fetch; now?: () => number } = {},
) {
  const now = options.now ?? Date.now;
  let cache: Resources | undefined,
    pending: Promise<ResourceResult> | undefined,
    checked = 0;
  const file = resolve(cacheDir, 'resources.json');
  async function get(): Promise<ResourceResult> {
    if (!cache)
      try {
        const parsed = resourceSchema.parse(JSON.parse(await readFile(file, 'utf8')));
        if (Date.parse(parsed.fetchedAt) <= now() + 60000) cache = parsed;
      } catch {}
    if (cache && now() - Date.parse(cache.fetchedAt) < 15 * 60 * 1000)
      return { data: cache, stale: false };
    if (pending) return pending;
    if (checked && now() - checked < 60000) {
      if (cache)
        return { data: cache, stale: true, warning: '更新失败，保留上次成功资料；稍后自动重试' };
      throw new Error('来源暂不可用，请稍后再试');
    }
    checked = now();
    pending = (async () => {
      try {
        const fresh = await fetchResources(heroes, options.fetcher);
        await mkdir(cacheDir, { recursive: true });
        await writeFile(file + '.tmp', JSON.stringify(fresh));
        await rename(file + '.tmp', file);
        cache = fresh;
        return { data: fresh, stale: false };
      } catch (e) {
        if (cache)
          return {
            data: cache,
            stale: true,
            warning: '官方来源更新失败，正在展示上次成功资料，日期未改写',
          };
        throw e;
      } finally {
        pending = undefined;
      }
    })();
    return pending;
  }
  return { get };
}
