import test from 'node:test';
import assert from 'node:assert/strict';
import { readRoute, routeHash } from '../../src/player/route.ts';
test('public navigation restores page, tool and hero without serializing private state', () => {
  const route = { page: 'datahub' as const, tool: 'compare', heroId: 544 };
  assert.deepEqual(readRoute(routeHash(route)), route);
  assert.deepEqual(readRoute('#/tier?token=private&hero=190'), { page: 'tier', heroId: 190 });
  assert.equal(routeHash(readRoute('#/tier?token=private&hero=190')), '#/tier?hero=190');
});
test('navigation rejects unknown screens, tools and malformed hero ids', () => {
  assert.deepEqual(readRoute('#/../../private?tool=bad&hero=-1'), { page: 'home' });
  assert.deepEqual(readRoute('#/datahub?tool=bad&hero=1e3'), { page: 'datahub' });
  assert.deepEqual(readRoute('#/heroes?tool=skins'), { page: 'heroes' });
});
