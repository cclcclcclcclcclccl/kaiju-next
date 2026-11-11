// Serve the prebuilt review site with Node alone; no npm install or accounts.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve(process.argv[2] ?? 'dist-review');
const port = Number(process.env.REVIEW_PORT ?? 4319);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};
await stat(resolve(root, 'index.html'));
const server = createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (path === '/') {
      res.writeHead(302, { Location: '/kaiju-next/' });
      return res.end();
    }
    if (!path.startsWith('/kaiju-next/') || path.includes('\\')) throw Error();
    let file = resolve(root, path.slice('/kaiju-next/'.length) || 'index.html');
    if (!file.startsWith(root + sep)) throw Error();
    if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
    const bytes = await readFile(file);
    res.writeHead(200, {
      'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});
server.on('error', (e) => {
  console.error(e.message);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () =>
  console.log(`Review site: http://127.0.0.1:${server.address().port}/kaiju-next/`),
);
