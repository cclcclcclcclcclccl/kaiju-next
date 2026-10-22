type ReviewConfig = { base: string; statsDate: string; tierDate: string; builtAt: string };
declare const __REVIEW_CONFIG__: ReviewConfig | null;
// Safe in both the browser build and Node's existing algorithm tests.
export const reviewConfig = typeof __REVIEW_CONFIG__ === 'undefined' ? null : __REVIEW_CONFIG__;
export const reviewMode = Boolean(reviewConfig);
export const siteAsset = (path: string) =>
  reviewConfig && path.startsWith('/') ? reviewConfig.base + path.slice(1) : path;
