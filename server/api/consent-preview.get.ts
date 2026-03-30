import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const CATALOG_PATH = resolve(process.cwd(), 'data/catalog-enriched.json')

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const garden = (query.garden as string)?.trim()
  if (!garden) return { plants: [], count: 0 }

  if (!existsSync(CATALOG_PATH)) return { plants: [], count: 0 }

  try {
    const data = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'))
    const catalog = data.plants || data
    const gardenNorm = garden.replace(/\s+/g, '').toLowerCase()
    const matches = catalog.filter((p: any) => {
      const g = (p.garden_display || p.garden || '').replace(/\s+/g, '').toLowerCase()
      return g.includes(gardenNorm) || gardenNorm.includes(g)
    })

    // Return count + sample plants (first 12 with minimal data)
    const sample = matches.slice(0, 12).map((p: any) => ({
      latin_full: p.latin_full,
      species_ru: p.species_ru,
      thumb: p.thumbs?.[0] || '',
    }))

    return { plants: sample, count: matches.length }
  } catch {
    return { plants: [], count: 0 }
  }
})
