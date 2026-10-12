import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPlayerStore } from './player/store.ts';
import { createPlayerApp } from './player/app.ts';
import type { Hero } from '../src/player/model.ts';
const dataDir = resolve(process.env.PLAYER_DATA_DIR ?? 'data');
mkdirSync(dataDir, { recursive: true });
const heroes = JSON.parse(
  readFileSync(new URL('../src/player/data/heroes.json', import.meta.url), 'utf8'),
).heroes as Hero[];
const store = createPlayerStore(resolve(dataDir, 'kaiju.sqlite'));
const server = createPlayerApp(store, heroes, { dist: resolve('dist') });
const port = Number(process.env.PORT ?? 4318);
server.listen(port, '127.0.0.1', () => console.log('开局 NEXT 已启动：http://127.0.0.1:' + port));
server.on('error', (error) => {
  console.error(error.message);
  store.close();
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () =>
    server.close(() => {
      store.close();
      process.exit(0);
    }),
  );
