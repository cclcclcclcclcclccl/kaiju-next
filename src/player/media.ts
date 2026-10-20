import entries from './data/media-cache.json' with { type: 'json' };
const localMedia: Record<string, string> = entries;
export const mediaUrl = (url: string) => localMedia[url] ?? url;
