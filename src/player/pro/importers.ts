import { z } from 'zod';
import type { Hero, Role } from '../model.ts';
import { statRowSchema } from './model.ts';
export type StatEntry = {
  hero: string;
  role: Role;
  win: string;
  pick: string;
  ban: string;
  games: string;
};
export const blankEntry = (role: Role): StatEntry => ({
  hero: '',
  role,
  win: '',
  pick: '',
  ban: '',
  games: '',
});
export function parseStatEntries(entries: StatEntry[], heroes: Hero[]) {
  return entries.map((entry, i) => {
    const prefix = `第 ${i + 1} 行`;
    const hero = heroes.find(
      (h) => h.name === entry.hero.trim() || String(h.id) === entry.hero.trim(),
    );
    if (!hero) throw new Error(prefix + '：请选择目录中的英雄');
    if (!hero.roles.includes(entry.role))
      throw new Error(prefix + '：' + hero.name + '与所选分路不符');
    const rate = (value: string, label: string) => {
      const raw = value.trim().replace(/[％%]$/, '');
      if (!/^(\d+(\.\d+)?|\.\d+)$/.test(raw))
        throw new Error(prefix + '：' + label + '须填写 0–100 的百分数，未知时不能填 0');
      return Number(raw);
    };
    const games = entry.games.trim();
    if (games && !/^\d+$/.test(games)) throw new Error(prefix + '：场次数需为正整数，未公布时留空');
    const result = statRowSchema.safeParse({
      heroId: hero.id,
      role: entry.role,
      winRate: rate(entry.win, '胜率'),
      pickRate: rate(entry.pick, '出场率'),
      banRate: rate(entry.ban, '禁用率'),
      ...(games ? { games: Number(games) } : {}),
    });
    if (!result.success)
      throw new Error(prefix + '：' + result.error.issues.map((x) => x.message).join('；'));
    return result.data;
  });
}
export function parsePastedStats(text: string): StatEntry[] {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .filter((x) => x.trim());
  if (!lines.length) throw new Error('请粘贴表格内容');
  if (lines.length > 501) throw new Error('一次最多导入 500 行');
  if (/英雄/.test(lines[0]) && /胜率/.test(lines[0])) lines.shift();
  return lines.map((line, i) => {
    const cells = line.split(line.includes('\t') ? '\t' : ',').map((x) => x.trim());
    if (cells.length < 5 || cells.length > 6)
      throw new Error(`第 ${i + 1} 行需要 5–6 列：英雄、分路、胜率、出场率、禁用率、场次（可空）`);
    return {
      hero: cells[0],
      role: cells[1] as Role,
      win: cells[2],
      pick: cells[3],
      ban: cells[4],
      games: cells[5] ?? '',
    };
  });
}
export function inputError(error: unknown) {
  if (error instanceof z.ZodError)
    return error.issues
      .map((x) => x.message)
      .slice(0, 4)
      .join('；');
  if (error instanceof SyntaxError) return '文件内容不是有效 JSON，请核对格式';
  return error instanceof Error ? error.message : '无法读取这份数据';
}
