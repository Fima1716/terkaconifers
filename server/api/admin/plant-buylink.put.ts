import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  if (user.role !== 'super_admin') {
    throw createError({ statusCode: 403, message: 'Только суперадмин может менять ссылки растений' })
  }

  const { plantId, buyLink } = await readBody(event)
  if (!plantId) throw createError({ statusCode: 400, message: 'plantId обязателен' })

  const path = resolve(process.cwd(), 'data/gardens.json')
  let data: any = { gardens: {}, plantBuyLinks: {} }
  if (existsSync(path)) {
    try { data = JSON.parse(readFileSync(path, 'utf-8')) } catch {}
  }
  if (!data.plantBuyLinks) data.plantBuyLinks = {}

  if (buyLink) {
    data.plantBuyLinks[String(plantId)] = buyLink
  } else {
    delete data.plantBuyLinks[String(plantId)]
  }

  writeFileSync(path, JSON.stringify(data, null, 2))
  return { ok: true }
})
