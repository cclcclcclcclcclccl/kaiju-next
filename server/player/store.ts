import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { emptyDraft } from '../../src/player/model.ts';
import type { Draft, Pool, MatchInput, Match, SavedPlan } from '../../src/player/model.ts';
import { emptyProfile, profileSchema } from '../../src/player/pro/model.ts';
import { isDeepStrictEqual } from 'node:util';
import type { PersonalState } from '../../src/player/pro/backup.ts';
import { effectivePool } from '../../src/player/pro/analytics.ts';
import type { Profile, StatSnapshot, Review, JungleRun } from '../../src/player/pro/model.ts';
export function createPlayerStore(path: string) {
  const db = new DatabaseSync(path);
  db.exec(
    'PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS matches(id TEXT PRIMARY KEY,payload TEXT NOT NULL,created_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS plans(id TEXT PRIMARY KEY,payload TEXT NOT NULL,created_at TEXT NOT NULL);',
  );
  for (const table of ['matches', 'plans'])
    if (
      !db
        .prepare('PRAGMA table_info(' + table + ')')
        .all()
        .some((r) => r.name === 'owner')
    )
      db.exec('ALTER TABLE ' + table + " ADD COLUMN owner TEXT NOT NULL DEFAULT 'local'");
  db.exec(
    'CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, code TEXT UNIQUE NOT NULL); CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS friendships(id TEXT PRIMARY KEY, sender TEXT NOT NULL, receiver TEXT NOT NULL, pair TEXT UNIQUE NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);',
  );
  const userView = (r: any) =>
    r
      ? {
          id: String(r.id),
          username: String(r.username),
          name: String(r.name),
          code: String(r.code),
        }
      : null;
  db.exec(
    'CREATE TABLE IF NOT EXISTS pool_history(id INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL, before_json TEXT NOT NULL, after_json TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL)',
  );
  function scoped(owner: string) {
    const key = (k: string) => (owner === 'local' ? k : 'account:' + owner + ':' + k);
    const get = (k: string, fallback: unknown) => {
      const row = db.prepare('SELECT payload FROM settings WHERE key=?').get(key(k));
      return row ? JSON.parse(String(row.payload)) : fallback;
    };
    const set = (k: string, value: unknown) => {
      db.prepare(
        'INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload',
      ).run(key(k), JSON.stringify(value));
      return value;
    };
    const transaction = <T>(fn: () => T): T => {
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = fn();
        db.exec('COMMIT');
        return result;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    };
    const writePool = (pool: Pool, reason: string) => {
      const old = get('pool', []) as Pool;
      if (JSON.stringify(old) !== JSON.stringify(pool)) {
        db.prepare(
          'INSERT INTO pool_history(owner,before_json,after_json,reason,created_at) VALUES(?,?,?,?,?)',
        ).run(owner, JSON.stringify(old), JSON.stringify(pool), reason, new Date().toISOString());
        set('pool', pool);
      }
      return pool;
    };
    const personalState = (): PersonalState => ({
      pool: get('pool', []) as Pool,
      draft: get('draft', emptyDraft()) as Draft,
      matches: db
        .prepare('SELECT payload FROM matches WHERE owner=? ORDER BY id')
        .all(owner)
        .map((r) => JSON.parse(String(r.payload))),
      plans: db
        .prepare('SELECT payload FROM plans WHERE owner=? ORDER BY id')
        .all(owner)
        .map((r) => JSON.parse(String(r.payload))),
      profile: get('profile', emptyProfile()) as Profile,
      snapshots: get('snapshots', []) as StatSnapshot[],
      reviews: get('reviews', []) as Review[],
      runs: get('runs', []) as JungleRun[],
    });
    const stateRevision = () =>
      createHash('sha256').update(JSON.stringify(personalState())).digest('hex');
    return {
      personalState,
      stateRevision,
      restoreCheckpoint: () => get('restore-checkpoint', null) as PersonalState | null,
      restorePersonal: (expected: string, incoming: PersonalState) =>
        transaction(() => {
          if (stateRevision() !== expected) return { conflict: true };
          set('restore-checkpoint', personalState());
          writePool(incoming.pool, '恢复完整个人备份');
          const { memberId: _member, ...draft } = incoming.draft;
          set('draft', draft);
          set('profile', { ...incoming.profile, sharePool: false });
          for (const name of ['snapshots', 'reviews', 'runs'] as const) set(name, incoming[name]);
          for (const [table, rows] of [
            ['matches', incoming.matches],
            ['plans', incoming.plans],
          ] as const) {
            db.prepare('DELETE FROM ' + table + ' WHERE owner=?').run(owner);
            for (const row of rows) {
              const id = randomUUID();
              const payload = { ...row, id };
              if ('draft' in payload) {
                const { memberId: _friend, ...planDraft } = payload.draft;
                payload.draft = planDraft;
              }
              db.prepare(
                'INSERT INTO ' + table + '(id,payload,created_at,owner) VALUES(?,?,?,?)',
              ).run(id, JSON.stringify(payload), row.createdAt, owner);
            }
          }
          return { conflict: false };
        }),
      close: () => db.close(),
      workspace: () => ({
        pool: get('pool', []) as Pool,
        draft: get('draft', emptyDraft()) as Draft,
        matches: db
          .prepare('SELECT payload FROM matches WHERE owner=? ORDER BY created_at DESC LIMIT 200')
          .all(owner)
          .map((r) => JSON.parse(String(r.payload))) as Match[],
        plans: db
          .prepare('SELECT payload FROM plans WHERE owner=? ORDER BY created_at DESC LIMIT 50')
          .all(owner)
          .map((r) => JSON.parse(String(r.payload))) as SavedPlan[],
      }),
      pool: (pool: Pool) => transaction(() => writePool(pool, '完整英雄池保存')),
      poolEdit: (
        changes: {
          heroId: number;
          expected: Pool[number]['level'] | null;
          level: Pool[number]['level'] | null;
        }[],
      ) =>
        transaction(() => {
          const current = get('pool', []) as Pool;
          if (
            changes.some(
              (c) => (current.find((p) => p.heroId === c.heroId)?.level ?? null) !== c.expected,
            )
          )
            return { conflict: true, pool: current };
          let next = [...current];
          for (const c of changes) {
            next = next.filter((p) => p.heroId !== c.heroId);
            if (c.level) next.push({ heroId: c.heroId, level: c.level });
          }
          return { conflict: false, pool: writePool(next, '按英雄保存') };
        }),
      mergePool: (incoming: Pool, reason = '复制访客英雄池（保留已有记录）') =>
        transaction(() => {
          const current = get('pool', []) as Pool;
          return writePool(
            [...current, ...incoming.filter((p) => !current.some((c) => c.heroId === p.heroId))],
            reason,
          );
        }),
      poolHistory: () =>
        db
          .prepare(
            'SELECT id,reason,created_at AS savedAt,before_json,after_json FROM pool_history WHERE owner=? ORDER BY id DESC LIMIT 20',
          )
          .all(owner)
          .map((r) => ({
            id: Number(r.id),
            reason: String(r.reason),
            savedAt: String(r.savedAt),
            before: JSON.parse(String(r.before_json)) as Pool,
            after: JSON.parse(String(r.after_json)) as Pool,
          })),
      draft: (draft: Draft) => set('draft', draft) as Draft,
      addMatch: (input: MatchInput) => {
        const match: Match = {
          ...input,
          id: randomUUID(),
          createdAt: new Date().toISOString(),
          done: false,
        };
        db.prepare('INSERT INTO matches(id,payload,created_at,owner) VALUES(?,?,?,?)').run(
          match.id,
          JSON.stringify(match),
          match.createdAt,
          owner,
        );
        return match;
      },
      toggleMatch: (id: string, done: boolean) => {
        const row = db.prepare('SELECT payload FROM matches WHERE id=? AND owner=?').get(id, owner);
        if (!row) return null;
        const match: Match = { ...JSON.parse(String(row.payload)), done };
        db.prepare('UPDATE matches SET payload=? WHERE id=? AND owner=?').run(
          JSON.stringify(match),
          id,
          owner,
        );
        return match;
      },
      matchById: (id: string) => {
        const row = db.prepare('SELECT payload FROM matches WHERE id=? AND owner=?').get(id, owner);
        return row ? (JSON.parse(String(row.payload)) as Match) : null;
      },
      updateMatch: (id: string, input: MatchInput) => {
        const row = db.prepare('SELECT payload FROM matches WHERE id=? AND owner=?').get(id, owner);
        if (!row) return null;
        const old = JSON.parse(String(row.payload)) as Match;
        const match = {
          ...old,
          ...input,
          done: old.nextAction === input.nextAction ? old.done : false,
        };
        db.prepare('UPDATE matches SET payload=? WHERE id=? AND owner=?').run(
          JSON.stringify(match),
          id,
          owner,
        );
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
        db.prepare('INSERT INTO plans(id,payload,created_at,owner) VALUES(?,?,?,?)').run(
          plan.id,
          JSON.stringify(plan),
          plan.createdAt,
          owner,
        );
        return plan;
      },
      pro: () => ({
        profile: get('profile', emptyProfile()) as Profile,
        snapshots: get('snapshots', []) as StatSnapshot[],
        reviews: get('reviews', []) as Review[],
        runs: get('runs', []) as JungleRun[],
      }),
      addRun: (input: Omit<JungleRun, 'id' | 'createdAt'>) => {
        const r = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
        set('runs', [r, ...(get('runs', []) as JungleRun[])]);
        return r;
      },
      profile: (profile: Profile) => set('profile', profile) as Profile,
      saveProfile: (expected: Profile, profile: Profile) =>
        transaction(() => {
          const current = profileSchema.parse(get('profile', emptyProfile()));
          if (!isDeepStrictEqual(current, expected)) return { conflict: true };
          set('profile', profile);
          return { conflict: false };
        }),
      addSnapshot: (input: Omit<StatSnapshot, 'id' | 'importedAt'>) => {
        const s = { ...input, id: randomUUID(), importedAt: new Date().toISOString() };
        set('snapshots', [s, ...(get('snapshots', []) as StatSnapshot[])]);
        return s;
      },
      removeSnapshot: (id: string) =>
        set(
          'snapshots',
          (get('snapshots', []) as StatSnapshot[]).filter((s) => s.id !== id),
        ),
      addReview: (input: Omit<Review, 'id' | 'createdAt'>, id?: string) => {
        const records = get('reviews', []) as Review[];
        const old = records.find((r) => r.id === id);
        if (id && !old) return null;
        const r = {
          ...input,
          id: old?.id ?? randomUUID(),
          createdAt: old?.createdAt ?? new Date().toISOString(),
        };
        set('reviews', old ? records.map((x) => (x.id === old.id ? r : x)) : [r, ...records]);
        return r;
      },
      reviewRevision: (id: string) => {
        const review = (get('reviews', []) as Review[]).find((r) => r.id === id);
        return review ? createHash('sha256').update(JSON.stringify(review)).digest('hex') : null;
      },
      saveReview: (
        input: Omit<Review, 'id' | 'createdAt'>,
        id: string | undefined,
        expected: string | null,
      ) =>
        transaction(() => {
          const records = get('reviews', []) as Review[],
            old = records.find((r) => r.id === id);
          const revision = old
            ? createHash('sha256').update(JSON.stringify(old)).digest('hex')
            : null;
          if ((id && !old) || revision !== expected)
            return { conflict: true, review: null, revision: null };
          const review = {
            ...input,
            id: old?.id ?? randomUUID(),
            createdAt: old?.createdAt ?? new Date().toISOString(),
          };
          set(
            'reviews',
            old ? records.map((r) => (r.id === id ? review : r)) : [review, ...records],
          );
          return {
            conflict: false,
            review,
            revision: createHash('sha256').update(JSON.stringify(review)).digest('hex'),
          };
        }),
      removeReview: (id: string) =>
        set(
          'reviews',
          (get('reviews', []) as Review[]).filter((r) => r.id !== id),
        ),
    };
  }
  const session = (userId: string) => {
    const token = randomBytes(32).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(
      createHash('sha256').update(token).digest('hex'),
      userId,
      Date.now() + 7 * 86400000,
    );
    return token;
  };
  const accountByToken = (token: string) => {
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    return userView(
      db
        .prepare(
          'SELECT a.* FROM accounts a JOIN sessions s ON a.id=s.user_id WHERE token_hash=? AND expires>?',
        )
        .get(createHash('sha256').update(token).digest('hex'), Date.now()),
    );
  };
  const identity = {
    register: (username: string, name: string, password: string) => {
      if (db.prepare('SELECT id FROM accounts WHERE username=?').get(username))
        throw new Error('用户名已被使用');
      const id = randomUUID(),
        salt = randomBytes(16).toString('hex'),
        hash = scryptSync(password, salt, 64).toString('hex'),
        code = randomBytes(5).toString('hex').toUpperCase();
      db.prepare('INSERT INTO accounts VALUES(?,?,?,?,?,?)').run(
        id,
        username,
        name,
        salt,
        hash,
        code,
      );
      return { user: { id, username, name, code }, token: session(id) };
    },
    login: (username: string, password: string) => {
      const r = db.prepare('SELECT * FROM accounts WHERE username=?').get(username);
      const actual = scryptSync(password, String(r?.salt ?? 'unknown'), 64),
        expected = Buffer.from(String(r?.hash ?? '00'.repeat(64)), 'hex');
      if (!r || !timingSafeEqual(actual, expected)) throw new Error('用户名或密码不正确');
      return { user: userView(r)!, token: session(String(r.id)) };
    },
    accountByToken,
    logout: (token: string) =>
      db
        .prepare('DELETE FROM sessions WHERE token_hash=?')
        .run(createHash('sha256').update(token).digest('hex')),
    request: (sender: string, code: string) => {
      const other = db.prepare('SELECT id FROM accounts WHERE code=?').get(code.toUpperCase());
      if (!other) throw new Error('没有找到这个好友码');
      const receiver = String(other.id);
      if (receiver === sender) throw new Error('不能添加自己');
      const pair = [sender, receiver].sort().join(':');
      if (db.prepare('SELECT id FROM friendships WHERE pair=?').get(pair))
        throw new Error('已存在好友关系或待处理申请');
      db.prepare('INSERT INTO friendships VALUES(?,?,?,?,?,?)').run(
        randomUUID(),
        sender,
        receiver,
        pair,
        'pending',
        new Date().toISOString(),
      );
    },
    respond: (userId: string, id: string, accept: boolean) => {
      const row = db
        .prepare("SELECT * FROM friendships WHERE id=? AND receiver=? AND status='pending'")
        .get(id, userId);
      if (!row) throw new Error('申请不存在或不属于你');
      if (accept) db.prepare("UPDATE friendships SET status='accepted' WHERE id=?").run(id);
      else db.prepare('DELETE FROM friendships WHERE id=?').run(id);
    },
    remove: (userId: string, id: string) => {
      const r = db
        .prepare('DELETE FROM friendships WHERE id=? AND (sender=? OR receiver=?)')
        .run(id, userId, userId);
      if (!r.changes) throw new Error('好友关系不存在');
    },
    friends: (userId: string) =>
      db
        .prepare('SELECT * FROM friendships WHERE sender=? OR receiver=? ORDER BY created_at DESC')
        .all(userId, userId)
        .map((r) => {
          const other = String(r.sender) === userId ? String(r.receiver) : String(r.sender);
          const account = userView(db.prepare('SELECT * FROM accounts WHERE id=?').get(other))!;
          const data = scoped(other);
          const profile = data.pro().profile;
          const shared = r.status === 'accepted' && profile.sharePool;
          return {
            id: String(r.id),
            status: String(r.status),
            incoming: String(r.receiver) === userId,
            user: account,
            shared,
            pool: shared ? effectivePool(data.workspace().pool, profile) : [],
            profile: shared ? profile : null,
          };
        }),
  };
  return { ...scoped('local'), forUser: scoped, identity };
}
export type PlayerStore = ReturnType<typeof createPlayerStore>;
