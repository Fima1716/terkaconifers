import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

export default defineEventHandler(async (event) => {
  await requireAuth(event, 'super_admin')

  const query = getQuery(event)
  const page = parseInt(String(query.page || '1'))
  const limit = parseInt(String(query.limit || '50'))
  const search = String(query.search || '').toLowerCase()

  const catPath = resolve(process.cwd(), 'public/data/catalog-enriched.json')
  if (!existsSync(catPath)) return { posts: [], total: 0, page, pages: 0 }

  let catalog = JSON.parse(readFileSync(catPath, 'utf-8'))

  // Search
  if (search) {
    catalog = catalog.filter((p: any) =>
      (p.latin_full || '').toLowerCase().includes(search) ||
      (p.name_ru || '').toLowerCase().includes(search) ||
      (p.cultivar || '').toLowerCase().includes(search) ||
      (p.garden_display || '').toLowerCase().includes(search)
    )
  }

  // Reverse order (newest first)
  catalog.reverse()

  const total = catalog.length
  const pages = Math.ceil(total / limit)
  const start = (page - 1) * limit
  const posts = catalog.slice(start, start + limit).map((p: any) => ({
    id: p.id,
    latin_full: p.latin_full,
    name_ru: p.name_ru,
    species_ru: p.species_ru,
    cultivar: p.cultivar,
    region: p.region,
    region_normalized: p.region_normalized,
    age: p.age,
    garden_display: p.garden_display,
    date: p.date,
    is_new: p.is_new,
    is_russian_enriched: p.is_russian_enriched,
    form_ru: p.form_ru,
    color_ru: p.color_ru,
    photos: p.photos?.length || 0,
    thumbs: p.thumbs?.slice(0, 1) || [],
    max_url: p.max_url,
  }))

  return { posts, total, page, pages }
})
