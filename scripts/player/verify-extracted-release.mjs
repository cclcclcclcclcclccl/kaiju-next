import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
const out = resolve('submission/release-v026');
const extraction = JSON.parse(readFileSync(join(out, 'extracted-verification.json'), 'utf8'));
const root = extraction.directory,
  logs = [],
  started = Date.now();
const npm = join(process.execPath, '..', 'node_modules/npm/bin/npm-cli.js');
async function run(args) {
  await new Promise((done, fail) => {
    const p = spawn(process.execPath, args, { cwd: root, windowsHide: true });
    p.stdout.on('data', (b) => logs.push(b.toString()));
    p.stderr.on('data', (b) => logs.push(b.toString()));
    p.on('error', fail);
    p.on('exit', (code) => (code === 0 ? done() : fail(Error('Command failed ' + args.join(' ')))));
  });
}
let server;
try {
  await run([npm, 'ci', '--no-audit', '--no-fund']);
  await run([npm, 'test']);
  await run([npm, 'run', 'build']);
  const probe = createServer();
  await new Promise((r) => probe.listen(0, '127.0.0.1', r));
  const port = probe.address().port;
  await new Promise((r) => probe.close(r));
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
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/status`);
      if (r.ok) {
        status = await r.json();
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(status?.version, '0.26.0');
  assert.equal(status.heroCount, 133);
  const workspace = await (await fetch(`http://127.0.0.1:${port}/api/workspace`)).json();
  assert.deepEqual(workspace.pool, []);
  assert.deepEqual(workspace.matches, []);
  assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200);
  const result = {
    ...extraction,
    checkedAt: new Date().toISOString(),
    elapsedSeconds: Math.round((Date.now() - started) / 1000),
    npmCi: true,
    coreTests: true,
    productionBuild: true,
    cleanDatabase: true,
    httpHome: 200,
    version: status.version,
    heroCount: status.heroCount,
    node: process.version,
    note: 'Existing Node/npm and dependency cache; excludes bare OS setup, OCR installation, external model service and future data source availability.',
  };
  writeFileSync(join(out, 'package-runtime-verification.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  server?.kill();
  writeFileSync(join(out, 'package-runtime-log.txt'), logs.join(''));
}
