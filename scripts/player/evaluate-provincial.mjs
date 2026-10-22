import fs from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { heroes } from '../../src/player/catalog.ts';
import { emptyDraft, ROLES } from '../../src/player/model.ts';
import { searchCoach, applyCoachMove } from '../../src/player/pro/coach.ts';
const folder = 'evidence/provincial-20261022';
fs.mkdirSync(folder, { recursive: true });
const raw = fs.readFileSync('tests/fixtures/tianyuan/tier-20261014.json');
const source = JSON.parse(raw);
const score = new Map();
for (const row of source.tiers)
  if (Number.isFinite(row.finalNormalizedTierScore))
    score.set(
      row.heroId,
      Math.max(score.get(row.heroId) ?? -Infinity, row.finalNormalizedTierScore),
    );
const catalog = [...heroes].sort((a, b) => a.id - b.id),
  byId = new Map(catalog.map((h) => [h.id, h]));
const options = {
  maxMs: 1500,
  maxNodes: 1000,
  candidatePolicy: 'coverage',
  now: Date.UTC(2026, 9, 14),
};
const settings = {
  depth: 3,
  width: 4,
  strategy: 'robust',
  firstPick: 'allies',
  nextSide: 'allies',
  action: 'pick',
  respectPools: true,
};
const scenarios = [];
for (let i = 0; i < 24; i++) {
  let state = (2200 + i) >>> 0;
  const random = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
  const shuffle = (a) => {
    const b = [...a];
    for (let n = b.length - 1; n > 0; n--) {
      const j = Math.floor(random() * (n + 1));
      [b[n], b[j]] = [b[j], b[n]];
    }
    return b;
  };
  const draft = emptyDraft(),
    used = new Set();
  // Disjoint lane pools make the initial feasibility explicit; no invented personal match statistics.
  const pools = {};
  for (const role of ROLES) {
    pools[role] = shuffle(catalog.filter((h) => h.roles.includes(role) && !used.has(h.id)))
      .slice(0, i % 2 ? 3 : 1)
      .map((h) => h.id);
    pools[role].forEach((id) => used.add(id));
  }
  const members = {};
  const known = [1, 3, 5][i % 3];
  for (const role of ROLES.slice(0, known))
    members[role] = {
      id: 'synthetic-' + role,
      name: '构造选手-' + role,
      pool: pools[role].map((heroId) => ({ heroId, level: 'main' })),
    };
  const n = [0, 2, 4][Math.floor(i / 3) % 3];
  for (const role of ROLES.slice(0, n)) draft.allies[role] = pools[role][0];
  for (const role of ROLES.slice(0, n)) {
    const h = shuffle(catalog.filter((h) => h.roles.includes(role) && !used.has(h.id)))[0];
    draft.enemies[role] = h.id;
    used.add(h.id);
  }
  draft.banned = shuffle(catalog.filter((h) => !used.has(h.id)))
    .slice(0, 6)
    .map((h) => h.id);
  scenarios.push({
    id: 'S' + String(i + 1).padStart(2, '0'),
    seed: 2200 + i,
    type: 'constructed-fixed-role',
    draft,
    members,
    opponentPool: [],
    poolSize: i % 2 ? 3 : 1,
    knownMembers: known,
  });
}
// Boundary: no registered mid hero survives the ban. Refusal is preferable to inventing a recommendation.
const mid = catalog.find((h) => h.roles.includes('中路'));
const draft = emptyDraft();
draft.banned = [mid.id];
scenarios.push({
  id: 'S25',
  type: 'exhausted-pool',
  draft,
  members: {
    中路: { id: 'synthetic-mid', name: '构造中路选手', pool: [{ heroId: mid.id, level: 'main' }] },
  },
  opponentPool: [],
});
const protocol = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  source: {
    file: 'tests/fixtures/tianyuan/tier-20261014.json',
    queryDate: source.queryDate,
    sha256: createHash('sha256').update(raw).digest('hex'),
    class: 'historical-third-party-public-fixture',
    aggregation:
      'maximum published score per catalog hero for this global-priority baseline; not an official per-lane score',
  },
  scenarios:
    '24 fixed-seed constructed states plus one exhausted-pool boundary; not real players, matches or expert labels',
  policies: ['source-only', 'pool-source', 'pool-coach-1', 'pool-coach-3'],
  comparison:
    'source-only vs pool-source changes pool constraint only; pool-coach-1 vs pool-coach-3 changes requested depth only; cross-family comparisons do not isolate search depth',
  options,
  settings,
  training: false,
  outcomePrediction: false,
  notes: [
    'No synthetic win rates, match counts or account powers are generated.',
    'No training or hyperparameter tuning. No held-out or professional-performance claim.',
    'Wall-clock limits and hardware can change completed depth; per-decision timing is descriptive.',
    'This suite covers next-pick decisions, not a complete staged ban/pick tournament.',
    'Automatic flex search and assigned member pools are separate in current production code.',
  ],
};
// Persist inputs and protocol before evaluation.
fs.writeFileSync(folder + '/bp-protocol.json', JSON.stringify(protocol, null, 2));
fs.writeFileSync(folder + '/bp-scenarios.json', JSON.stringify(scenarios, null, 2));
function taken(d) {
  return new Set([...Object.values(d.allies), ...Object.values(d.enemies), ...d.banned]);
}
function complete(d, members) {
  const used = taken(d),
    roles = ROLES.filter((r) => !d.allies[r]);
  const visit = (i) => {
    if (i === roles.length) return true;
    const r = roles[i];
    for (const h of catalog) {
      if (
        used.has(h.id) ||
        !h.roles.includes(r) ||
        (members[r] && !members[r].pool.some((p) => p.heroId === h.id))
      )
        continue;
      used.add(h.id);
      if (visit(i + 1)) return true;
      used.delete(h.id);
    }
    return false;
  };
  return visit(0);
}
function ranked(s, pool) {
  const used = taken(s.draft);
  return ROLES.flatMap((role) =>
    s.draft.allies[role]
      ? []
      : catalog
          .filter(
            (h) =>
              !used.has(h.id) &&
              h.roles.includes(role) &&
              score.has(h.id) &&
              (!pool || !s.members[role] || s.members[role].pool.some((p) => p.heroId === h.id)),
          )
          .map((h) => ({ team: 'allies', kind: 'pick', heroId: h.id, role })),
  ).sort(
    (a, b) =>
      score.get(b.heroId) - score.get(a.heroId) ||
      a.heroId - b.heroId ||
      ROLES.indexOf(a.role) - ROLES.indexOf(b.role),
  );
}
const rows = [];
for (const s of scenarios) {
  const initiallyFeasible = complete(s.draft, s.members);
  for (const policy of protocol.policies) {
    let move, result, error;
    const start = performance.now();
    try {
      if (policy === 'source-only' || policy === 'pool-source')
        move = ranked(s, policy === 'pool-source')[0];
      else {
        result = searchCoach(
          heroes,
          {
            draft: s.draft,
            members: s.members,
            opponentPool: s.opponentPool,
            settings: { ...settings, depth: policy === 'pool-coach-1' ? 1 : 3 },
          },
          options,
        );
        move = result.candidates[0]?.move;
      }
    } catch (e) {
      error = e.message;
    }
    const ms = performance.now() - start;
    const legal =
      !!move &&
      !taken(s.draft).has(move.heroId) &&
      !s.draft.allies[move.role] &&
      byId.get(move.heroId).roles.includes(move.role);
    const assigned = move ? !!s.members[move.role] : false;
    const withinPool = assigned
      ? s.members[move.role].pool.some((p) => p.heroId === move.heroId)
      : null;
    const completable = legal ? complete(applyCoachMove(s.draft, move), s.members) : false;
    rows.push({
      scenario: s.id,
      type: s.type,
      policy,
      initiallyFeasible,
      move: move ? { ...move, heroName: byId.get(move.heroId).name } : null,
      error: error ?? null,
      legal,
      assignedMember: assigned,
      withinPool,
      remainingAssignmentFeasible: completable,
      latencyMs: Number(ms.toFixed(2)),
      completedDepth: result?.completedDepth ?? null,
      requestedDepth: result?.requestedDepth ?? null,
      nodes: result?.searchedNodes ?? 0,
      bounded: result?.bounded ?? false,
    });
  }
  console.log(s.id + ' complete');
}
const summary = protocol.policies.map((policy) => {
  const all = rows.filter((r) => r.policy === policy),
    valid = all.filter((r) => r.initiallyFeasible),
    proposals = valid.filter((r) => r.move),
    assigned = proposals.filter((r) => r.assignedMember),
    times = valid.map((r) => r.latencyMs).sort((a, b) => a - b);
  return {
    policy,
    feasibleCases: valid.length,
    recommendations: proposals.length,
    legalRecommendations: proposals.filter((r) => r.legal).length,
    assignedMemberRecommendations: assigned.length,
    outsideRegisteredPool: assigned.filter((r) => !r.withinPool).length,
    remainingFeasible: proposals.filter((r) => r.remainingAssignmentFeasible).length,
    medianMs: times[Math.floor(times.length / 2)],
    p95Ms: times[Math.ceil(times.length * 0.95) - 1],
    requestedDepthCompleted: valid.filter(
      (r) => r.completedDepth !== null && r.completedDepth === r.requestedDepth,
    ).length,
    bounded: valid.filter((r) => r.bounded).length,
    exhaustedPool: all
      .filter((r) => !r.initiallyFeasible)
      .map((r) => ({ scenario: r.scenario, recommended: !!r.move, error: r.error })),
  };
});
const diff = scenarios
  .filter((s) => s.type !== 'exhausted-pool')
  .filter((s) => {
    const a = rows.find((r) => r.scenario === s.id && r.policy === 'pool-coach-1').move,
      b = rows.find((r) => r.scenario === s.id && r.policy === 'pool-coach-3').move;
    return JSON.stringify(a) !== JSON.stringify(b);
  }).length;
const report = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  protocol,
  summary,
  depthChangedRecommendationCount: diff,
  rows,
  conclusion:
    'Engineering comparison on constructed inputs only. Pool compliance is an imposed constraint, not independent evidence of better player decisions; changed recommendations do not prove improvement.',
};
fs.writeFileSync(folder + '/bp-comparison.json', JSON.stringify(report, null, 2));
assert.equal(
  rows.filter((r) => r.initiallyFeasible && r.move && !r.legal).length,
  0,
  'Illegal recommendation',
);
assert.equal(
  rows.filter((r) => r.policy.startsWith('pool-') && r.assignedMember && r.withinPool === false)
    .length,
  0,
  'Pool violation',
);
console.log(JSON.stringify({ summary, depthChangedRecommendationCount: diff }));
