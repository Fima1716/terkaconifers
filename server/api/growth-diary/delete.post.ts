import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { resolve } from 'path'

const DATA_PATH = resolve(process.cwd(), 'data/growth-diary.json')
const UPLOAD_DIR = resolve(process.cwd(), 'data/uploads/growth')

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event, 'super_admin')

  const body = await readBody(event)
  const id = parseInt(body.id)
  if (!id) throw createError({ statusCode: 400, message: 'Не указан ID' })

  if (!existsSync(DATA_PATH)) throw createError({ statusCode: 404, message: 'Нет данных' })
  const data = JSON.parse(readFileSync(DATA_PATH, 'utf-8'))

  const entry = (data.entries || []).find((e: any) => e.id === id)
  if (entry?.photoFilename) {
    const photoPath = resolve(UPLOAD_DIR, entry.photoFilename)
    if (existsSync(photoPath)) unlinkSync(photoPath)
  }

  data.entries = (data.entries || []).filter((e: any) => e.id !== id)
  writeFileSync(DATA_PATH, JSON.stringify(data, null, 2))

  logFor(event, user, 'diary.delete', {
    targetId: entry?.plantId ?? id,
    changes: entry?.year ? [{ field: 'year', from: String(entry.year) }] : undefined,
  })

  return { ok: true }
})
