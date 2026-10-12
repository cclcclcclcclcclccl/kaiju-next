import type { Hero } from '../model.ts';
import { searchCoach } from './coach.ts';
import type { CoachInput } from './coach.ts';
self.onmessage = (event: MessageEvent<{ heroes: Hero[]; input: CoachInput }>) => {
  try {
    self.postMessage({ ok: true, result: searchCoach(event.data.heroes, event.data.input) });
  } catch (e) {
    self.postMessage({ ok: false, error: (e as Error).message });
  }
};
