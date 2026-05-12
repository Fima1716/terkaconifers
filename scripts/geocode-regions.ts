/**
 * Geocode all unique raw region strings from the catalog using Nominatim (OSM).
 * Uses the ORIGINAL region text from channel posts for maximum precision.
 *
 * Run: npx tsx scripts/geocode-regions.ts
 * Output: data/geocodes-cache.json
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const CATALOG_PATH = resolve(process.cwd(), 'data/raw/catalog.json')
const CACHE_PATH = resolve(process.cwd(), 'data/geocodes-cache.json')

// Manual coords for entries that geocoding can't resolve well
const MANUAL: Record<string, [number, number]> = {
  'ДНР': [48.00, 37.80],
  'Урал': [56.84, 60.60],
  'Уфа': [54.74, 55.97],
  'Крым': [44.95, 34.10],
  'г.Москва': [55.755, 37.617],
  'Москва': [55.755, 37.617],
  'Волгоградская область, хутор Тутов': [49.10, 43.80],
  'Московская область|Сахалин': [55.75, 37.62],
  'Сахалинская область|городской парк': [46.96, 142.73],
  'Челябинская область|горно-заводская зона': [55.40, 59.80],
}

// Abbreviation expansions for better geocoding
function cleanQuery(raw: string): string {
  let q = raw.trim()
    .replace(/,?\s*$/, '')          // trailing comma/space
    .replace(/\.\s*$/, '')          // trailing period
    .replace(/^МО\b/i, 'Московская область')
    .replace(/\bобл\.?\b/gi, 'область')
    .replace(/\bр-н\b/gi, 'район')
    .replace(/\bг\.\s*/gi, '')      // "г. Псков" → "Псков"
    .replace(/\bГ\.\s*/gi, '')
    .replace(/\bпос\.\s*/gi, 'поселок ')
    .replace(/\bп\.\s*/gi, 'поселок ')
    .replace(/\bд\.\s*/gi, 'деревня ')
    .replace(/\bс\.\s*/gi, 'село ')
    .replace(/\s+/g, ' ')
    .trim()

  // Remove vague compass directions: "Московская область, ЮВ" → "Московская область"
  q = q.replace(/,\s*(ЮВ|СЗ|юг|Юг|Север|Запад|запад|Юго-запад|Северо-восток|Северо- восток|северо-восток)\s*$/i, '')

  return q
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
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'))

  // Collect unique raw region strings with counts
  const regions = new Map<string, number>()
  for (const p of catalog) {
    const r = (p.region || '').trim()
    if (!r) continue
    regions.set(r, (regions.get(r) || 0) + 1)
  }

  console.log(`Found ${regions.size} unique raw region strings`)

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

  // Find regions not yet geocoded
  const toGeocode: [string, number][] = []
  for (const [raw, count] of regions) {
    if (cache[raw]) continue
    toGeocode.push([raw, count])
  }
  // Sort by count descending — geocode most-used regions first
  toGeocode.sort((a, b) => b[1] - a[1])

  console.log(`Need to geocode: ${toGeocode.length} entries`)

  let success = 0, failed = 0

  for (let i = 0; i < toGeocode.length; i++) {
    const [raw, count] = toGeocode[i]
    const query = cleanQuery(raw) + ', Россия'
    console.log(`[${i + 1}/${toGeocode.length}] (${count} plants) "${raw}" → "${query}"`)

    const coords = await geocode(query)
    if (coords) {
      cache[raw] = coords
      success++
      console.log(`  ✓ ${coords[0].toFixed(4)}, ${coords[1].toFixed(4)}`)
    } else {
      // Try just the first part before comma
      const fallback = raw.split(',')[0].trim() + ', Россия'
      console.log(`  ✗ not found, trying: "${fallback}"`)
      const coords2 = await geocode(fallback)
      if (coords2) {
        cache[raw] = coords2
        success++
        console.log(`  ✓ fallback: ${coords2[0].toFixed(4)}, ${coords2[1].toFixed(4)}`)
      } else {
        failed++
        console.log(`  ✗ FAILED — skipping`)
      }
    }

    // Nominatim rate limit: 1 req/sec
    await new Promise(r => setTimeout(r, 1100))
  }

  // Save cache
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2))
  console.log(`\nSaved ${Object.keys(cache).length} entries to ${CACHE_PATH}`)
  console.log(`Geocoded: ${success} success, ${failed} failed`)

  // Report coverage
  let covered = 0, total = 0
  for (const [raw, count] of regions) {
    total += count
    if (cache[raw]) covered += count
  }
  console.log(`Coverage: ${covered}/${total} plants (${((covered / total) * 100).toFixed(1)}%)`)
}

main().catch(console.error)
