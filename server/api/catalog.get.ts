import { readFileSync, statSync } from 'fs'
import { resolve } from 'path'

// Fields to strip from catalog response (unused on frontend, save ~1.5MB)
const STRIP_FIELDS = ['hashtags', 'max_url', 'age', 'garden', 'is_russian', 'garden_type', 'name_ru', 'hardiness_zone', 'hardiness_label']

let cache: any[] | null = null
let cacheMtime = 0
let cacheGardensMtime = 0

function loadAndStrip(path: string): any[] {
  const raw = JSON.parse(readFileSync(path, 'utf-8'))
  return raw.map((p: any) => {
    const slim = { ...p }
    for (const f of STRIP_FIELDS) delete slim[f]
    return slim
  })
}

export default defineEventHandler((event) => {
  setResponseHeader(event, 'Cache-Control', 'public, max-age=30, stale-while-revalidate=600')

  const catalogPath = resolve(process.cwd(), 'public/data/catalog-enriched.json')
  const mtime = statSync(catalogPath).mtimeMs
  const gardensMtime = getGardensMtime()

  if (cache && mtime === cacheMtime && gardensMtime === cacheGardensMtime) return cache

  let plants = loadAndStrip(catalogPath)

  const consented = getConsentedGardens()
  if (consented) {
    plants = plants.filter(p => consented.has(p.garden_display))
  }

  cache = plants
  cacheMtime = mtime
  cacheGardensMtime = gardensMtime
  return cache
})
