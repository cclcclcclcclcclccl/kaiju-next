import observed from '../../../examples/tianyuan-expanded-2026-10-11.json' with { type: 'json' };
import latest from '../../../examples/tianyuan-expanded-2026-10-12.json' with { type: 'json' };
import { snapshotSchema } from './model.ts';
import type { StatSnapshot } from './model.ts';
export const previousPublicReference: StatSnapshot = {
  ...snapshotSchema.parse(observed),
  id: 'public-tianyuan-2026-10-11',
  importedAt: '',
}; // Bundled reference, never imported into the user's database.
export const publicReference: StatSnapshot = {
  ...snapshotSchema.parse(latest),
  id: 'public-tianyuan-2026-10-12',
  importedAt: '',
};
export const publicReferences = [publicReference, previousPublicReference];
export function withPublicReference(snapshots: StatSnapshot[]) {
  return [...snapshots, ...publicReferences.filter((r) => !snapshots.some((s) => s.id === r.id))];
}
