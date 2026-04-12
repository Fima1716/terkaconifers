import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const BASE_URL = 'https://platform-api.max.ru'
const CATALOG_CHANNEL_ID = '-71324192443065'

export default defineEventHandler(async (event) => {
  await requireAuth(event, 'super_admin')

  const id = parseInt(getRouterParam(event, 'id') || '')
  if (!id) throw createError({ statusCode: 400, message: 'Некорректный ID' })

  const { text } = await readBody(event)
  if (!text?.trim()) throw createError({ statusCode: 400, message: 'Текст не может быть пустым' })

  const catalogPath = resolve(process.cwd(), 'data/raw/catalog.json')
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'))
  const plant = catalog.find((p: any) => p._site_id === id || p.id === id)
  if (!plant) throw createError({ statusCode: 404, message: 'Растение не найдено' })

  // Parse text back into catalog fields
  const lines = text.split('\n')
  const nonEmpty = lines.map((l: string) => l.trim()).filter(Boolean)

  // Latin name — first line
  if (nonEmpty[0]) plant.latin_full = nonEmpty[0]

  // Russian name — first Cyrillic line after latin
  for (const line of nonEmpty.slice(1, 4)) {
    if (/^[А-Яа-яЁё]/.test(line) && !line.startsWith('#') && !/^Возраст/i.test(line) && !/^Размер/i.test(line) && !/^Оригинатор/i.test(line)) {
      plant.name_ru = line; break
    }
  }

  // Region — line with geo markers
  const geoMarkers = ['обл', 'край', 'район', 'респ', 'Москв', 'Петербург', 'Сибир', 'Урал', 'Пермск', 'Чайков', 'Башкорт']
  for (const line of nonEmpty.slice(1)) {
    if (line.startsWith('#')) continue
    if (geoMarkers.some(m => line.toLowerCase().includes(m.toLowerCase()))) { plant.region = line; break }
  }

  // Age
  for (const line of nonEmpty) {
    if (/возраст/i.test(line)) {
      plant.age = line.replace(/Возраст:?\s*/i, '').trim(); break
    }
  }

  // Size
  for (const line of nonEmpty) {
    if (/размер/i.test(line)) {
      plant.size = line.replace(/Размер:?\s*/i, '').trim(); break
    }
  }

  // Originator
  for (const line of nonEmpty) {
    if (/оригинатор/i.test(line)) {
      plant.originator = line.replace(/Оригинатор:?\s*/i, '').trim(); break
    }
  }

  // Garden — line before hashtags that's not a known field
  const hashtagLines = nonEmpty.filter(l => l.startsWith('#'))
  const hashIdx = hashtagLines.length ? nonEmpty.indexOf(hashtagLines[0]) : -1
  if (hashIdx > 0) {
    const gardenLine = nonEmpty[hashIdx - 1]
    if (gardenLine && !gardenLine.startsWith('#') && !/возраст|размер|оригинатор/i.test(gardenLine)) {
      plant.garden = gardenLine.replace(/\s+/g, '')
    }
  }

  // Hashtags
  plant.hashtags = [...text.matchAll(/#([A-Za-zА-Яа-яЁё0-9_]+)/g)].map((m: any) => m[1])

  // Save raw catalog
  writeFileSync(catalogPath, JSON.stringify(catalog))

  // Edit in MAX
  let maxEdited = false
  const token = process.env.MAX_BOT_TOKEN
  const mid = plant._mid

  if (token && mid) {
    try {
      const resp = await fetch(`${BASE_URL}/messages?message_id=${mid}&chat_id=${CATALOG_CHANNEL_ID}`, {
        method: 'PUT',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      maxEdited = resp.ok
    } catch {}
  }

  // Re-enrich
  try {
    const { execSync } = await import('child_process')
    execSync(`npx tsx ${resolve(process.cwd(), 'scripts/enrich.ts')}`, {
      cwd: process.cwd(), timeout: 30000, stdio: 'ignore',
    })
  } catch {}

  return { ok: true, maxEdited, hasMid: !!mid }
})
