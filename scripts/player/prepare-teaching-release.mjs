import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { DatabaseSync, backup } from 'node:sqlite';
const dir = 'evidence/teaching-v024';
await fs.mkdir(dir, { recursive: true });
const get = async (p) => {
  const r = await fetch('http://127.0.0.1:4318/api/' + p, { signal: AbortSignal.timeout(5000) });
  assert.equal(r.status, 200);
  return r.json();
};
const before = { workspace: await get('workspace'), pro: await get('pro') };
await fs.writeFile(dir + '/before.json', JSON.stringify(before, null, 2), { flag: 'wx' });
await fs.mkdir('data/teaching-v024-before', { recursive: true });
const db = new DatabaseSync('data/kaiju.sqlite', { readOnly: true });
try {
  await backup(db, 'data/teaching-v024-before/kaiju.sqlite');
} finally {
  db.close();
}
for (const file of ['package.json', 'package-lock.json', 'server/player/app.ts']) {
  const text = await fs.readFile(file, 'utf8');
  await fs.writeFile(file, text.replaceAll('0.23.0', '0.24.0'));
}
const app = 'src/player/App.tsx';
await fs.writeFile(
  app,
  (await fs.readFile(app, 'utf8')).replace('<small>v0.23</small>', '<small>v0.24</small>'),
);
console.log(
  'Personal state and SQLite backed up; release versions set to 0.24.0. Pool:',
  before.workspace.pool,
);
