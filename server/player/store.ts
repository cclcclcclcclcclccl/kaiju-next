import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { emptyDraft } from '../../src/player/model.ts';
import type { Draft, Pool, MatchInput, Match, SavedPlan } from '../../src/player/model.ts';
export function createPlayerStore(path: string) {
  const db = new DatabaseSync(path);
  db.exec(
    'PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS matches(id TEXT PRIMARY KEY,payload TEXT NOT NULL,created_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS plans(id TEXT PRIMARY KEY,payload TEXT NOT NULL,created_at TEXT NOT NULL);',
  );
  const get = (key: string, fallback: unknown) => {
    const row = db.prepare('SELECT payload FROM settings WHERE key=?').get(key);
    return row ? JSON.parse(String(row.payload)) : fallback;
  };
  const set = (key: string, value: unknown) =>
    db
      .prepare(
        'INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload',
      )
      .run(key, JSON.stringify(value));
  return {
    close: () => db.close(),
    workspace: () => ({
      pool: get('pool', []) as Pool,
      draft: get('draft', emptyDraft()) as Draft,
      matches: db
        .prepare('SELECT payload FROM matches ORDER BY created_at DESC LIMIT 200')
        .all()
        .map((r) => JSON.parse(String(r.payload))) as Match[],
      plans: db
        .prepare('SELECT payload FROM plans ORDER BY created_at DESC LIMIT 50')
        .all()
        .map((r) => JSON.parse(String(r.payload))) as SavedPlan[],
    }),
    pool: (pool: Pool) => {
      set('pool', pool);
      return pool;
    },
    draft: (draft: Draft) => {
      set('draft', draft);
      return draft;
    },
    addMatch: (input: MatchInput) => {
      const match: Match = {
        ...input,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        done: false,
      };
      db.prepare('INSERT INTO matches VALUES(?,?,?)').run(
        match.id,
        JSON.stringify(match),
        match.createdAt,
      );
      return match;
    },
    toggleMatch: (id: string, done: boolean) => {
      const row = db.prepare('SELECT payload FROM matches WHERE id=?').get(id);
      if (!row) return null;
      const match: Match = { ...JSON.parse(String(row.payload)), done };
      db.prepare('UPDATE matches SET payload=? WHERE id=?').run(JSON.stringify(match), id);
      return match;
    },
    updateMatch: (id: string, input: MatchInput) => {
      const row = db.prepare('SELECT payload FROM matches WHERE id=?').get(id);
      if (!row) return null;
      const old = JSON.parse(String(row.payload)) as Match;
      const match = {
        ...old,
        ...input,
        done: old.nextAction === input.nextAction ? old.done : false,
      };
      db.prepare('UPDATE matches SET payload=? WHERE id=?').run(JSON.stringify(match), id);
      return match;
    },
    addPlan: (name: string, draft: Draft, heroId: number, summary: string) => {
      const plan: SavedPlan = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        name,
        draft,
        heroId,
        summary,
      };
      db.prepare('INSERT INTO plans VALUES(?,?,?)').run(
        plan.id,
        JSON.stringify(plan),
        plan.createdAt,
      );
      return plan;
    },
  };
}
export type PlayerStore = ReturnType<typeof createPlayerStore>;
