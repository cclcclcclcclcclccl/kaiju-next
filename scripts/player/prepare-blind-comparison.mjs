import fs from 'node:fs';
import { heroById } from '../../src/player/catalog.ts';
const dir = 'submission/provincial-kit-20261022';
const r = JSON.parse(fs.readFileSync('evidence/provincial-20261022/bp-comparison.json'));
const scenarios = JSON.parse(fs.readFileSync('evidence/provincial-20261022/bp-scenarios.json'));
const name = (id) => heroById(id)?.name ?? String(id);
const answers = [];
const mapping = [];
let text =
  '# 推荐质量匿名比较：待真人评价\n\n24个相同的构造局面比较两种教练搜索深度，A/B先后按种子固定随机打乱；不展示方法名、分数或计时。不是实战结果。允许相同、无法判断。请至少两位有经验玩家独立评价，提交后再揭盲；作者不要提前提示哪组更好。\n\n判定：优先哪一个（A/B/相同/无法判断）、可执行性（1—5或留空）、理由、遗漏信息。不要只凭英雄强度，不把个人喜好当通用结论。作者私存映射不在评审包中；代码仍可推知，属于操作性遮盲，不是严格防泄漏试验。\n\n';
for (const s of scenarios.filter((s) => s.type !== 'exhausted-pool')) {
  const methods = s.seed % 2 ? ['pool-coach-3', 'pool-coach-1'] : ['pool-coach-1', 'pool-coach-3'];
  const rows = methods.map((p) => r.rows.find((x) => x.scenario === s.id && x.policy === p));
  mapping.push({ scenario: s.id, A: methods[0], B: methods[1] });
  text += '## ' + s.id + '\n\n';
  for (const [side, label] of [
    ['allies', '我方'],
    ['enemies', '对方'],
  ])
    text +=
      label +
      '已选：' +
      (Object.entries(s.draft[side])
        .map(([role, id]) => role + ' ' + name(id))
        .join('；') || '无') +
      '。\n\n';
  text +=
    '已禁：' +
    s.draft.banned.map(name).join('、') +
    '。\n\n已登记分路英雄池：' +
    Object.entries(s.members)
      .map(([role, m]) => role + '：' + m.pool.map((p) => name(p.heroId)).join('、'))
      .join('；') +
    '。未登记分路信息未知。\n\n';
  rows.forEach(
    (row, i) =>
      (text +=
        (i ? 'B' : 'A') +
        '：' +
        (row.move ? row.move.heroName + '，' + row.move.role : '没有建议') +
        '。\n\n'),
  );
  text += '评价：____；理由：____；还需要的信息：____。\n\n';
  answers.push({
    scenario: s.id,
    preference: null,
    feasibilityA: null,
    feasibilityB: null,
    reason: '',
    missingInformation: '',
  });
}
fs.writeFileSync(dir + '/09-推荐质量匿名比较.md', text);
fs.writeFileSync(
  dir + '/匿名评价空白模板.json',
  JSON.stringify(
    { kind: 'unfilled-independent-evaluation', reviewerAlias: '', consent: false, answers },
    null,
    2,
  ),
);
fs.mkdirSync('private/provincial-20261022', { recursive: true });
fs.writeFileSync('private/provincial-20261022/比较揭盲映射.json', JSON.stringify(mapping, null, 2));
console.log('24 blinded comparison sheets prepared; no reviewer ratings fabricated.');
