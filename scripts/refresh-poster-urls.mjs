import { readFile, writeFile } from 'node:fs/promises';

const catalogPath = new URL('../data/watchlist.json', import.meta.url);
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const concurrency = 4;
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function mediaKinds(item) {
  if (item.type === 'tv') return ['tv', 'movie'];
  if (item.type === 'movie') return ['movie', 'tv'];
  return ['movie', 'tv'];
}

async function tmdbPoster(item) {
  if (!item.tmdbId) return null;
  for (const kind of mediaKinds(item)) {
    let response;
    for (let attempt = 0; attempt < 4; attempt++) {
      response = await fetch(`https://www.themoviedb.org/${kind}/${item.tmdbId}?language=en-US`, {
        headers: { 'user-agent': 'Doomsday Protocol poster refresh (personal tracker)' },
      });
      if (response.status !== 429 && response.status < 500) break;
      await sleep(500 * (attempt + 1));
    }
    if (!response) continue;
    if (!response.ok) continue;
    const html = await response.text();
    const match = html.match(/<meta property="og:image" content="([^"]+)"/);
    if (match?.[1]) return match[1].replace('https://media.themoviedb.org/', 'https://image.tmdb.org/');
  }
  return null;
}

let cursor = 0;
let updated = 0;
async function worker() {
  while (cursor < catalog.length) {
    const index = cursor++;
    const item = catalog[index];
    const posterUrl = await tmdbPoster(item);
    if (posterUrl && posterUrl !== item.posterUrl) {
      item.posterUrl = posterUrl;
      updated++;
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));

const brandNewDay = catalog.find((item) => item.n === 163);
if (brandNewDay) {
  brandNewDay.posterUrl = 'https://www.sonypictures.com/sites/default/files/title-key-art/spidermanbrandnewday_onesheet_1400x2100.jpg';
}

await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Updated ${updated} TMDB poster URLs; applied the Sony Brand New Day one-sheet override.`);
