import { readFileSync, statSync } from 'fs'
import { resolve } from 'path'

let cache: any = null
let cacheMtime = 0
let cacheGardensMtime = 0

export default defineEventHandler((event) => {
  setResponseHeader(event, 'Cache-Control', 'public, max-age=30, stale-while-revalidate=600')

  const filtersPath = resolve(process.cwd(), 'public/data/filters-enriched.json')
  const mtime = statSync(filtersPath).mtimeMs
  const gardensMtime = getGardensMtime()

  if (cache && mtime === cacheMtime && gardensMtime === cacheGardensMtime) return cache

  const filters = JSON.parse(readFileSync(filtersPath, 'utf-8'))
  const consented = getConsentedGardens()

  if (consented) {
    // Rebuild counts from filtered catalog
    const catalogPath = resolve(process.cwd(), 'public/data/catalog-enriched.json')
    const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'))
      .filter((p: any) => consented.has(p.garden_display))

    // Genera counts
    const genusCounts = new Map<string, number>()
    for (const p of catalog) genusCounts.set(p.genus, (genusCounts.get(p.genus) || 0) + 1)
    filters.genera = filters.genera
      .map((g: any) => ({ ...g, count: genusCounts.get(g.value) || 0 }))
      .filter((g: any) => g.count > 0)

    // Species counts
    for (const genus of Object.keys(filters.species)) {
      const speciesCounts = new Map<string, number>()
      for (const p of catalog) {
        if (p.genus === genus && p.species) speciesCounts.set(p.species, (speciesCounts.get(p.species) || 0) + 1)
      }
      filters.species[genus] = filters.species[genus]
        .map((s: any) => ({ ...s, count: speciesCounts.get(s.value) || 0 }))
        .filter((s: any) => s.count > 0)
    }

    // Region counts
    const regionCounts = new Map<string, number>()
    for (const p of catalog) if (p.region_normalized) regionCounts.set(p.region_normalized, (regionCounts.get(p.region_normalized) || 0) + 1)
    filters.regions = filters.regions
      .map((r: any) => ({ ...r, count: regionCounts.get(r.value) || 0 }))
      .filter((r: any) => r.count > 0)

    // Age range counts
    for (const ar of filters.ageRanges) {
      const [minStr, maxStr] = ar.value.split('-')
      const min = parseInt(minStr)
      const max = maxStr === '+' || !maxStr ? 999 : parseInt(maxStr)
      ar.count = catalog.filter((p: any) => p.age_min != null && p.age_min >= min && (p.age_max ?? p.age_min) <= max).length
    }

    // Russian count
    filters.russianCount = catalog.filter((p: any) => p.is_russian).length
  }

  cache = filters
  cacheMtime = mtime
  cacheGardensMtime = gardensMtime
  return cache
})
