import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const folder = resolve('evidence/recovery-20261018');
const root = JSON.parse(readFileSync(join(folder, 'reproduction.json'), 'utf8')).sourceDirectory;
const data = join(root, 'launcher-test-data'),
  url = 'http://127.0.0.1:4322';
const logs = [];
let state;
const launch = () =>
  new Promise((accept, reject) => {
    const child = spawn(process.execPath, ['scripts/player/launch.mjs'], {
      cwd: root,
      windowsHide: true,
      env: {
        ...process.env,
        PORT: '4322',
        PLAYER_DATA_DIR: data,
        KAIJU_NO_BROWSER: '1',
        RANK_AUTO_REFRESH: '0',
      },
    });
    child.stdout.on('data', (b) => logs.push(String(b)));
    child.stderr.on('data', (b) => logs.push(String(b)));
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? accept() : reject(Error(logs.join('')))));
  });
try {
  await launch();
  state = JSON.parse(readFileSync(join(data, 'launcher.json'), 'utf8'));
  const first = state.serverPid;
  const save = await fetch(url + '/api/pool', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([{ heroId: 544, level: 'main' }]),
  });
  assert(save.ok);
  await launch();
  assert.equal(JSON.parse(readFileSync(join(data, 'launcher.json'), 'utf8')).serverPid, first);
  process.kill(first, 'SIGKILL');
  for (let n = 0; n < 80; n++) {
    await new Promise((r) => setTimeout(r, 250));
    state = JSON.parse(readFileSync(join(data, 'launcher.json'), 'utf8'));
    if (state.serverPid !== first) {
      try {
        const status = await fetch(url + '/api/status');
        if (status.ok) break;
      } catch {}
    }
  }
  assert.notEqual(state.serverPid, first);
  const workspace = await (await fetch(url + '/api/workspace')).json();
  assert.deepEqual(workspace.pool, [{ heroId: 544, level: 'main' }]);
  const result = {
    checkedAt: new Date().toISOString(),
    port: 4322,
    isolatedDirectory: root,
    initialStart: true,
    duplicateStartReused: true,
    unexpectedExitRecovered: true,
    isolatedPoolPreserved: true,
    firstPid: first,
    recoveredPid: state.serverPid,
    supervisorPid: state.supervisorPid,
  };
  writeFileSync(join(folder, 'launcher-verification.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  if (state) {
    try {
      process.kill(state.supervisorPid, 'SIGKILL');
    } catch {}
    try {
      process.kill(state.serverPid, 'SIGKILL');
    } catch {}
  }
  writeFileSync(join(folder, 'launcher-verification-log.txt'), logs.join(''));
}
