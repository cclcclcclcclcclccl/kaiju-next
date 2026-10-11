import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import type { Economy, SearchResult } from '../src/core/model.ts';
import type { Run, Project, RunSummary } from '../src/core/api-types.ts';

export function createStore(path: string) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, title TEXT NOT NULL, updated_at TEXT NOT NULL, model TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, created_at TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL, model_hash TEXT NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS generations(id TEXT PRIMARY KEY, created_at TEXT NOT NULL, model_name TEXT NOT NULL, input TEXT NOT NULL, output TEXT NOT NULL);
  `);
  return {
    close: () => db.close(),
    saveProject(model: Economy, id?: string): Project {
      const project = {
        id: id ?? randomUUID(),
        title: model.title,
        updatedAt: new Date().toISOString(),
        model,
      };
      db.prepare(
        'INSERT INTO projects VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, updated_at=excluded.updated_at, model=excluded.model',
      ).run(project.id, project.title, project.updatedAt, JSON.stringify(model));
      return project;
    },
    projects(): Project[] {
      return db
        .prepare('SELECT * FROM projects ORDER BY updated_at DESC LIMIT 100')
        .all()
        .map((row) => ({
          id: String(row.id),
          title: String(row.title),
          updatedAt: String(row.updated_at),
          model: JSON.parse(String(row.model)),
        }));
    },
    saveRun(model: Economy, result: SearchResult): Run {
      const modelHash = createHash('sha256').update(JSON.stringify(model)).digest('hex');
      const run: Run = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        modelHash,
        model,
        result,
      };
      db.prepare('INSERT INTO runs VALUES(?,?,?,?,?,?)').run(
        run.id,
        run.createdAt,
        model.title,
        result.status,
        modelHash,
        JSON.stringify(run),
      );
      return run;
    },
    runs(): RunSummary[] {
      return db
        .prepare(
          'SELECT id,created_at,title,status,model_hash FROM runs ORDER BY created_at DESC LIMIT 50',
        )
        .all()
        .map((row) => ({
          id: String(row.id),
          createdAt: String(row.created_at),
          title: String(row.title),
          status: row.status as SearchResult['status'],
          modelHash: String(row.model_hash),
        }));
    },
    getRun(id: string): Run | null {
      const row = db.prepare('SELECT payload FROM runs WHERE id=?').get(id);
      return row ? JSON.parse(String(row.payload)) : null;
    },
    saveGeneration(model: string, input: string, output: unknown) {
      db.prepare('INSERT INTO generations VALUES(?,?,?,?,?)').run(
        randomUUID(),
        new Date().toISOString(),
        model,
        input,
        JSON.stringify(output),
      );
    },
  };
}
export type Store = ReturnType<typeof createStore>;
