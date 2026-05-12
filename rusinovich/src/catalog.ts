import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface CatalogItem {
  name: string;
  url: string;
  image?: string;
  category: string;
  inStock: boolean;
}

const CATALOG_FILE = join(process.cwd(), 'catalog.json');

const CATEGORIES = [
  { slug: 'eli', label: 'Ели' },
  { slug: 'sosni2', label: 'Сосны 2-хвойные' },
  { slug: 'sosny-5khvoinye', label: 'Сосны 5-хвойные' },
  { slug: 'tui', label: 'Туи' },
  { slug: 'mozhzhevelniki', label: 'Можжевельники' },
  { slug: 'pikhty', label: 'Пихты' },
  { slug: 'lisvennitsy', label: 'Лиственницы' },
  { slug: 'mikrobioty', label: 'Микробиоты и Кипарисовики' },
  { slug: 'drugie-khvoinye', label: 'Другие хвойные' },
  { slug: 'catalog/listvenie', label: 'Лиственные' },
];

let catalog: CatalogItem[] = [];
let lastSync = 0;

function loadCatalog(): CatalogItem[] {
  try {
    if (existsSync(CATALOG_FILE)) {
      const data = JSON.parse(readFileSync(CATALOG_FILE, 'utf-8'));
      catalog = data.items || [];
      lastSync = data.lastSync || 0;
      console.log(`[catalog] Loaded ${catalog.length} items from cache`);
    }
  } catch (err) {
    console.error('[catalog] Failed to load cache:', err);
  }
  return catalog;
}

async function fetchWithRetry(url: string, retries = 2): Promise<string> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error('unreachable');
}

async function scrapeCategory(slug: string, label: string): Promise<CatalogItem[]> {
  const items: CatalogItem[] = [];
  let page = 1;

  while (true) {
    const url = `https://rusinovsad.ru/${slug}.html?p=${page}`;
    let html: string;
    try {
      html = await fetchWithRetry(url);
    } catch (err) {
      console.error(`[catalog] Failed to fetch ${url}:`, err);
      break;
    }

    // Extract JSON-LD
    const jsonldMatch = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/);
    if (!jsonldMatch) break;

    let jsonld: any;
    try {
      jsonld = JSON.parse(jsonldMatch[1]);
    } catch {
      console.error(`[catalog] Invalid JSON-LD on ${url}`);
      break;
    }

    const elements = jsonld.itemListElement || [];
    if (!elements.length) break;
    const totalItems = jsonld.numberOfItems || 0;

    // Extract stock status from product card blocks
    const bodyHtml = html.replace(/<script[^>]*application\/ld\+json[^>]*>[\s\S]*?<\/script>/g, '');
    const stockMap = new Map<string, boolean>();

    const cardBlocks = bodyHtml.split('<div class="noms-item">').slice(1);
    for (const block of cardBlocks) {
      const nidMatch = block.match(/\/nid\/(\d+)/);
      if (!nidMatch) continue;
      const outOfStock = block.includes('noavail') || block.includes('Нет в');
      stockMap.set(nidMatch[1], !outOfStock);
    }

    for (const el of elements) {
      const itemUrl = el.url || '';
      const nidMatch = itemUrl.match(/\/nid\/(\d+)/);
      const nid = nidMatch?.[1] || '';

      items.push({
        name: el.name || '',
        url: itemUrl,
        image: el.image || undefined,
        category: label,
        inStock: stockMap.get(nid) ?? false,
      });
    }

    if (items.length >= totalItems) break;
    if (!html.includes('❯') && !html.includes('&raquo;')) break;
    if (page > 20) break;
    page++;
    await new Promise(r => setTimeout(r, 500));
  }

  return items;
}

export async function syncCatalog(): Promise<CatalogItem[]> {
  console.log('[catalog] Syncing from rusinovsad.ru...');
  const allItems: CatalogItem[] = [];
  let errors = 0;

  for (const cat of CATEGORIES) {
    try {
      const items = await scrapeCategory(cat.slug, cat.label);
      allItems.push(...items);
      console.log(`[catalog] ${cat.label}: ${items.length} items`);
    } catch (err) {
      errors++;
      console.error(`[catalog] Error scraping ${cat.slug}:`, err);
    }
    await new Promise(r => setTimeout(r, 800));
  }

  // Only update if we got meaningful data (don't overwrite good cache with empty data)
  if (allItems.length > 0) {
    const unique = new Map<string, CatalogItem>();
    for (const item of allItems) unique.set(item.url, item);
    catalog = [...unique.values()];
    lastSync = Date.now();

    try {
      writeFileSync(CATALOG_FILE, JSON.stringify({ lastSync, items: catalog }, null, 2), 'utf-8');
    } catch (err) {
      console.error('[catalog] Failed to write cache:', err);
    }
    console.log(`[catalog] Synced ${catalog.length} items (${errors} category errors)`);
  } else {
    console.error('[catalog] Sync returned 0 items, keeping old cache');
  }

  return catalog;
}

export function searchCatalog(query: string): CatalogItem[] {
  if (!catalog.length) loadCatalog();
  if (!catalog.length) return [];

  const q = query.toLowerCase().replace(/[''`]/g, '');
  const words = q.split(/\s+/).filter(w => w.length > 2);

  return catalog
    .map(item => {
      const name = item.name.toLowerCase().replace(/[''`]/g, '');
      let score = 0;
      if (name.includes(q)) score += 10;
      for (const w of words) {
        if (name.includes(w)) score += 3;
      }
      return { item, score };
    })
    .filter(r => r.score > 0)
    .sort((a, b) => {
      if (a.item.inStock !== b.item.inStock) return a.item.inStock ? -1 : 1;
      return b.score - a.score;
    })
    .slice(0, 8)
    .map(r => r.item);
}

export function getCatalog(): CatalogItem[] {
  if (!catalog.length) loadCatalog();
  return catalog;
}

export function getLastSync(): number {
  return lastSync;
}

export function getCatalogStats(): { total: number; inStock: number; lastSync: number } {
  return { total: catalog.length, inStock: catalog.filter(i => i.inStock).length, lastSync };
}

export function getInStockByCategory(): Map<string, CatalogItem[]> {
  if (!catalog.length) loadCatalog();
  const grouped = new Map<string, CatalogItem[]>();
  for (const item of catalog) {
    if (!item.inStock) continue;
    if (!grouped.has(item.category)) grouped.set(item.category, []);
    grouped.get(item.category)!.push(item);
  }
  return grouped;
}

loadCatalog();
