import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  if (user.role !== 'super_admin') {
    throw createError({ statusCode: 403, message: 'Только для суперадминов' })
  }

  const body = await readBody(event)
  const path = resolve(process.cwd(), 'data/gardens.json')
  let data: any = { gardens: {} }
  if (existsSync(path)) {
    try { data = JSON.parse(readFileSync(path, 'utf-8')) } catch {}
  }

  if (typeof body.showBuyButtons === 'boolean') {
    data.showBuyButtons = body.showBuyButtons
  }

  writeFileSync(path, JSON.stringify(data, null, 2))
  return { ok: true, showBuyButtons: data.showBuyButtons ?? false }
})
