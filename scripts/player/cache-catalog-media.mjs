import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
const sha = (data) => createHash('sha256').update(data).digest('hex');
const heroes = JSON.parse(await fs.readFile('src/player/data/heroes.json', 'utf8')).heroes;
const skills = JSON.parse(await fs.readFile('src/player/data/hero-media.json', 'utf8'));
const urls = new Set(heroes.map((h) => h.portrait));
for (const h of heroes) {
  for (const url of Object.values(skills[h.id] ?? {})) urls.add(url);
  for (const r of h.runes ?? [])
    urls.add(`https://game.gtimg.cn/images/yxzj/img201606/mingwen/${r.id}.png`);
  for (const b of h.builds ?? [])
    for (const item of b.items)
      urls.add(`https://game.gtimg.cn/images/yxzj/img201606/itemimg/${item.id}.jpg`);
}
// Exact source URLs only: image fixtures are archived public responses, not invented identities.
for (const file of ['equip-521', 'combined-521']) {
  const raw = JSON.parse(await fs.readFile(`tests/fixtures/tianyuan/${file}.json`, 'utf8'));
  function walk(value) {
    if (
      typeof value === 'string' &&
      /^https:\/\/img\.pvp\.mcxssg\.net\/manage\/(custom_wzryequip|custom_wzry_summonerSkill_icon)\//.test(
        value,
      )
    )
      urls.add(value);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  }
  walk(raw);
}
const root = 'public/media/catalog';
await fs.mkdir(root, { recursive: true });
let previous = {};
try {
  previous = JSON.parse(await fs.readFile('src/player/data/media-cache.json', 'utf8'));
} catch {}
const entries = {},
  proofs = [],
  failures = [],
  list = [...urls];
let cursor = 0;
async function worker() {
  while (cursor < list.length) {
    const url = list[cursor++];
    try {
      const old = previous[url];
      if (old) {
        const bytes = await fs.readFile('public' + old);
        if (old.includes(sha(bytes).slice(0, 20))) {
          entries[url] = old;
          proofs.push({ url, path: old, sha256: sha(bytes), retained: true });
          continue;
        }
      }
      let response;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(12000) });
          if (!response.ok) throw Error('HTTP ' + response.status);
          break;
        } catch (e) {
          if (attempt === 1) throw e;
        }
      }
      const type = response.headers.get('content-type')?.split(';')[0];
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(type))
        throw Error('Unexpected image type ' + type);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 32 || bytes.length > 1024 * 1024) throw Error('Unexpected image size');
      // Some official .jpg responses are PNG bytes with an image/jpeg header.
      const ext =
        bytes[0] === 255 && bytes[1] === 216
          ? 'jpg'
          : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            ? 'png'
            : bytes.subarray(0, 4).toString() === 'RIFF' &&
                bytes.subarray(8, 12).toString() === 'WEBP'
              ? 'webp'
              : null;
      if (!ext) throw Error('Invalid image signature');
      const hash = sha(bytes),
        path = `/media/catalog/${hash.slice(0, 20)}.${ext}`;
      await fs.writeFile('public' + path, bytes);
      entries[url] = path;
      proofs.push({ url, path, sha256: hash, fetchedAt: new Date().toISOString() });
    } catch (e) {
      failures.push({ url, error: e.message });
    }
    if (cursor % 100 === 0) console.log(`${cursor}/${list.length} images inspected`);
    await new Promise((r) => setTimeout(r, 80));
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
await fs.writeFile('src/player/data/media-cache.json', JSON.stringify(entries, null, 2) + '\n');
await fs.writeFile(
  'evidence/visual-bp-v018/media-cache-manifest.json',
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      requested: list.length,
      cached: Object.keys(entries).length,
      proofs,
      failures,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({ requested: list.length, cached: Object.keys(entries).length, failures }),
);
