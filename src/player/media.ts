import entries from './data/media-cache.json' with { type: 'json' };
import { siteAsset } from './reviewMode.ts';
const localMedia: Record<string, string> = entries;
export const mediaUrl = (url: string) => siteAsset(localMedia[url] ?? url);
