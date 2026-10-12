import snapshot from './data/heroes.json' with { type: 'json' };
import type { Hero } from './model.ts';
export const heroes: Hero[] = snapshot.heroes;
export const heroById = (id: number | undefined) => heroes.find((h) => h.id === id);
export const heroByName = (name: string) => heroes.find((h) => h.name === name)!;
export const dataMeta = {
  source: snapshot.source,
  fetchedAt: snapshot.fetchedAt,
  note: snapshot.note,
  count: heroes.length,
  skillCount: heroes.filter((h) => h.skills.length).length,
};
