import { readFile, writeFile, mkdir } from 'node:fs/promises';
const source = process.argv[2] || '/tmp/marvel-watchlist-catalog.json';
const raw = JSON.parse(await readFile(source, 'utf8'));
const items = Array.isArray(raw) ? raw : (raw.items ?? raw.entries);
if (!Array.isArray(items) || items.length < 160) throw new Error('Catalog missing or incomplete');
await mkdir(new URL('../data/', import.meta.url), { recursive: true });
await writeFile(new URL('../data/watchlist.json', import.meta.url), JSON.stringify(items, null, 2) + '\n');
console.log(`Imported ${items.length} titles`);
