/**
 * Geocode all unique region+district combinations using Nominatim (OSM).
 * Run: npx tsx scripts/geocode-regions.ts
 * Output: data/geocodes-cache.json
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const ENRICHED_PATH = resolve(process.cwd(), 'data/catalog-enriched.json')
const CACHE_PATH = resolve(process.cwd(), 'data/geocodes-cache.json')

// Manual coords for entries that geocoding can't resolve well
const MANUAL: Record<string, [number, number]> = {
  'ДНР': [48.00, 37.80],
  'Урал': [56.84, 60.60],
  'Урал|Южный Урал': [54.5, 59.0],
  'Уфа': [54.74, 55.97],
  'Крым': [44.95, 34.10],
  'г.Москва': [55.755, 37.617],
  // Moscow Oblast compass directions → approximate coords
  'Московская область|ЮВ': [55.42, 38.50],
  'Московская область|юг': [55.30, 37.60],
  'Московская область|Запад': [55.70, 36.40],
  'Московская область|запад': [55.70, 36.40],
  'Московская область|СЗ': [56.05, 36.70],
  'Московская область|Север': [56.20, 37.50],
  'Московская область|Северо-восток': [56.00, 38.50],
  'Московская область|Северо- восток': [56.00, 38.50],
  'Московская область|северо-восток': [56.00, 38.50],
  'Московская область|Юго-запад': [55.30, 36.80],
  'Ленинградская область|юг': [59.30, 30.30],
  'Ленинградская область|северо-запад': [60.20, 29.70],
  'Волгоградская область, хутор Тутов': [49.10, 43.80],
  // Vague districts
  'Ярославская область|200 км к северу от Москвы': [57.63, 39.87],
  'Московская область|Раменский р-н, садик питомника': [55.57, 38.22],
  'Ленинградская область|обл., Тосненский район': [59.55, 30.88],
  'Ленинградская область|Пушкинский район, Санкт-Петербург': [59.72, 30.40],
  'Тверская область|Вышневолоцкий район, д. Карзово': [57.59, 34.56],
  'Беларусь|Минская область, Радошковичи': [54.15, 27.23],
  'Московская область|Сахалин': [55.75, 37.62], // likely misclassified
  'Челябинская область|горно-заводская зона': [55.40, 59.80],
  'Сахалинская область|городской парк': [46.96, 142.73],
}

// Normalize district duplicates → canonical form
const DISTRICT_ALIASES: Record<string, string> = {
  'Сергиево Посадский район': 'Сергиево-Посадский район',
  'Сергиево-Посадский р-н': 'Сергиево-Посадский район',
  'Сергиево- Посадский район': 'Сергиево-Посадский район',
  'Сергиево_Посадский район': 'Сергиево-Посадский район',
  'Сергиево - Посадский район': 'Сергиево-Посадский район',
  'Лотошинский р-н': 'Лотошинский район',
  'г. Миасс': 'г.Миасс',
  'г. Пятигорск': 'г.Пятигорск',
  'г. Иркутск': 'г.Иркутск',
  'г. Ростов-на-Дону': 'г.Ростов-на-Дону',
  'Ростов-на-Дону': 'г.Ростов-на-Дону',
  'г. Черноголовка': 'Черноголовка',
  'г. Химки': 'Химкинский район',
  'Чеховский  район': 'Чеховский район',
  'Чеховский раон': 'Чеховский район',
  'г. Чайковский': 'Чайковский',
  'г. Щёлково': 'Щёлковский район',
  'г. Покров': 'г.Покров',
  'г. Дорогобуж': 'г.Дорогобуж',
}

function normalizeKey(region: string, district: string): string {
  const nd = DISTRICT_ALIASES[district] || district
  return nd ? `${region}|${nd}` : region
}

function buildQuery(region: string, district: string): string {
  // Clean up district for geocoding query
  let d = district
    .replace(/^г\.?\s*/, '')  // remove "г." prefix
    .replace(/\s*р-н$/, ' район')
    .replace(/^п\./, 'поселок ')
    .replace(/^пос\.?\s*/, 'поселок ')
    .trim()

  if (d) {
    return `${d}, ${region}, Россия`
  }
  return `${region}, Россия`
}

async function geocode(query: string): Promise<[number, number] | null> {
  const url = `https://nominatim.openstreetmap.org/search?` + new URLSearchParams({
    q: query,
    format: 'json',
    limit: '1',
    countrycodes: 'ru,by',
    'accept-language': 'ru',
  })

  const resp = await fetch(url, {
    headers: { 'User-Agent': 'TerkaConifersMap/1.0 (terka.conifers@gmail.com)' },
  })

  if (!resp.ok) {
    console.error(`  HTTP ${resp.status} for: ${query}`)
    return null
  }

  const data = await resp.json()
  if (data.length === 0) return null

  return [parseFloat(data[0].lat), parseFloat(data[0].lon)]
}

async function main() {
  const catalog = JSON.parse(readFileSync(ENRICHED_PATH, 'utf-8'))

  // Collect unique combos
  const combos = new Map<string, number>()
  for (const p of catalog) {
    const rn = p.region_normalized || ''
    const rd = p.region_district || ''
    if (!rn) continue
    const key = normalizeKey(rn, rd)
    combos.set(key, (combos.get(key) || 0) + 1)
  }

  console.log(`Found ${combos.size} unique region+district combinations`)

  // Load existing cache
  let cache: Record<string, [number, number]> = {}
  if (existsSync(CACHE_PATH)) {
    cache = JSON.parse(readFileSync(CACHE_PATH, 'utf-8'))
    console.log(`Loaded ${Object.keys(cache).length} cached entries`)
  }

  // Add all manual entries
  for (const [key, coords] of Object.entries(MANUAL)) {
    cache[key] = coords
  }

  // Geocode missing entries
  const toGeocode: [string, string, string][] = [] // [key, region, district]
  for (const [key] of combos) {
    if (cache[key]) continue
    const [region, district] = key.includes('|') ? key.split('|', 2) : [key, '']
    toGeocode.push([key, region, district])
  }

  console.log(`Need to geocode: ${toGeocode.length} entries`)

  for (let i = 0; i < toGeocode.length; i++) {
    const [key, region, district] = toGeocode[i]
    const query = buildQuery(region, district)
    console.log(`[${i + 1}/${toGeocode.length}] ${key} → "${query}"`)

    const coords = await geocode(query)
    if (coords) {
      cache[key] = coords
      console.log(`  ✓ ${coords[0].toFixed(4)}, ${coords[1].toFixed(4)}`)
    } else {
      // Try region-only fallback
      const fallbackQuery = `${region}, Россия`
      console.log(`  ✗ not found, trying: "${fallbackQuery}"`)
      const fallback = await geocode(fallbackQuery)
      if (fallback) {
        cache[key] = fallback
        console.log(`  ✓ fallback: ${fallback[0].toFixed(4)}, ${fallback[1].toFixed(4)}`)
      } else {
        console.log(`  ✗ FAILED — skipping`)
      }
    }

    // Nominatim rate limit: 1 req/sec
    await new Promise(r => setTimeout(r, 1100))
  }

  // Save cache
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2))
  console.log(`\nSaved ${Object.keys(cache).length} entries to ${CACHE_PATH}`)

  // Report coverage
  let covered = 0, total = 0
  for (const [key, count] of combos) {
    total += count
    if (cache[key]) covered += count
  }
  console.log(`Coverage: ${covered}/${total} plants (${((covered / total) * 100).toFixed(1)}%)`)
}

main().catch(console.error)
