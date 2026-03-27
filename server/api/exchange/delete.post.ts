import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const DATA_PATH = resolve(process.cwd(), 'data/exchange.json')

export default defineEventHandler(async (event) => {
  await requireAuth(event, 'super_admin')

  const body = await readBody(event)
  const id = parseInt(body.id)
  if (!id) throw createError({ statusCode: 400, message: 'Не указан ID' })

  if (!existsSync(DATA_PATH)) throw createError({ statusCode: 404, message: 'Нет данных' })
  const data = JSON.parse(readFileSync(DATA_PATH, 'utf-8'))
  data.posts = (data.posts || []).filter((p: any) => p.id !== id)
  writeFileSync(DATA_PATH, JSON.stringify(data, null, 2))

  return { ok: true }
})
