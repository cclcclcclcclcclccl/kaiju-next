import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPlayerStore } from './player/store.ts';
import { createPlayerApp } from './player/app.ts';
import type { Hero } from '../src/player/model.ts';
import { createOfficialRanks } from './pro/official.ts';
import { createResources } from './pro/resources.ts';
import { createRankRefresh, scheduleRankRefresh } from './pro/refresh.ts';
import { createTianyuan, scheduleTianyuan } from './pro/tianyuan.ts';
import { createKplCases } from './pro/kpl.ts';
import { createSourcePlus } from './pro/sourcePlus.ts';
import { proxyMode } from './player/access.ts';
const dataDir = resolve(process.env.PLAYER_DATA_DIR ?? 'data');
const publicOrigin = process.env.KAIJU_PUBLIC_ORIGIN || process.env.RENDER_EXTERNAL_URL;
const host = process.env.HOST ?? '127.0.0.1';
if (!['127.0.0.1', '0.0.0.0'].includes(host)) throw Error('HOST must be 127.0.0.1 or 0.0.0.0');
if (host === '0.0.0.0' && !publicOrigin)
  throw Error('外部监听必须配置 HTTPS 公网来源和独立数据目录');
if (publicOrigin && dataDir === resolve('data'))
  throw Error('公网服务必须使用独立 PLAYER_DATA_DIR，禁止公开本机个人数据库');
mkdirSync(dataDir, { recursive: true });
const heroes = JSON.parse(
  readFileSync(new URL('../src/player/data/heroes.json', import.meta.url), 'utf8'),
).heroes as Hero[];
const store = createPlayerStore(resolve(dataDir, 'kaiju.sqlite'));
const resources = createResources(heroes, resolve(dataDir, 'public-resources'));
const officialRanks = createOfficialRanks({ cacheDir: resolve(dataDir, 'official-ranks') });
const rankRefresh = createRankRefresh(officialRanks, resolve(dataDir, 'official-rank-history'));
const tianyuan = createTianyuan({
  directory: resolve(dataDir, 'tianyuan'),
  heroIds: heroes.map((h) => h.id),
});
// Refresh only while this local service is running; failures preserve original timestamps.
const refreshTimer = setInterval(() => void resources.get().catch(() => {}), 15 * 60 * 1000);
refreshTimer.unref();
const server = createPlayerApp(store, heroes, {
  dist: resolve('dist'),
  officialRanks,
  rankRefresh,
  resources,
  tianyuan,
  sourcePlus: createSourcePlus(resolve(dataDir, 'tianyuan-plus')),
  kplCases: createKplCases(resolve(dataDir, 'kpl')),
  publicOrigin,
  trustedProxy: proxyMode(process.env.KAIJU_TRUSTED_PROXY),
});
const port = Number(process.env.PORT ?? 4318);
let stopRefresh: (() => void) | undefined;
let stopTianyuan: (() => void) | undefined;
server.listen(port, host, () => {
  console.log('自在弈境 已启动：http://' + host + ':' + port);
  if (process.env.RANK_AUTO_REFRESH !== '0') {
    stopRefresh = scheduleRankRefresh(rankRefresh);
    stopTianyuan = scheduleTianyuan(tianyuan);
  }
});
server.on('error', (error) => {
  console.error(error.message);
  stopRefresh?.();
  stopTianyuan?.();
  clearInterval(refreshTimer);
  store.close();
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    stopRefresh?.();
    stopTianyuan?.();
    clearInterval(refreshTimer);
    server.close(() => {
      store.close();
      process.exit(0);
    });
  });
