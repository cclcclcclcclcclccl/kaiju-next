import type { Page } from './Dashboard.tsx';
const pages = new Set([
  'home',
  'heroes',
  'resources',
  'datahub',
  'draft',
  'journal',
  'pool',
  'tier',
  'profile',
  'social',
  'systems',
  'replay',
]);
const tools = new Set([
  'global',
  'stats',
  'compare',
  'teaching',
  'equipment',
  'skins',
  'matches',
  'activities',
  'power',
]);
export type AppRoute = { page: Page; tool?: string; heroId?: number };
export function readRoute(hash: string): AppRoute {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const params = new URLSearchParams(query);
  const page = (pages.has(path) ? path : 'home') as Page;
  const tool = params.get('tool') ?? '';
  const raw = params.get('hero') ?? '';
  const heroId = /^\d{1,6}$/.test(raw) && Number(raw) > 0 ? Number(raw) : undefined;
  return {
    page,
    ...(page === 'datahub' && tools.has(tool) ? { tool } : {}),
    ...(heroId ? { heroId } : {}),
  };
}
export function routeHash(route: AppRoute) {
  const params = new URLSearchParams();
  if (route.page === 'datahub' && route.tool && tools.has(route.tool))
    params.set('tool', route.tool);
  if (route.heroId) params.set('hero', String(route.heroId));
  return '#/' + route.page + (params.size ? '?' + params.toString() : '');
}
