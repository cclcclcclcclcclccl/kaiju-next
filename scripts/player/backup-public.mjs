import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { backupDatabase } from '../../server/player/backupDatabase.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const directory = path.resolve(process.env.PLAYER_DATA_DIR ?? path.join(root, 'data/public-site'));
const folder = path.resolve(process.env.KAIJU_BACKUP_DIR ?? path.join(directory, 'backups'));
const stamp = new Date().toISOString().replaceAll(':', '-');
const result = await backupDatabase(
  path.join(directory, 'kaiju.sqlite'),
  path.join(folder, 'kaiju-' + stamp + '-' + randomUUID().slice(0, 8) + '.sqlite'),
);
console.log(JSON.stringify(result, null, 2));
