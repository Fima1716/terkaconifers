import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const BASE_URL = 'https://platform-api.max.ru'

export default defineEventHandler(async (event) => {
  await requireAuth(event, 'super_admin')

  const body = await readBody(event)
  const { id, text, token, chatId } = body

  if (!id || !text) throw createError({ statusCode: 400, message: 'id и text обязательны' })

  const catalogPath = resolve(process.cwd(), 'data/raw/catalog.json')
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'))
  const plant = catalog.find((p: any) => p.id === id)
  if (!plant) throw createError({ statusCode: 404, message: 'Растение не найдено' })

  // Update local catalog text (latin_full is first line)
  const oldLatinFull = plant.latin_full
  const lines = text.split('\n')
  plant.latin_full = lines[0]?.trim() || oldLatinFull

  // Re-extract basic fields from new text
  const nonEmpty = lines.map((l: string) => l.trim()).filter(Boolean)

  // Russian name
  for (const line of nonEmpty.slice(1, 4)) {
    if (/^[А-Яа-яЁё]/.test(line) && !line.startsWith('#')) {
      plant.name_ru = line; break
    }
  }

  // Region
  const geoMarkers = ['обл', 'край', 'район', 'Москв', 'Петербург', 'Сибир', 'Урал']
  for (const line of nonEmpty.slice(1, 8)) {
    if (line.startsWith('#')) continue
    if (geoMarkers.some(m => line.includes(m))) { plant.region = line; break }
  }

  // Age
  for (const line of nonEmpty) {
    if (/возраст/i.test(line)) {
      plant.age = line.replace(/Возраст:?\s*/i, '').trim(); break
    }
  }

  // Hashtags
  plant.hashtags = [...text.matchAll(/#([A-Za-zА-Яа-яЁё0-9_]+)/g)].map((m: any) => m[1])

  // Save locally
  writeFileSync(catalogPath, JSON.stringify(catalog))

  // Try to edit in MAX if token provided and we have mid
  let maxEdited = false
  if (token && plant.max_url) {
    try {
      // We need the mid — fetch the message by URL or use stored mid
      // For now, use the message_id pattern from max_url
      const resp = await fetch(`${BASE_URL}/messages?message_id=${plant._mid || ''}&chat_id=${chatId || '-71324192443065'}`, {
        method: 'PUT',
        headers: { 'Authorization': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      maxEdited = resp.ok
    } catch {
      // MAX edit failed, but local edit succeeded
    }
  }

  return { ok: true, maxEdited, plant: { id: plant.id, latin_full: plant.latin_full } }
})
