import type { Hero } from '../model.ts';
import { simulateDraft } from './arena.ts';
self.onmessage = (event: MessageEvent<{ seed: number; heroes: Hero[] }>) => {
  try {
    const result = simulateDraft(event.data.heroes, event.data.seed, 'coverage', (move) =>
      self.postMessage({ progress: move }),
    );
    self.postMessage({ result });
  } catch (e) {
    self.postMessage({ error: (e as Error).message });
  }
};
