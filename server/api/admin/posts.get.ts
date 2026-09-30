import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

/** Признаки «недочётов» в карточке — то, что админам нужно находить и править */
const PROBLEM_CHECKS: Record<string, (p: any) => boolean> = {
  noPhoto: p => !(p.photos?.length),
  noRegion: p => !p.region_normalized && !p.region,
  noAge: p => !p.age && !p.age_display,
  noRu: p => !p.name_ru && !p.species_ru,
}

export default defineEventHandler(async (event) => {
  await requireContentEditor(event)

  const query = getQuery(event)
  const page = parseInt(String(query.page || '1'))
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit || '50'))))
  const search = String(query.search || '').toLowerCase()
  const onlyNew = String(query.onlyNew || '') === '1'
  const filter = String(query.filter || '')

  const catPath = resolve(process.cwd(), 'public/data/catalog-enriched.json')
  if (!existsSync(catPath)) {
    return { posts: [], total: 0, page, pages: 0, counts: { total: 0, new: 0, noPhoto: 0, noRegion: 0, noAge: 0, noRu: 0 } }
  }

  const full = JSON.parse(readFileSync(catPath, 'utf-8'))

  // Счётчики по всему каталогу — для бейджей на фильтрах
  const counts = {
    total: full.length,
    new: 0, noPhoto: 0, noRegion: 0, noAge: 0, noRu: 0,
  }
  for (const p of full) {
    if (p.is_new) counts.new++
    if (PROBLEM_CHECKS.noPhoto(p)) counts.noPhoto++
    if (PROBLEM_CHECKS.noRegion(p)) counts.noRegion++
    if (PROBLEM_CHECKS.noAge(p)) counts.noAge++
    if (PROBLEM_CHECKS.noRu(p)) counts.noRu++
  }

  let catalog = full

  if (onlyNew) catalog = catalog.filter((p: any) => p.is_new)

  if (filter && PROBLEM_CHECKS[filter]) {
    catalog = catalog.filter(PROBLEM_CHECKS[filter])
  }

  // Search
  if (search) {
    catalog = catalog.filter((p: any) =>
      (p.latin_full || '').toLowerCase().includes(search) ||
      (p.name_ru || '').toLowerCase().includes(search) ||
      (p.cultivar || '').toLowerCase().includes(search) ||
      (p.garden_display || '').toLowerCase().includes(search)
    )
  }

  // Reverse order (newest first) — копия, чтобы не мутировать общий массив
  catalog = catalog.slice().reverse()

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
    age_display: p.age_display,
    garden_display: p.garden_display,
    date: p.date,
    is_new: p.is_new,
    is_russian_enriched: p.is_russian_enriched,
    form_ru: p.form_ru,
    color_ru: p.color_ru,
    photos: p.photos?.length || 0,
    thumbs: p.thumbs?.slice(0, 1) || [],
    max_url: p.max_url,
    problems: Object.keys(PROBLEM_CHECKS).filter(k => PROBLEM_CHECKS[k](p)),
  }))

  return { posts, total, page, pages, counts }
})
