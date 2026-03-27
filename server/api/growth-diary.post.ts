import { readMultipartFormData, createError } from 'h3'
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs'
import { resolve } from 'path'

const DATA_PATH = resolve(process.cwd(), 'data/growth-diary.json')
const UPLOAD_DIR = resolve(process.cwd(), 'public/uploads/growth')

// Rate limit
const lastPost = new Map<string, number>()

export default defineEventHandler(async (event) => {
  const ip = getHeader(event, 'x-real-ip') || getHeader(event, 'x-forwarded-for') || 'unknown'
  const now = Date.now()
  if (lastPost.has(ip) && now - lastPost.get(ip)! < 30000) {
    throw createError({ statusCode: 429, message: 'Подождите перед следующей загрузкой' })
  }

  const formData = await readMultipartFormData(event)
  if (!formData) throw createError({ statusCode: 400, message: 'Нет данных' })

  const fields: Record<string, string> = {}
  let imageFile: { filename: string; data: Buffer } | null = null

  for (const field of formData) {
    if (field.name === 'photo' && field.filename && field.data.length > 0) {
      if (field.data.length > 5 * 1024 * 1024) throw createError({ statusCode: 400, message: 'Фото не более 5МБ' })
      imageFile = { filename: field.filename, data: field.data }
    } else if (field.name && field.data) {
      fields[field.name] = field.data.toString()
    }
  }

  const plantId = parseInt(fields.plantId || '0')
  const year = parseInt(fields.year || '0')
  const authorContact = String(fields.authorContact || '').trim().slice(0, 100)
  const comment = String(fields.comment || '').trim().slice(0, 300)

  if (!plantId) throw createError({ statusCode: 400, message: 'Не указано растение' })
  if (year < 1990 || year > new Date().getFullYear()) throw createError({ statusCode: 400, message: 'Некорректный год' })
  if (!imageFile) throw createError({ statusCode: 400, message: 'Добавьте фото' })

  // Save image
  if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true })
  const ext = imageFile.filename.split('.').pop() || 'jpg'
  const photoFilename = `growth-${Date.now()}.${ext}`
  writeFileSync(resolve(UPLOAD_DIR, photoFilename), imageFile.data)

  // Save entry
  let data = { entries: [] as any[], nextId: 1 }
  if (existsSync(DATA_PATH)) {
    data = JSON.parse(readFileSync(DATA_PATH, 'utf-8'))
  }

  const entry = {
    id: data.nextId,
    plantId,
    year,
    photoFilename,
    authorContact,
    comment,
    createdAt: new Date().toISOString(),
  }

  data.entries.push(entry)
  data.nextId++
  writeFileSync(DATA_PATH, JSON.stringify(data, null, 2))

  lastPost.set(ip, now)
  return { ok: true, entry }
})
