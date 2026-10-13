import fs from 'node:fs';
import path from 'node:path';
import { recognizeScreenshot } from '../../server/pro/ocr.ts';
import { heroes } from '../../src/player/catalog.ts';
import { extractPublicTable } from '../../src/player/pro/publicTable.ts';
const [input, output] = process.argv.slice(2);
if (!input || !output)
  throw Error('用法：node scripts/player/read-public-table.mjs 截图路径 输出JSON路径');
const mime = { '.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg', '.webp': 'webp' }[
  path.extname(input).toLowerCase()
];
if (!mime) throw Error('仅支持 PNG/JPEG/WebP');
const bytes = fs.readFileSync(input);
if (bytes.length > 8 * 1024 * 1024) throw Error('截图不能超过 8 MB');
const result = extractPublicTable(
  await recognizeScreenshot(`data:image/${mime};base64,${bytes.toString('base64')}`),
  heroes,
);
const report = {
  createdAt: new Date().toISOString(),
  status: 'needs-review',
  sourceImage: path.basename(input),
  ...result,
  requiredMetadata: [
    '数据来源',
    '所选分段',
    '数据日期与获取日期',
    '版本',
    '胜率人群与时间范围',
    '选禁分母',
  ],
  notes: [
    '这是截图识别后待核对文件，未写入玩家数据库',
    '不从同时可见的标签猜测选中分段，不补隐藏小数或场次',
  ],
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, rows: result.rows.length, rejected: result.rejected }));
