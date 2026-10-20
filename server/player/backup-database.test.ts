import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPlayerStore } from './store.ts';
import { backupDatabase } from './backupDatabase.ts';

test('online database backup preserves committed account pools, verifies integrity and refuses overwrite', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'kaiju-backup-'));
  const source = join(folder, 'source.sqlite'),
    target = join(folder, 'backup.sqlite');
  const store = createPlayerStore(source);
  try {
    const account = store.identity.register('backup_user', '验收', 'test-password-only');
    store.forUser(account.user.id).pool([{ heroId: 544, level: 'main' }]);
    const report = await backupDatabase(source, target);
    assert.equal(report.integrity, 'ok');
    const copied = createPlayerStore(target);
    try {
      assert.deepEqual(copied.forUser(account.user.id).workspace().pool, [
        { heroId: 544, level: 'main' },
      ]);
      copied.forUser(account.user.id).pool([]);
      assert.equal(store.forUser(account.user.id).workspace().pool.length, 1);
    } finally {
      copied.close();
    }
    const bytes = await readFile(target);
    await assert.rejects(backupDatabase(source, target), /EEXIST/);
    assert.deepEqual(await readFile(target), bytes);
    await assert.rejects(backupDatabase(source, source), /覆盖/);
  } finally {
    store.close();
    await rm(folder, { recursive: true, force: true });
  }
});
