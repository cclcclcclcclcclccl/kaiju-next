import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const name = 'kaiju-ci-' + process.pid;
const volume = name + '-data';
const origin = 'https://review.example.com';
const base = 'http://127.0.0.1:4329';
async function ready() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(base + '/api/status'); if (r.ok) return await r.json(); } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw Error('Container did not become ready');
}
async function api(path, body, token) {
  const r = await fetch(base + '/api/' + path, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert.equal(r.status, 200);
  return r.json();
}
try {
  docker('volume', 'create', volume);
  docker('run', '-d', '--name', name, '-p', '127.0.0.1:4329:4320', '-v', volume + ':/var/lib/kaiju', '-e', 'KAIJU_PUBLIC_ORIGIN=' + origin, '-e', 'RANK_AUTO_REFRESH=0', 'kaiju-review');
  assert.equal((await ready()).publicSharing, true);
  const auth = await api('auth/register', { username: 'container_test', name: 'CI test', password: 'isolated-ci-password' });
  await api('pool', [{ heroId: 544, level: 'main' }], auth.token);
  docker('restart', name);
  await ready();
  const login = await api('auth/login', { username: 'container_test', password: 'isolated-ci-password' });
  assert.equal((await api('workspace', undefined, login.token)).pool[0].heroId, 544);
  assert.deepEqual((await api('workspace')).pool, []);
  console.log('Container startup, registration, persistent pool after restart and visitor isolation passed.');
} finally {
  try { docker('logs', name); } catch {}
  try { docker('rm', '-f', name); } catch {}
  try { docker('volume', 'rm', volume); } catch {}
}
