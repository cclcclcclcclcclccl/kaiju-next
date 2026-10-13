import { ROLES } from '../model.ts';
import type { Hero, Role } from '../model.ts';
import type { OcrData } from './screenshot.ts';
export type PublicRow = {
  heroId: number;
  name: string;
  role: Role;
  winRate: number;
  pickRate: number;
  banRate: number;
  ocrConfidence: number;
  evidence: string[];
};
export type PublicTable = {
  sha256: string;
  engine: string;
  rows: PublicRow[];
  rejected: { text: string; reason: string }[];
  dateText: string[];
  dataDates: string[];
};
export function extractPublicTable(result: OcrData, heroes: Hero[]): PublicTable {
  const lines = result.lines.map((l) => ({
    ...l,
    x: l.box.reduce((s, p) => s + p[0], 0) / 4,
    y: l.box.reduce((s, p) => s + p[1], 0) / 4,
    height: Math.max(...l.box.map((p) => p[1])) - Math.min(...l.box.map((p) => p[1])),
  }));
  const scale = result.width / 644,
    labels = [['胜率'], ['出场率', '登场率'], ['禁用率', '禁选率']];
  const headers = lines
    .filter((l) => l.text.replace(/\s/g, '') === '胜率')
    .map((win) =>
      labels.map((aliases) =>
        lines.filter(
          (l) =>
            aliases.includes(l.text.replace(/\s/g, '')) &&
            Math.abs(l.y - win.y) < Math.max(12 * scale, win.height),
        ),
      ),
    )
    .filter((set) => set.every((c) => c.length === 1));
  if (headers.length !== 1)
    throw Error('没有唯一识别到胜率、出场率、禁用率表头。每张截图都需保留完整表头。');
  const columns = headers[0].map((c) => c[0]);
  if (!(columns[0].x < columns[1].x && columns[1].x < columns[2].x))
    throw Error('表格列顺序未识别，请保留英雄、胜率、出场率、禁用率顺序。');
  const top = Math.max(...columns.map((h) => h.y)),
    clean = (s: string) => s.replace(/\s/g, '').replace(/[#＃]\d+$/, '');
  const rows: PublicRow[] = [],
    rejected: PublicTable['rejected'] = [];
  for (const name of lines.filter((l) => l.y > top && l.x < columns[0].x - 50 * scale)) {
    const hero = heroes.find((h) => h.name === clean(name.text));
    if (!hero) {
      if (/\.{2,}|…/.test(name.text))
        rejected.push({ text: name.text, reason: '英雄名被截断，请完整显示后重新采集' });
      continue;
    }
    const cells = columns.map((header) =>
      lines.filter(
        (l) =>
          l.y > top &&
          Math.abs(l.y - name.y) < Math.max(32 * scale, name.height * 1.7) &&
          Math.abs(l.x - header.x) < 38 * scale &&
          /^\d+(?:\.\d+)?[%％]$/.test(l.text.replace(/\s/g, '')),
      ),
    );
    const roles = lines.filter(
      (l) =>
        l.x < columns[0].x - 50 * scale &&
        l.y > name.y &&
        l.y - name.y < Math.max(46 * scale, name.height * 2) &&
        ROLES.includes(l.text.trim() as Role),
    );
    if (
      cells.some((c) => c.length !== 1) ||
      roles.length !== 1 ||
      !hero.roles.includes(roles[0].text.trim())
    ) {
      rejected.push({ text: name.text, reason: '统计列或分路缺失 / 有多个匹配，未猜测填写' });
      continue;
    }
    const values = cells.map((c) => Number(c[0].text.replace(/[%％\s]/g, '')));
    if (values.some((n) => n < 0 || n > 100)) {
      rejected.push({ text: name.text, reason: '英雄百分比超出 0–100 范围' });
      continue;
    }
    rows.push({
      heroId: hero.id,
      name: hero.name,
      role: roles[0].text.trim() as Role,
      winRate: values[0],
      pickRate: values[1],
      banRate: values[2],
      ocrConfidence: Math.min(
        name.confidence,
        roles[0].confidence,
        ...cells.map((c) => c[0].confidence),
      ),
      evidence: [name.text, roles[0].text, ...cells.map((c) => c[0].text)],
    });
  }
  const dates = lines.filter((l) => /\d{4}[年/-]\d{1,2}[月/-]\d{1,2}/.test(l.text));
  const dataDates = [
    ...new Set(
      dates
        .filter((l) => !l.text.includes('更新'))
        .flatMap((l) => {
          const m = l.text.match(/(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})/);
          if (!m) return [];
          const d = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
          return Number.isFinite(Date.parse(d)) && new Date(d).toISOString().startsWith(d)
            ? [d]
            : [];
        }),
    ),
  ];
  return {
    sha256: result.sha256,
    engine: result.engine,
    rows,
    rejected,
    dateText: dates.map((l) => l.text),
    dataDates,
  };
}
export type Capture = PublicTable & { fileName: string };
export type MergedRow = {
  key: string;
  variants: { row: PublicRow; files: string[]; hashes: string[] }[];
};
export function mergePublicTables(captures: Capture[]) {
  const unique = [...new Map(captures.map((c) => [c.sha256, c])).values()],
    map = new Map<string, MergedRow>();
  let duplicateRows = 0;
  for (const c of unique)
    for (const row of c.rows) {
      const key = row.heroId + ':' + row.role;
      const merged = map.get(key) ?? { key, variants: [] };
      const same = merged.variants.find((v) =>
        ['winRate', 'pickRate', 'banRate'].every(
          (k) => v.row[k as 'winRate'] === row[k as 'winRate'],
        ),
      );
      if (same) {
        duplicateRows++;
        same.files.push(c.fileName);
        same.hashes.push(c.sha256);
        same.row = {
          ...same.row,
          ocrConfidence: Math.min(same.row.ocrConfidence, row.ocrConfidence),
        };
      } else merged.variants.push({ row, files: [c.fileName], hashes: [c.sha256] });
      map.set(key, merged);
    }
  return {
    rows: [...map.values()],
    duplicateFiles: captures.length - unique.length,
    duplicateRows,
    dataDates: [...new Set(unique.flatMap((c) => c.dataDates))],
    rejected: unique.flatMap((c) => c.rejected.map((r) => ({ ...r, fileName: c.fileName }))),
  };
}
