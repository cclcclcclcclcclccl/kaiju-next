import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { recognizeScreenshot } from '../../server/pro/ocr.ts';
import { heroes } from '../../src/player/catalog.ts';
import { ROLES } from '../../src/player/model.ts';

// Produces a review file, never writes the player database or guesses selected tabs.
const [input, output] = process.argv.slice(2);
if (!input || !output)
  throw Error('用法：node scripts/player/read-public-table.mjs 截图路径 输出JSON路径');
const mime = { '.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg', '.webp': 'webp' }[
  path.extname(input).toLowerCase()
];
if (!mime) throw Error('仅支持 PNG/JPEG/WebP');
const bytes = fs.readFileSync(input);
if (bytes.length > 8 * 1024 * 1024) throw Error('截图不能超过 8 MB');
const result = await recognizeScreenshot(`data:image/${mime};base64,${bytes.toString('base64')}`);
const lines = result.lines.map((l) => ({
  ...l,
  x: l.box.reduce((s, p) => s + p[0], 0) / 4,
  y: l.box.reduce((s, p) => s + p[1], 0) / 4,
  height: Math.max(...l.box.map((p) => p[1])) - Math.min(...l.box.map((p) => p[1])),
}));
const labels = ['胜率', '出场率', '禁用率'];
const headerSets = lines
  .filter((l) => l.text.replace(/\s/g, '') === '胜率')
  .map((win) =>
    labels.map((label) =>
      lines.find((l) => l.text.replace(/\s/g, '') === label && Math.abs(l.y - win.y) < 20),
    ),
  )
  .filter((set) => set.every(Boolean));
if (headerSets.length !== 1)
  throw Error('没有唯一识别到胜率、出场率、禁用率三列表头。请截取含完整表头的页面。');
const headers = headerSets[0],
  start = Math.max(...headers.map((h) => h.y));
const clean = (s) => s.replace(/\s/g, '').replace(/[#＃]\d+$/, '');
const rows = [],
  rejected = [];
for (const name of lines.filter((l) => l.y > start && l.x < headers[0].x - 50)) {
  const h = heroes.find((h) => h.name === clean(name.text));
  if (!h) {
    if (/\.{2,}|…/.test(name.text))
      rejected.push({ text: name.text, reason: '英雄名被截断，需打开详情或完整显示后核对' });
    continue;
  }
  const candidates = headers.map((header) =>
    lines.filter(
      (l) =>
        l.y > start &&
        Math.abs(l.y - name.y) < Math.max(32, name.height * 1.7) &&
        Math.abs(l.x - header.x) < 38 &&
        /^\d+(?:\.\d+)?[%％]$/.test(l.text.replace(/\s/g, '')),
    ),
  );
  if (candidates.some((c) => c.length !== 1)) {
    rejected.push({ text: name.text, reason: '百分比列缺失或存在多义匹配' });
    continue;
  }
  const roleLines = lines.filter(
    (l) =>
      l.x < headers[0].x - 50 &&
      l.y > name.y &&
      l.y - name.y < Math.max(46, name.height * 2) &&
      ROLES.includes(l.text.trim()),
  );
  if (roleLines.length !== 1 || !h.roles.includes(roleLines[0].text.trim())) {
    rejected.push({ text: name.text, reason: '分路无法唯一确定，未按默认定位猜测' });
    continue;
  }
  const values = candidates.map((c) => Number(c[0].text.replace(/[%％\s]/g, '')));
  if (values.some((n) => n < 0 || n > 100)) {
    rejected.push({ text: name.text, reason: '英雄统计超出范围' });
    continue;
  }
  if (rows.some((r) => r.heroId === h.id && r.role === roleLines[0].text.trim())) {
    rejected.push({ text: name.text, reason: '重复行，请检查截图拼接' });
    continue;
  }
  rows.push({
    heroId: h.id,
    name: h.name,
    role: roleLines[0].text.trim(),
    winRate: values[0],
    pickRate: values[1],
    banRate: values[2],
    ocrConfidence: Math.min(name.confidence, ...candidates.map((c) => c[0].confidence)),
    evidence: [name.text, roleLines[0].text, ...candidates.map((c) => c[0].text)],
  });
}
const report = {
  createdAt: new Date().toISOString(),
  status: 'needs-review',
  sourceImage: path.basename(input),
  sha256: createHash('sha256').update(bytes).digest('hex'),
  engine: result.engine,
  dateText: lines.filter((l) => /\d{4}年\d+月\d+日/.test(l.text)).map((l) => l.text),
  rows,
  rejected,
  requiredMetadata: [
    '数据来源',
    '选中的分段（不从同时可见的标签猜测）',
    '数据日期与获取日期',
    '版本',
    '胜率人群与时间范围',
    '选禁分母',
  ],
  notes: [
    '数字为截图原始显示精度，不推算隐藏小数或场次',
    '未确认的元数据不能进入正式自研梯度',
    '这是识别后待核对文件，不是已完成同步',
  ],
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({
    output,
    rows: rows.length,
    rejected,
    records: rows.map(({ evidence, ocrConfidence, ...r }) => r),
  }),
);
