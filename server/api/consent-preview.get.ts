import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const CATALOG_PATH = resolve(process.cwd(), 'data/catalog-enriched.json')
const GARDENS_PATH = resolve(process.cwd(), 'data/gardens.json')

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const garden = (query.garden as string)?.trim()
  if (!garden) return { plants: [], count: 0, consent: null }

  // Get consent status
  let consent: boolean | null = null
  let consentAt: string | null = null
  if (existsSync(GARDENS_PATH)) {
    try {
      const gData = JSON.parse(readFileSync(GARDENS_PATH, 'utf-8'))
      const entry = gData.gardens?.[garden]
      if (entry && entry.consent !== undefined) {
        consent = !!entry.consent
        consentAt = entry.consentAt || null
      }
    } catch {}
  }

  if (!existsSync(CATALOG_PATH)) return { plants: [], count: 0, consent, consentAt }

  try {
    const data = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'))
    const catalog = data.plants || data
    const gardenNorm = garden.replace(/\s+/g, '').toLowerCase()
    const matches = catalog.filter((p: any) => {
      const g = (p.garden_display || p.garden || '').replace(/\s+/g, '').toLowerCase()
      if (!g) return false
      return g.includes(gardenNorm) || gardenNorm.includes(g)
    })

    const sample = matches.slice(0, 12).map((p: any) => ({
      latin_full: p.latin_full,
      species_ru: p.species_ru,
      thumb: p.thumbs?.[0] || '',
    }))

    return { plants: sample, count: matches.length, consent, consentAt }
  } catch {
    return { plants: [], count: 0, consent, consentAt }
  }
})
