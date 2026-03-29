import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const BASE_URL = 'https://platform-api.max.ru'

const EDITABLE_FIELDS = [
  'latin_full', 'name_ru', 'cultivar', 'species', 'genus', 'genus_ru',
  'region', 'age', 'garden', 'is_russian', 'size', 'originator',
]

// Build post text for MAX channel from plant data
function buildMaxText(plant: any): string {
  const lines: string[] = []

  // Latin name
  lines.push(plant.latin_full)

  // Russian species name
  if (plant.name_ru) lines.push(plant.name_ru)

  // Empty line
  lines.push('')

  // Region
  if (plant.region) lines.push(plant.region)

  // Age
  if (plant.age) lines.push(`Возраст: ${plant.age}`)

  // Size
  if (plant.size) lines.push(`Размер: ${plant.size}`)

  // Originator
  if (plant.originator) lines.push(`Оригинатор: ${plant.originator}`)

  // Garden (display name from hashtag or raw)
  const gardenDisplay = plant.garden?.replace(/([a-zа-яё])([A-ZА-ЯЁ])/g, '$1 $2') || ''
  if (gardenDisplay) lines.push(gardenDisplay)

  // Hashtags
  if (plant.hashtags?.length) {
    for (const h of plant.hashtags) lines.push(`#${h}`)
  }

  return lines.join('\n')
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const id = parseInt(getRouterParam(event, 'id') || '')
  if (!id) throw createError({ statusCode: 400, message: 'Некорректный ID' })

  const updates = await readBody(event)

  // Find plant in enriched catalog (has the ID used on the site)
  const enrichedPath = resolve(process.cwd(), 'public/data/catalog-enriched.json')
  const enriched = JSON.parse(readFileSync(enrichedPath, 'utf-8'))
  const enrichedPlant = enriched.find((p: any) => p.id === id)
  if (!enrichedPlant) throw createError({ statusCode: 404, message: 'Растение не найдено' })

  // Find matching plant in raw catalog
  const catalogPath = resolve(process.cwd(), 'data/raw/catalog.json')
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'))

  // Primary: match by _site_id (persisted stable ID, survives edits)
  let plant = catalog.find((p: any) => p._site_id === id)

  // Fallback: match by max_url
  if (!plant && enrichedPlant.max_url) {
    plant = catalog.find((p: any) => p.max_url === enrichedPlant.max_url)
  }

  // Fallback: match by latin_full + garden
  if (!plant) {
    plant = catalog.find((p: any) =>
      p.latin_full === enrichedPlant.latin_full &&
      (enrichedPlant.garden_display || '').replace(/\s+/g, '').toLowerCase().includes((p.garden || '').toLowerCase())
    )
  }

  if (!plant) throw createError({ statusCode: 404, message: 'Растение не найдено в исходном каталоге' })

  // Apply editable fields
  let textChanged = false
  for (const field of EDITABLE_FIELDS) {
    if (updates[field] !== undefined && updates[field] !== plant[field]) {
      plant[field] = updates[field]
      textChanged = true
    }
  }

  // Handle photo reorder/delete (site only, not MAX)
  let photosChanged = false
  if (updates.photos && Array.isArray(updates.photos)) {
    const oldPhotos = JSON.stringify(plant.photos)
    if (oldPhotos !== JSON.stringify(updates.photos)) {
      plant.photos = updates.photos
      plant.thumbs = updates.photos.map((p: string) => p.replace('.jpg', '_thumb.jpg'))
      photosChanged = true
    }
  }

  if (!textChanged && !photosChanged) return { ok: true, changed: false, maxEdited: false }

  // Save raw catalog
  writeFileSync(catalogPath, JSON.stringify(catalog))

  // Edit post in MAX messenger (only when text fields changed, not photo reorder)
  let maxEdited = false
  const token = process.env.MAX_BOT_TOKEN
  const mid = plant._mid

  if (textChanged && token && mid) {
    try {
      const text = buildMaxText(plant)
      const resp = await fetch(`${BASE_URL}/messages?message_id=${mid}`, {
        method: 'PUT',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const result: any = await resp.json()
      maxEdited = !!result.success
    } catch {
      // MAX edit failed, but local edit succeeded
    }
  }

  // Run enrichment to update enriched catalog
  try {
    const { execSync } = await import('child_process')
    execSync(`npx tsx ${resolve(process.cwd(), 'scripts/enrich.ts')}`, {
      cwd: process.cwd(), timeout: 30000, stdio: 'ignore',
    })
  } catch {}

  return { ok: true, changed: true, maxEdited, hasMid: !!mid }
})
