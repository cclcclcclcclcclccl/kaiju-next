import { z } from 'zod';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  snapshotSchema,
  profileSchema,
  reviewSchema,
  jungleSchema,
} from '../../src/player/pro/model.ts';
import type { Hero } from '../../src/player/model.ts';
import type { PlayerStore } from '../player/store.ts';
import { providerConfig } from '../player/provider.ts';
import { ocrReady, screenshotRequest, recognizeScreenshot } from './ocr.ts';
import { extractPublicTable } from '../../src/player/pro/publicTable.ts';
const credentials = z
  .object({
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9_]{3,24}$/),
    password: z.string().min(8).max(72),
    name: z.string().trim().min(1).max(24).optional(),
  })
  .strict();
const authAttempts = new Map<string, { count: number; until: number }>();
let modelBusy = false;
type Store = ReturnType<PlayerStore['forUser']>;
export async function proRoutes(ctx: {
  path: string;
  method: string | undefined;
  req: IncomingMessage;
  res: ServerResponse;
  root: PlayerStore;
  store: Store;
  user: ReturnType<PlayerStore['identity']['accountByToken']>;
  token: string;
  heroes: Hero[];
  body: (req: IncomingMessage, limit?: number) => Promise<any>;
  send: (status: number, value: unknown) => void;
}) {
  const { path, method, req, root, store, user, token, heroes, body, send } = ctx;
  const known = new Set(heroes.map((h) => h.id));
  const check = (ids: number[]) => {
    if (ids.some((id) => !known.has(id)))
      throw new z.ZodError([
        { code: 'custom', path: ['heroId'], message: '包含目录中不存在的英雄' },
      ]);
  };
  if (method === 'GET' && path === '/api/pro') {
    const p = store.pro();
    send(200, {
      ...p,
      reviews: p.reviews.map((r) => ({ ...r, events: r.events.map(({ frame, ...e }) => e) })),
    });
    return true;
  }
  if (method === 'GET' && path === '/api/social') {
    send(200, { user, friends: user ? root.identity.friends(user.id) : [] });
    return true;
  }
  if (method === 'GET' && path === '/api/pro/ocr-status') {
    send(200, { ready: ocrReady(), engine: 'RapidOCR 本地中文识别' });
    return true;
  }
  if (method !== 'POST') return false;
  if (path === '/api/pro/recognize-profile' || path === '/api/pro/recognize-stat-table') {
    const data = screenshotRequest.parse(await body(req, 12 * 1024 * 1024));
    try {
      const result = await recognizeScreenshot(data.image);
      send(
        200,
        path.endsWith('recognize-stat-table') ? extractPublicTable(result, heroes) : result,
      );
    } catch (e) {
      send(503, { error: (e as Error).message });
    }
    return true;
  }
  if (path === '/api/auth/register' || path === '/api/auth/login') {
    const data = credentials.parse(await body(req)),
      key = req.socket.remoteAddress ?? 'local',
      now = Date.now();
    const attempt = authAttempts.get(key);
    if (attempt && attempt.until > now && attempt.count >= 20) {
      send(429, { error: '登录尝试过于频繁，请一分钟后重试' });
      return true;
    }
    authAttempts.set(key, {
      count: attempt && attempt.until > now ? attempt.count + 1 : 1,
      until: attempt && attempt.until > now ? attempt.until : now + 60000,
    });
    try {
      send(
        200,
        path.endsWith('register')
          ? root.identity.register(data.username, data.name ?? data.username, data.password)
          : root.identity.login(data.username, data.password),
      );
    } catch (e) {
      send(400, { error: (e as Error).message });
    }
    return true;
  }
  if (path === '/api/auth/logout') {
    root.identity.logout(token);
    send(200, { ok: true });
    return true;
  }
  if (path.startsWith('/api/social/')) {
    if (!user) {
      send(401, { error: '先创建或登录开局账号，再添加好友' });
      return true;
    }
    try {
      if (path === '/api/social/request') {
        const d = z
          .object({ code: z.string().regex(/^[a-fA-F0-9]{10}$/) })
          .strict()
          .parse(await body(req));
        root.identity.request(user.id, d.code);
      } else if (path === '/api/social/respond') {
        const d = z
          .object({ id: z.string().uuid(), accept: z.boolean() })
          .strict()
          .parse(await body(req));
        root.identity.respond(user.id, d.id, d.accept);
      } else if (path === '/api/social/remove') {
        const d = z
          .object({ id: z.string().uuid() })
          .strict()
          .parse(await body(req));
        root.identity.remove(user.id, d.id);
      } else return false;
      send(200, { user, friends: root.identity.friends(user.id) });
    } catch (e) {
      if (e instanceof z.ZodError) throw e;
      send(400, { error: (e as Error).message });
    }
    return true;
  }
  if (path === '/api/pro/jungle') {
    const d = jungleSchema.parse(await body(req));
    check([d.heroId]);
    send(201, store.addRun(d));
    return true;
  }
  if (path === '/api/pro/profile') {
    const d = profileSchema.parse(await body(req));
    check(d.heroes.map((h) => h.heroId));
    send(200, store.profile(d));
    return true;
  }
  if (path === '/api/pro/snapshot') {
    const d = snapshotSchema.parse(await body(req, 1024 * 1024));
    check(d.rows.map((h) => h.heroId));
    for (const row of d.rows)
      if (!heroes.find((h) => h.id === row.heroId)?.roles.includes(row.role))
        throw new z.ZodError([
          { code: 'custom', path: ['rows'], message: '统计分路与公开目录不符，请核对导入列' },
        ]);
    send(201, store.addSnapshot(d));
    return true;
  }
  if (path === '/api/pro/snapshot-remove') {
    const d = z
      .object({ id: z.string().uuid() })
      .strict()
      .parse(await body(req));
    send(200, store.removeSnapshot(d.id));
    return true;
  }
  if (path === '/api/pro/review') {
    const raw = await body(req, 12 * 1024 * 1024);
    const { id, ...input } = z
      .object({ id: z.string().uuid().optional() })
      .passthrough()
      .parse(raw);
    const d = reviewSchema.parse(input);
    check([d.heroId]);
    const r = store.addReview(d, id);
    if (!r) send(404, { error: '复盘不存在或不属于当前账号' });
    else send(id ? 200 : 201, { ...r, events: r.events.map(({ frame, ...e }) => e) });
    return true;
  }
  if (path === '/api/pro/review-remove') {
    const d = z
      .object({ id: z.string().uuid() })
      .strict()
      .parse(await body(req));
    store.removeReview(d.id);
    send(200, { ok: true });
    return true;
  }
  if (path === '/api/pro/review-get') {
    const d = z
      .object({ id: z.string().uuid() })
      .strict()
      .parse(await body(req));
    const r = store.pro().reviews.find((r) => r.id === d.id);
    send(r ? 200 : 404, r ?? { error: '复盘不存在' });
    return true;
  }
  if (path === '/api/pro/review-analyze') {
    const d = reviewSchema.parse(await body(req, 12 * 1024 * 1024));
    check([d.heroId]);
    const config = providerConfig();
    if (!config) {
      send(503, { error: '尚未连接视觉模型。视频播放、关键帧标注与证据检查可以直接使用。' });
      return true;
    }
    if (modelBusy) {
      send(429, { error: '另一个复盘正在分析，请稍后重试' });
      return true;
    }
    const events = d.events.filter((e) => e.frame).slice(0, 6);
    if (!events.length) {
      send(400, { error: '请先从视频截取至少一个关键帧' });
      return true;
    }
    const endpoint = new URL(config.baseUrl.replace(/\/$/, '') + '/chat/completions');
    if (
      endpoint.protocol !== 'https:' &&
      !(
        endpoint.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)
      )
    )
      throw new Error('模型地址无效');
    modelBusy = true;
    try {
      const content: any[] = [
        {
          type: 'text',
          text: JSON.stringify({
            hero: heroes.find((h) => h.id === d.heroId),
            events: events.map(({ frame, ...e }) => e),
          }),
        },
      ];
      for (const e of events)
        content.push(
          { type: 'text', text: '关键帧 ' + e.id + ' / ' + e.second + ' 秒' },
          { type: 'image_url', image_url: { url: e.frame } },
        );
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + config.key, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(45000),
        body: JSON.stringify({
          model: config.model,
          max_tokens: 2500,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                '你是王者荣耀复盘教练。只使用提供的画面和带时间戳的用户标注，区分画面观察与用户描述，不猜测战争迷雾、队友意图、画面之外的经济或技能状态，不因胜败倒推决策好坏。必须为每个建议绑定一个给定 eventId，指出证据不足之处。截图只能支持局部分析，不代表已观看整局录像。输出严格 JSON：{"findings":[{"eventId":"原ID","observation":"可见证据及来源","advice":"下一次可执行的替代选择","uncertainty":"无法确定的内容"}]}。',
            },
            { role: 'user', content },
          ],
        }),
      });
      if (!r.ok) throw new Error('模型服务失败');
      const out = await r.json();
      const schema = z
        .object({
          findings: z
            .array(
              z
                .object({
                  eventId: z.string().uuid(),
                  observation: z.string().min(1).max(800),
                  advice: z.string().min(1).max(800),
                  uncertainty: z.string().min(1).max(500),
                })
                .strict(),
            )
            .min(1)
            .max(12),
        })
        .strict();
      const parsed = schema.parse(JSON.parse(out.choices[0].message.content));
      if (parsed.findings.some((f) => !events.some((e) => e.id === f.eventId)))
        throw new Error('模型引用了不存在的关键帧');
      send(200, { ...parsed, model: config.model, scope: '仅所选关键帧，不能视为完整视频理解' });
    } catch {
      send(502, { error: '视觉模型未完成有效分析；请核对所配置模型是否支持图片，或稍后重试' });
    } finally {
      modelBusy = false;
    }
    return true;
  }
  return false;
}
