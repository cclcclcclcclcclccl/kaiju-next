import { readFile, stat } from 'node:fs/promises';
import { verifyEvidence } from '../server/evidence.ts';

try {
  const file = process.argv[2];
  if (!file) throw new Error('用法：node scripts/verify-evidence.mjs 实验凭证.json');
  if ((await stat(file)).size > 128 * 1024) throw new Error('凭证不能超过 128 KB');
  const result = verifyEvidence(JSON.parse(await readFile(file, 'utf8')));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error('凭证核验失败：' + error.message);
  process.exitCode = 1;
}
