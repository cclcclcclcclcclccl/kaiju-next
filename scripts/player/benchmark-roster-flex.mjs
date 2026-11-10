import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { heroes } from '../../src/player/catalog.ts';
import { ROLES } from '../../src/player/model.ts';
import { inferRoles } from '../../src/player/pro/flexRoles.ts';
import { assignRoster } from '../../src/player/pro/rosterFlex.ts';

const out = process.argv[2] ?? 'evidence/revision-20261110';
let seed = 20261110;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
// Independent exhaustive checker: no production matching function or score is used.
function oracle(ids, members, blocked, forced = {}) {
  const selected = new Set(ids),
    used = new Set(blocked),
    lineup = {};
  const walk = (i) => {
    if (i === ROLES.length) return ids.every((id) => Object.values(lineup).includes(id));
    const role = ROLES[i];
    const candidates =
      forced[role] !== undefined ? [forced[role]] : members[role].pool.map((p) => p.heroId);
    for (const id of candidates) {
      if (
        used.has(id) ||
        !heroes.find((h) => h.id === id)?.roles.includes(role) ||
        !members[role].pool.some((p) => p.heroId === id)
      )
        continue;
      // Fill all five registered positions; selected heroes must all appear.
      used.add(id);
      lineup[role] = id;
      if (walk(i + 1)) return true;
      delete lineup[role];
      used.delete(id);
    }
    return false;
  };
  return walk(0);
}
const cases = [];
for (let i = 0; i < 80; i++) {
  const members = Object.fromEntries(
    ROLES.map((role) => {
      const options = heroes.filter((h) => h.roles.includes(role));
      const pool = [];
      while (pool.length < 3) {
        const h = options[Math.floor(random() * options.length)];
        if (!pool.some((p) => p.heroId === h.id)) pool.push({ heroId: h.id, level: 'main' });
      }
      return [role, { id: role, name: role + '构造选手', pool }];
    }),
  );
  const union = [...new Set(Object.values(members).flatMap((m) => m.pool.map((p) => p.heroId)))];
  const count = i % 5,
    ids = [];
  while (ids.length < count) {
    const id = union[Math.floor(random() * union.length)];
    if (!ids.includes(id)) ids.push(id);
  }
  const blocked = union.filter((id) => !ids.includes(id) && random() < 0.18);
  if (i % 7 === 0)
    blocked.push(...members['打野'].pool.map((p) => p.heroId).filter((id) => !ids.includes(id)));
  const possible = oracle(ids, members, blocked);
  let result = null;
  const started = performance.now();
  try {
    result = assignRoster(
      ids,
      heroes,
      {},
      { members, respectPools: true, blocked, now: Date.UTC(2026, 10, 10) },
    );
  } catch {}
  const elapsedMs = performance.now() - started;
  assert.equal(!!result, possible, `case ${i}: independent feasibility`);
  if (result)
    assert.ok(oracle(ids, members, blocked, result.lineup), `case ${i}: returned assignment`);
  const baseline = inferRoles(ids, heroes).lineup;
  const baselineFeasible = possible && oracle(ids, members, blocked, baseline);
  cases.push({
    id: i,
    ids,
    blocked,
    members,
    possible,
    baselineFeasible,
    jointFeasible: !!result,
    lineup: result?.lineup ?? null,
    elapsedMs,
  });
}
const times = cases.map((c) => c.elapsedMs).sort((a, b) => a - b);
const report = {
  kind: 'synthetic-constraint-benchmark',
  seed: 20261110,
  checkedAt: new Date().toISOString(),
  cases: cases.length,
  independentOracleAgreements: cases.length,
  feasibleCases: cases.filter((c) => c.possible).length,
  baselineFeasibleCases: cases.filter((c) => c.baselineFeasible).length,
  jointFeasibleCases: cases.filter((c) => c.jointFeasible).length,
  p95Ms: times[Math.ceil(times.length * 0.95) - 1],
  maxMs: times.at(-1),
  limitations:
    'Constructed player pools over real catalog eligibility. Independent exhaustive feasibility oracle; not real players, match outcomes, coach labels, calibrated win rate, or proof of professional strength.',
  results: cases,
};
await mkdir(out, { recursive: true });
await writeFile(out + '/roster-benchmark.json', JSON.stringify(report, null, 2));
const { results, ...summary } = report;
console.log(JSON.stringify(summary, null, 2));
