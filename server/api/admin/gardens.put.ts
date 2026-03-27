import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const { gardenId, profile } = await readBody(event)
  if (!gardenId || !profile) throw createError({ statusCode: 400, message: 'gardenId и profile обязательны' })

  // Admin can only edit their own gardens (super_admin can edit any)
  if (user.role !== 'super_admin' && !user.gardens.includes(gardenId)) {
    throw createError({ statusCode: 403, message: 'Нет прав на этот сад' })
  }

  const path = resolve(process.cwd(), 'data/gardens.json')
  let data: any = { gardens: {} }
  if (existsSync(path)) {
    try { data = JSON.parse(readFileSync(path, 'utf-8')) } catch {}
  }

  data.gardens[gardenId] = {
    ...data.gardens[gardenId],
    ...profile,
    updatedAt: new Date().toISOString(),
  }

  writeFileSync(path, JSON.stringify(data, null, 2))
  return { ok: true }
})
