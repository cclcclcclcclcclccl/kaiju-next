import { heroes } from '../../src/player/catalog.ts';
import { fetchResources } from '../../server/pro/resources.ts';
import fs from 'node:fs';
const result = await fetchResources(heroes);
fs.mkdirSync('data/public-resources', { recursive: true });
fs.writeFileSync('data/public-resources/resources.json', JSON.stringify(result));
fs.mkdirSync('evidence/data-upgrade', { recursive: true });
fs.writeFileSync(
  'evidence/data-upgrade/official-resource-verification.json',
  JSON.stringify(
    {
      checkedAt: result.fetchedAt,
      equipment: result.equipment.length,
      skins: result.skins.length,
      updates: result.updates.map(({ text, ...r }) => ({ ...r, textLength: text.length })),
      sources: result.sources,
      warnings: result.warnings,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    equipment: result.equipment.length,
    skins: result.skins.length,
    updates: result.updates.length,
    withText: result.updates.filter((r) => r.text).length,
    warnings: result.warnings,
  }),
);
