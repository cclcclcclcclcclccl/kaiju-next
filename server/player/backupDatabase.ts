import { DatabaseSync, backup } from 'node:sqlite';
import { open, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';

// SQLite online backup includes committed WAL data. A raw copy of the live .sqlite file does not.
export async function backupDatabase(source: string, destination: string) {
  source = resolve(source);
  destination = resolve(destination);
  if (source === destination) throw Error('备份路径不能覆盖源数据库');
  const db = new DatabaseSync(source, { readOnly: true });
  let reserved = false;
  try {
    await mkdir(dirname(destination), { recursive: true });
    const file = await open(destination, 'wx', 0o600);
    reserved = true;
    await file.close();
    await backup(db, destination);
    const copy = new DatabaseSync(destination, { readOnly: true });
    try {
      const result = copy.prepare('PRAGMA integrity_check').all();
      if (result.length !== 1 || result[0].integrity_check !== 'ok')
        throw Error('备份数据库完整性检查失败');
    } finally {
      copy.close();
    }
    const bytes = await readFile(destination);
    const report = {
      at: new Date().toISOString(),
      file: destination,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      integrity: 'ok',
    };
    await writeFile(destination + '.json', JSON.stringify(report, null, 2), {
      flag: 'wx',
      mode: 0o600,
    });
    return report;
  } catch (error) {
    if (reserved) await rm(destination, { force: true });
    throw error;
  } finally {
    db.close();
  }
}
