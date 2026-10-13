import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { heroes } from '../../src/player/catalog.ts';
import { extractPublicTable, mergePublicTables } from '../../src/player/pro/publicTable.ts';
import {
  withPublicReference,
  publicReference,
  previousPublicReference,
  publicReferences,
} from '../../src/player/pro/publicReferences.ts';
import type { OcrData } from '../../src/player/pro/screenshot.ts';
const fixture = () =>
  JSON.parse(readFileSync('tests/fixtures/tianyuan-table-ocr.json', 'utf8')) as OcrData;
test('real public screenshot yields exact displayed percentages, excludes truncated hero and distinguishes update date', () => {
  const r = extractPublicTable(fixture(), heroes);
  assert.equal(r.rows.length, 4);
  assert.deepEqual(
    r.rows.map((x) => [x.name, x.winRate, x.pickRate, x.banRate]),
    [
      ['鲁班大师', 52.1, 11.7, 84.5],
      ['盾山', 53.9, 7.9, 87],
      ['海月', 50.3, 5.9, 86.8],
      ['少司缘', 51.1, 32.3, 48.6],
    ],
  );
  assert.deepEqual(r.dataDates, ['2026-10-11']);
  assert(r.rejected.some((x) => x.text.includes('元流之子')));
  assert(r.rows.every((x) => !('games' in x)));
});
test('public table geometry scales with resolution and ambiguous headers or cells are rejected', () => {
  const original = fixture();
  const scaled = {
    ...original,
    width: original.width * 2,
    height: original.height * 2,
    lines: original.lines.map((l) => ({ ...l, box: l.box.map((p) => p.map((v) => v * 2)) })),
  };
  assert.deepEqual(
    extractPublicTable(original, heroes).rows,
    extractPublicTable(scaled, heroes).rows,
  );
  assert.throws(
    () =>
      extractPublicTable(
        { ...original, lines: original.lines.filter((l) => l.text !== '胜率') },
        heroes,
      ),
    /表头/,
  );
  const missing = { ...original, lines: original.lines.filter((l) => l.text !== '84.5%') };
  assert(!extractPublicTable(missing, heroes).rows.some((r) => r.name === '鲁班大师'));
  const duplicated = {
    ...original,
    lines: [...original.lines, original.lines.find((l) => l.text === '84.5%')!],
  };
  assert(!extractPublicTable(duplicated, heroes).rows.some((r) => r.name === '鲁班大师'));
});
test('batch merger deduplicates identical files and rows, retains conflicts and does not hide date differences', () => {
  const a = { ...extractPublicTable(fixture(), heroes), fileName: 'one.png' };
  const b = structuredClone(a);
  b.fileName = 'two.png';
  let r = mergePublicTables([a, b]);
  assert.equal(r.duplicateFiles, 1);
  assert.equal(r.rows.length, 4);
  b.sha256 = 'b'.repeat(64);
  r = mergePublicTables([a, b]);
  assert.equal(r.duplicateRows, 4);
  assert.equal(r.rows[0].variants.length, 1);
  b.rows[0].winRate = 49.1;
  b.dataDates = ['2026-10-12'];
  r = mergePublicTables([a, b]);
  assert.equal(r.rows[0].variants.length, 2);
  assert.deepEqual(r.dataDates, ['2026-10-11', '2026-10-12']);
  assert.equal(a.rows[0].winRate, 52.1);
});
test('public reference remains selectable without writing data or replacing an existing same-segment batch', () => {
  const existing: any[] = [];
  assert.equal(withPublicReference(existing).length, 2);
  assert.equal(existing.length, 0);
  assert.equal(publicReference.rows.length, 96);
  assert.equal(previousPublicReference.rows.length, 100);
  assert.equal(publicReference.endDate, '2026-10-12');
  const owned = { ...publicReference, id: 'owned' };
  assert.deepEqual(withPublicReference([owned]), [owned, ...publicReferences]);
  assert.deepEqual(withPublicReference([publicReference]), [
    publicReference,
    previousPublicReference,
  ]);
});
