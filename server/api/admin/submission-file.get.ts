import { createReadStream, existsSync, statSync } from 'fs'
import { resolve, normalize, sep } from 'path'

/**
 * Отдаёт архивную фотографию заявки. Только для главного админа.
 * Путь принимается относительно data/ и обязан оставаться внутри
 * data/submissions-archive — иначе отказ.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event, 'super_admin')

  const rel = String(getQuery(event).path || '')
  if (!rel) throw createError({ statusCode: 400, message: 'Не указан путь' })

  const base = resolve(process.cwd(), 'data/submissions-archive')
  const target = resolve(process.cwd(), 'data', normalize(rel))

  // Защита от выхода за пределы архива (../../)
  if (target !== base && !target.startsWith(base + sep)) {
    throw createError({ statusCode: 403, message: 'Недопустимый путь' })
  }
  if (!existsSync(target) || !statSync(target).isFile()) {
    throw createError({ statusCode: 404, message: 'Файл не найден' })
  }

  setHeader(event, 'Content-Type', 'image/jpeg')
  setHeader(event, 'Cache-Control', 'private, max-age=86400')
  return sendStream(event, createReadStream(target))
})
