export type Equipment = {
  id: number;
  name: string;
  type: string;
  price: number;
  description: string;
  source: string;
};
export type Skin = {
  id: string;
  heroId: number;
  heroName: string;
  name: string;
  quality: string;
  releasedOn: string;
  description: string;
  image: string;
  source: string;
};
export type UpdateArticle = {
  id: number;
  title: string;
  publishedAt: string;
  source: string;
  environment: '正式服' | '体验服';
  text: string;
  heroIds: number[];
  kind: '版本公告' | '官方资讯';
};
export type Resources = {
  fetchedAt: string;
  equipment: Equipment[];
  skins: Skin[];
  updates: UpdateArticle[];
  sources: string[];
  warnings: string[];
};
export type ResourceResult = { data: Resources; stale: boolean; warning?: string };
