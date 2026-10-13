import fs from 'node:fs';
import path from 'node:path';
import { recognizeScreenshot } from '../../server/pro/ocr.ts';
import { extractPublicTable, mergePublicTables } from '../../src/player/pro/publicTable.ts';
import { heroes } from '../../src/player/catalog.ts';

// Maintainer tool for a visually verified continuous scroll of the SAME table.
// Original screenshots and OCR remain unchanged; only the parser coordinate context
// receives the first screen's column headers. Never use for unrelated screenshots.
const [folder] = process.argv.slice(2);
if (!folder) throw Error('Usage: node scripts/player/read-public-scroll.mjs capture-folder');
const files = fs
  .readdirSync(folder)
  .filter((f) => /^daily-page-\d{2}\.png$/.test(f))
  .sort();
if (!files.length || files[0] !== 'daily-page-00.png') throw Error('Missing first table screen');
const captures = [];
let first;
for (const fileName of files) {
  const ocrPath = path.join(folder, fileName.replace('.png', '.ocr.json'));
  const image = fs.readFileSync(path.join(folder, fileName));
  const ocr = await recognizeScreenshot('data:image/png;base64,' + image.toString('base64'));
  fs.writeFileSync(ocrPath, JSON.stringify(ocr, null, 2));
  if (!first) first = ocr;
  if (ocr.width !== 642 || ocr.height !== 1181) throw Error('Unverified window dimensions');
  const parsedInput =
    fileName === files[0]
      ? ocr
      : {
          ...ocr,
          lines: [
            ...first.lines
              .filter((l) => ['胜率', '出场率', '禁用率'].includes(l.text.trim()))
              .map((l) => ({ ...l, box: l.box.map(([x, y]) => [x, y - 580]) })),
            ...ocr.lines.filter((l) => l.box.every((p) => p[1] > 90 && p[1] < 1080)),
          ],
        };
  const result = extractPublicTable(parsedInput, heroes);
  // Date and selected segment are reviewed from the first screen, not inferred
  // from unrelated visible labels in scrolled content.
  captures.push({ ...result, fileName });
  console.log(fileName, result.rows.length, 'rows;', result.rejected.length, 'rejected');
}
const merged = mergePublicTables(captures);
const report = {
  status: 'needs-visual-review',
  capturedOn: new Date().toISOString(),
  headerSource: { file: files[0], sha256: first.sha256 },
  geometry: { width: 642, height: 1181, bodyY: [90, 1080], headerOffsetY: -580 },
  notes: [
    'Headers inherited only from the visually reviewed continuous scroll session',
    'No role expansion or sample counts invented; source snapshots remain unmodified',
  ],
  captures,
  merged,
};
fs.writeFileSync(path.join(folder, 'scroll-extraction.json'), JSON.stringify(report, null, 2));
console.log(
  'Unique rows:',
  merged.rows.length,
  'conflicts:',
  merged.rows.filter((r) => r.variants.length > 1).length,
);
