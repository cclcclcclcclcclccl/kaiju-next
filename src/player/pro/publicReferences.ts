import observed from '../../../examples/tianyuan-reviewed-2026-10-11.json' with { type: 'json' };
import { snapshotSchema } from './model.ts';
import type { StatSnapshot } from './model.ts';
export const publicReference: StatSnapshot = {
  ...snapshotSchema.parse(observed),
  id: 'public-tianyuan-2026-10-11',
  importedAt: '',
}; // Bundled reference, never imported into the user's database.
export function withPublicReference(snapshots: StatSnapshot[]) {
  return snapshots.some((s) => s.id === publicReference.id)
    ? snapshots
    : [...snapshots, publicReference];
}
