import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createStore } from './store.ts';
import { createApp } from './app.ts';
const dataDir = resolve(process.env.HENGJU_DATA_DIR ?? 'data'); mkdirSync(dataDir, { recursive: true });
const store = createStore(resolve(dataDir, 'hengju.sqlite'));
const server = createApp(store, { dist: resolve('dist') });
const port = Number(process.env.PORT ?? 4318);
server.listen(port, '127.0.0.1', () => console.log('衡局已启动：http://127.0.0.1:' + port));
server.on('error', error => { console.error('启动失败：' + error.message); store.close(); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => { store.close(); process.exit(0); }));
}
