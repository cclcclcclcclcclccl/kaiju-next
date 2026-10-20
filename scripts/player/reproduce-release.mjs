import { cpSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const base = 'http://127.0.0.1:' + port;
const root = resolve('.reproduction', 'audit-' + Date.now());
const output = resolve(process.argv[2] ?? 'evidence/final-audit-v016');
const expectedVersion = JSON.parse(readFileSync('package.json', 'utf8')).version;
mkdirSync(root, { recursive: true });
mkdirSync(output, { recursive: true });
for (const name of [
  'src',
  'server',
  'public',
  'scripts',
  'examples',
  'tests',
  'playwright.config.ts',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'vite.config.ts',
  'index.html',
])
  cpSync(name, join(root, name), { recursive: true });
const logs = [];
async function run(args) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, windowsHide: true, env: process.env });
    child.stdout.on('data', (b) => logs.push(b.toString()));
    child.stderr.on('data', (b) => logs.push(b.toString()));
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(Error(args.join(' ') + ' exited ' + code)),
    );
  });
}
const started = Date.now();
let server;
try {
  const npm =
    process.platform === 'win32'
      ? join(process.execPath, '..', 'node_modules/npm/bin/npm-cli.js')
      : process.env.npm_execpath;
  if (!npm) throw Error('Run with npm on this platform');
  await run([npm, 'ci', '--no-audit', '--no-fund']);
  await run(['node_modules/typescript/bin/tsc', '--noEmit']);
  await run(['node_modules/vite/bin/vite.js', 'build']);
  server = spawn(process.execPath, ['server/index.ts'], {
    cwd: root,
    windowsHide: true,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      KAIJU_PUBLIC_ORIGIN: '',
      RENDER_EXTERNAL_URL: '',
      KAIJU_TRUSTED_PROXY: 'none',
      RANK_AUTO_REFRESH: '0',
      PLAYER_DATA_DIR: join(root, 'data'),
      MODEL_API_KEY: '',
      MODEL_NAME: '',
      MODEL_BASE_URL: '',
    },
  });
  server.stdout.on('data', (b) => logs.push(b.toString()));
  server.stderr.on('data', (b) => logs.push(b.toString()));
  let status;
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(base + '/api/status');
      if (r.ok) {
        status = await r.json();
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(status?.version, expectedVersion);
  assert.equal(status.heroCount, 133);
  const workspace = await (await fetch(base + '/api/workspace')).json();
  assert.deepEqual(workspace.pool, []);
  assert.deepEqual(workspace.matches, []);
  const result = {
    checkedAt: new Date().toISOString(),
    elapsedSeconds: Math.round((Date.now() - started) / 1000),
    freshInstall: true,
    freshBuild: true,
    freshDatabase: true,
    status,
    node: process.version,
    sourceDirectory: root,
    note: 'Core local startup verified; OCR model installation and external data availability are separate prerequisites.',
  };
  writeFileSync(join(output, 'reproduction.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  server?.kill();
  writeFileSync(join(output, 'reproduction-log.txt'), logs.join(''));
}
