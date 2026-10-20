// Independent public instance. Never reads .env or the owner's SQLite database.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const data = path.join(root, 'data/public-site');
fs.mkdirSync(data, { recursive: true });
let child,
  stopping = false,
  restarts = 0;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    stopping = true;
    child?.kill();
  });
while (!stopping) {
  const config = JSON.parse(fs.readFileSync(path.join(data, 'config.json'), 'utf8'));
  child = spawn(process.execPath, ['server/index.ts'], {
    cwd: root,
    windowsHide: true,
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: '4320',
      PLAYER_DATA_DIR: data,
      KAIJU_PUBLIC_ORIGIN: config.origin,
      KAIJU_TRUSTED_PROXY: 'cloudflare',
      RANK_AUTO_REFRESH: '0',
      MODEL_BASE_URL: '',
      MODEL_API_KEY: '',
      MODEL_NAME: '',
    },
  });
  fs.writeFileSync(
    path.join(data, 'service.json'),
    JSON.stringify(
      {
        supervisorPid: process.pid,
        serverPid: child.pid,
        port: 4320,
        origin: config.origin,
        dataDirectory: data,
        startedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  const code = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', resolve);
  });
  if (stopping || code === 0 || ++restarts > 3) break;
  await pause(restarts * 1000);
}
