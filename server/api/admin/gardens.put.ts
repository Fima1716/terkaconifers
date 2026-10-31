import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { spawn } from 'child_process'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const { gardenId, profile } = await readBody(event)
  if (!gardenId || !profile) throw createError({ statusCode: 400, message: 'gardenId и profile обязательны' })

  // Admin can only edit their own gardens (super_admin can edit any)
  if (user.role !== 'super_admin' && !user.gardens.includes(gardenId)) {
    throw createError({ statusCode: 403, message: 'Нет прав на этот сад' })
  }

  if (profile.location !== undefined) profile.location = String(profile.location || '').trim().slice(0, 120)

  const path = resolve(process.cwd(), 'data/gardens.json')
  let data: any = { gardens: {} }
  if (existsSync(path)) {
    try { data = JSON.parse(readFileSync(path, 'utf-8')) } catch {}
  }

  const before = { ...(data.gardens[gardenId] || {}) }
  data.gardens[gardenId] = {
    ...data.gardens[gardenId],
    ...profile,
    updatedAt: new Date().toISOString(),
  }

  writeFileSync(path, JSON.stringify(data, null, 2))
  logFor(event, user, 'garden.update', {
    targetId: gardenId,
    title: gardenId,
    changes: diffFields(before, profile, Object.keys(profile || {})),
  })

  // Локация меняет регион у всех растений сада (её подставляет enrich.ts) —
  // пересобираем каталог в фоне, не дожидаясь ночного синка
  const locationChanged = (before.location || '') !== (data.gardens[gardenId].location || '')
  if (locationChanged) {
    spawn('npx', ['tsx', 'scripts/enrich.ts'], { cwd: process.cwd(), detached: true, stdio: 'ignore' }).unref()
  }
  return { ok: true, rebuilding: locationChanged }
})
