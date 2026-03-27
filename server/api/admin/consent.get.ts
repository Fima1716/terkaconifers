import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

export default defineEventHandler(async (event) => {
  await requireAuth(event, 'super_admin')

  // Get ALL gardens from raw catalog (unfiltered by consent)
  const catalogPath = resolve(process.cwd(), 'public/data/catalog-enriched.json')
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'))

  const counts = new Map<string, number>()
  for (const p of catalog) {
    if (p.garden_display) counts.set(p.garden_display, (counts.get(p.garden_display) || 0) + 1)
  }

  const gardens = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  // Get consent status
  const gardensPath = resolve(process.cwd(), 'data/gardens.json')
  let consents: Record<string, boolean> = {}
  if (existsSync(gardensPath)) {
    try {
      const data = JSON.parse(readFileSync(gardensPath, 'utf-8'))
      for (const g of gardens) {
        consents[g.name] = data.gardens?.[g.name]?.consent === true
      }
    } catch {}
  }

  return { gardens, consents }
})
