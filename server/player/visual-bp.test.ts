import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { heroes } from '../../src/player/catalog.ts';
import { emptyDraft, ROLES } from '../../src/player/model.ts';
import {
  STAGED_ROUNDS,
  bpStep,
  replaySession,
  sessionSchema,
  assessDraft,
} from '../../src/player/pro/bpSession.ts';
import { searchCoach } from '../../src/player/pro/coach.ts';
import { tianyuanEquipSchema, tianyuanCombinedSchema } from '../../src/player/pro/tianyuan.ts';
test('real equipment fixture retains slot statistics and complete builds without invented win rates', () => {
  const raw = JSON.parse(readFileSync('tests/fixtures/tianyuan/equip-521.json', 'utf8'));
  const parsed = tianyuanEquipSchema.parse(raw);
  assert.deepEqual(parsed.topItemsBySlot, raw.topItemsBySlot);
  assert.deepEqual(parsed.topFullBuilds, raw.topFullBuilds);
  assert.equal(parsed.topItemsBySlot?.length, 6);
  assert.ok(parsed.topFullBuilds?.every((b) => b.build.length === 6));
  assert.ok(parsed.topFullBuilds?.every((b) => !('winRate' in b)));
  const combined = JSON.parse(readFileSync('tests/fixtures/tianyuan/combined-521.json', 'utf8'));
  assert.equal(
    tianyuanCombinedSchema.parse(combined).summonerSkills[0].skillIcon,
    combined.summonerSkills[0].skillIcon,
  );
});
test('staged BP completes ten bans and ten unique picks, replays, rejects duplicate and corrupt sessions', () => {
  let draft = emptyDraft();
  const moves = [];
  for (let i = 0; i < STAGED_ROUNDS.length; i++) {
    const turn = STAGED_ROUNDS[i];
    const role = ROLES.find((r) => !draft[turn.team][r])!;
    const used = [...draft.banned, ...Object.values(draft.allies), ...Object.values(draft.enemies)];
    const hero = heroes.find(
      (h) => !used.includes(h.id) && (turn.kind === 'ban' || h.roles.includes(role)),
    )!;
    draft = bpStep(draft, i, hero.id, role, STAGED_ROUNDS);
    moves.push({ heroId: hero.id, role });
    assert.throws(() => bpStep(draft, Math.min(i + 1, 19), hero.id, role, STAGED_ROUNDS));
  }
  const session = sessionSchema.parse({ version: 1, format: 'staged', mode: 'manual', moves });
  assert.deepEqual(replaySession(session).allies, draft.allies);
  assert.equal(draft.banned.length, 10);
  assert.equal(Object.keys(draft.enemies).length, 5);
  assert.equal(assessDraft(draft).length, 2);
  assert.throws(() => replaySession({ ...session, moves: [{ heroId: 999999, role: '中路' }] }));
  assert.equal(sessionSchema.safeParse({ ...session, format: 'other' }).success, false);
});
test('coach follows consecutive and second-phase bans in the supplied real turn schedule', () => {
  let draft = emptyDraft();
  for (let i = 0; i < 10; i++) {
    const turn = STAGED_ROUNDS[i],
      role = ROLES.find((r) => !draft[turn.team][r])!;
    const used = [...draft.banned, ...Object.values(draft.allies), ...Object.values(draft.enemies)];
    const h = heroes.find(
      (h) => !used.includes(h.id) && (turn.kind === 'ban' || h.roles.includes(role)),
    )!;
    draft = bpStep(draft, i, h.id, role, STAGED_ROUNDS);
  }
  const sequence = STAGED_ROUNDS.slice(10);
  const result = searchCoach(
    heroes,
    {
      draft,
      members: {},
      opponentPool: [],
      sequence,
      settings: {
        depth: 3,
        width: 3,
        strategy: 'robust',
        firstPick: 'allies',
        nextSide: 'enemies',
        action: 'ban',
        respectPools: false,
      },
    },
    { maxMs: 30000, maxNodes: 3000 },
  );
  assert.equal(result.completedDepth, 3);
  for (const candidate of result.candidates) {
    assert.equal(candidate.line.length, 3);
    candidate.line.forEach((m, i) => {
      assert.equal(m.kind, sequence[i].kind);
      assert.equal(m.team, sequence[i].team);
    });
    assert.equal(new Set(candidate.line.map((m) => m.heroId)).size, 3);
  }
});
