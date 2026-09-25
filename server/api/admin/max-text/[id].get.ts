import { readFileSync } from 'fs'
import { resolve } from 'path'

function buildMaxText(plant: any): string {
  const lines: string[] = []
  lines.push(plant.latin_full)
  if (plant.name_ru) lines.push(plant.name_ru)
  lines.push('')
  if (plant.region) lines.push(plant.region)
  if (plant.age) lines.push(`Возраст: ${plant.age}`)
  if (plant.size) lines.push(`Размер: ${plant.size}`)
  if (plant.originator) lines.push(`Оригинатор: ${plant.originator}`)
  const gardenDisplay = plant.garden?.replace(/([a-zа-яё])([A-ZА-ЯЁ])/g, '$1 $2') || ''
  if (gardenDisplay) lines.push(gardenDisplay)
  if (plant.hashtags?.length) {
    for (const h of plant.hashtags) lines.push(`#${h}`)
  }
  return lines.join('\n')
}

export default defineEventHandler(async (event) => {
  await requireContentEditor(event)

  const id = parseInt(getRouterParam(event, 'id') || '')
  if (!id) throw createError({ statusCode: 400, message: 'Некорректный ID' })

  const catalogPath = resolve(process.cwd(), 'data/raw/catalog.json')
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'))
  const plant = catalog.find((p: any) => p._site_id === id || p.id === id)
  if (!plant) throw createError({ statusCode: 404, message: 'Растение не найдено' })

  return {
    text: buildMaxText(plant),
    hasMid: !!plant._mid,
    maxUrl: plant.max_url || null,
  }
})
