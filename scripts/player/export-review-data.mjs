// Explicit allowlist: public-source caches only. Never read account databases or personal backups.
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tianyuanQuerySchema, parseTianyuan, tianyuanUrl } from '../../src/player/pro/tianyuan.ts';
import { plusQuerySchema, parsePlus, plusUrl } from '../../src/player/pro/sourcePlus.ts';
import { officialRankSchema } from '../../src/player/pro/official.ts';
import { resourceSchema } from '../../server/pro/resources.ts';
const out = 'public/review-data';
await mkdir(out, { recursive: true });
const hash = (text) => createHash('sha256').update(text).digest('hex');
const manifest = {
  format: 'zizai-public-review-v1',
  builtAt: new Date().toISOString(),
  defaultDate: '2026-10-13',
  entries: {},
  excluded: [],
};
const warning = '固定在线版发布快照，非实时请求。来源日期、原始获取时间与校验值保持不变。';
async function save(key, value) {
  const text = JSON.stringify(value),
    sha256 = hash(text),
    file = sha256 + '.json';
  await writeFile(out + '/' + file, text);
  manifest.entries[key] = { file, sha256 };
}
for (const [folder, kind] of [
  ['data/tianyuan', 'tianyuan'],
  ['data/tianyuan-plus', 'plus'],
]) {
  for (const file of (await readdir(folder + '/cache')).filter((f) => f.endsWith('.json')).sort()) {
    try {
      const packet = JSON.parse(await readFile(folder + '/cache/' + file, 'utf8'));
      const q = (kind === 'tianyuan' ? tianyuanQuerySchema : plusQuerySchema).parse(packet.query);
      // Public invite codes and identifiable match/player records are unnecessary for judging core features.
      if (['codes', 'players', 'matches', 'match'].includes(q.kind)) continue;
      const url = kind === 'tianyuan' ? tianyuanUrl(q) : plusUrl(q);
      if (url !== packet.url || !/^[a-f0-9]{64}$/.test(packet.rawSha256))
        throw Error('source mismatch');
      const raw = await readFile(folder + '/raw/' + packet.rawSha256 + '.json', 'utf8');
      if (hash(raw) !== packet.rawSha256) throw Error('raw SHA-256 mismatch');
      const data =
        kind === 'tianyuan'
          ? parseTianyuan(JSON.parse(raw), q)
          : parsePlus(JSON.parse(raw), q.kind);
      const key =
        kind === 'tianyuan'
          ? '/tianyuan/' +
            [
              q.kind,
              ['duration', 'analysis'].includes(q.kind) ? 'undated' : (q.date ?? 'undated'),
              q.mode ?? 0,
              q.heroId ?? 0,
            ].join('-')
          : url;
      await save(key, {
        source: packet.source,
        sourceClass: 'third-party-public',
        url,
        query: q,
        requestedDate: packet.requestedDate,
        sourceUpdatedAt: packet.sourceUpdatedAt,
        fetchedAt: packet.fetchedAt,
        rawSha256: packet.rawSha256,
        cache: 'stale',
        warning,
        data,
      });
    } catch (error) {
      manifest.excluded.push({ file: kind + '/' + file, reason: error.message });
    }
  }
}
for (const file of (await readdir('data/official-ranks')).filter((f) => /^\d-\d\.json$/.test(f))) {
  const data = officialRankSchema.parse(
    JSON.parse(await readFile('data/official-ranks/' + file, 'utf8')),
  );
  await save('/official/hero-rank/' + file.slice(0, -5), { data, cache: 'stale', warning });
}
await save('/resources', {
  data: resourceSchema.parse(
    JSON.parse(await readFile('data/public-resources/resources.json', 'utf8')),
  ),
  stale: true,
  warning,
});
const cases = JSON.parse(await readFile('data/kpl/cases.json', 'utf8'));
await save('/kpl/cases', { ...cases, warning });
for (const mode of [1, 3, 4, 5]) {
  if (!manifest.entries['/tianyuan/stats-' + manifest.defaultDate + '-' + mode + '-0'])
    throw Error('Missing default ranking');
}
if (!manifest.entries['/tianyuan/tier-' + manifest.defaultDate + '-0-0'])
  throw Error('Missing default tier');
await writeFile(out + '/manifest.json', JSON.stringify(manifest, null, 2));
console.log(
  JSON.stringify({
    entries: Object.keys(manifest.entries).length,
    excluded: manifest.excluded,
    defaultDate: manifest.defaultDate,
  }),
);
