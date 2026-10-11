import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { z, ZodError } from 'zod';
import { modelSchema, boundsSchema } from '../src/core/model.ts';
import { proposePatches, replay } from '../src/core/engine.ts';
import { solve } from './solver.ts';
import { generateCandidate, providerConfig } from './model-provider.ts';
import type { Store } from './store.ts';
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
async function body(req: IncomingMessage): Promise<unknown> {
  if (!req.headers['content-type']?.startsWith('application/json'))
    throw new HttpError(415, '请发送 JSON 格式的规则');
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 128 * 1024) throw new HttpError(413, '规则文件过大，最多支持 128 KB');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, '无法读取 JSON，请检查格式');
  }
}
export function createApp(store: Store, options: { dist?: string } = {}) {
  let busy = 0;
  const expensive = async <T>(fn: () => Promise<T>): Promise<T> => {
    if (busy >= 2) throw new HttpError(429, '已有实验正在运行，请稍后重试');
    busy++;
    try {
      return await fn();
    } finally {
      busy--;
    }
  };
  const server = createServer(async (req, res) => {
    const json = (status: number, value: unknown) => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify(value));
    };
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'",
    );
    try {
      const host = req.headers.host ?? '';
      if (!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host))
        throw new HttpError(403, '仅允许本机访问');
      const origin = req.headers.origin;
      if (
        origin &&
        !['http://' + host, 'http://127.0.0.1:4317', 'http://localhost:4317'].includes(origin)
      )
        throw new HttpError(403, '请求来源不受信任');
      const url = new URL(req.url ?? '/', 'http://' + host);
      const method = req.method;
      if (method === 'GET' && url.pathname === '/api/status')
        return json(200, {
          version: '0.1.0',
          modelConfigured: Boolean(providerConfig()),
          storage: 'sqlite',
        });
      if (method === 'GET' && url.pathname === '/api/projects') return json(200, store.projects());
      if (method === 'POST' && url.pathname === '/api/projects') {
        const data = z
          .object({ model: modelSchema, id: z.string().uuid().optional() })
          .strict()
          .parse(await body(req));
        return json(200, store.saveProject(data.model, data.id));
      }
      if (method === 'GET' && url.pathname === '/api/runs') return json(200, store.runs());
      if (method === 'GET' && /^\/api\/runs\/[a-zA-Z0-9-]+$/.test(url.pathname)) {
        const run = store.getRun(url.pathname.split('/').at(-1)!);
        if (!run) throw new HttpError(404, '未找到这次实验');
        return json(200, run);
      }
      if (method === 'POST' && url.pathname === '/api/analyze') {
        const data = z
          .object({
            model: modelSchema,
            bounds: boundsSchema.default({ maxDepth: 12, maxStates: 12000, maxMillis: 1500 }),
          })
          .strict()
          .parse(await body(req));
        const result = await expensive(() => solve(data.model, data.bounds));
        return json(200, store.saveRun(data.model, result));
      }
      if (method === 'POST' && url.pathname === '/api/repairs') {
        const data = z
          .object({ runId: z.string().uuid() })
          .strict()
          .parse(await body(req));
        const run = store.getRun(data.runId);
        if (!run) throw new HttpError(404, '原实验不存在，请重新验证');
        return json(
          200,
          await expensive(async () => {
            const comparisons = [];
            for (const patch of proposePatches(run.model, run.result)) {
              const result = await solve(patch.model, run.result.bounds);
              let oldTrace;
              try {
                oldTrace = { legal: true, ...replay(patch.model, run.result.actions) };
              } catch (error) {
                oldTrace = { legal: false, violates: false, message: (error as Error).message };
              }
              comparisons.push({ patch, result, oldTrace });
            }
            return comparisons;
          }),
        );
      }
      if (method === 'POST' && url.pathname === '/api/generate') {
        const data = z
          .object({ input: z.string().trim().min(10).max(12000) })
          .strict()
          .parse(await body(req));
        const config = providerConfig();
        if (!config) throw new HttpError(503, '尚未配置模型服务，仍可编辑规则、导入文件和运行实验');
        const candidate = await expensive(() => generateCandidate(data.input, config));
        store.saveGeneration(config.model, data.input, candidate);
        return json(200, candidate);
      }
      if (url.pathname.startsWith('/api/')) throw new HttpError(404, '接口不存在');
      if (method !== 'GET' && method !== 'HEAD') throw new HttpError(405, '不支持此操作');
      if (!options.dist) throw new HttpError(404, '前端尚未构建，请使用开发地址');
      const root = resolve(options.dist);
      let path = resolve(root, '.' + decodeURIComponent(url.pathname));
      if (path !== root && !path.startsWith(root + sep)) throw new HttpError(403, '文件路径无效');
      if (url.pathname === '/' || !extname(url.pathname)) path = resolve(root, 'index.html');
      let fileStat;
      try {
        fileStat = await stat(path);
      } catch {
        throw new HttpError(404, '文件不存在');
      }
      if (!fileStat.isFile()) throw new HttpError(404, '文件不存在');
      const types: Record<string, string> = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.json': 'application/json',
      };
      res.writeHead(200, {
        'Content-Type': types[extname(path)] ?? 'application/octet-stream',
        'Cache-Control': extname(path) === '.html' ? 'no-cache' : 'public, max-age=3600',
      });
      return res.end(method === 'HEAD' ? undefined : await readFile(path));
    } catch (error) {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (error instanceof ZodError)
        return json(400, {
          error:
            '规则校验失败：' +
            error.issues
              .slice(0, 3)
              .map((i) => i.message)
              .join('；'),
        });
      if (error instanceof HttpError) return json(error.status, { error: error.message });
      const message = error instanceof Error ? error.message : '';
      const publicError = /^(模型|验证)/.test(message) ? message : '服务暂时无法完成操作，请重试';
      return json(500, { error: publicError });
    }
  });
  server.requestTimeout = 35000;
  server.headersTimeout = 10000;
  return server;
}
