import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const GARDENS_FILE = resolve(process.cwd(), 'data/gardens.json')

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const gardenName = body.garden?.trim()
  const agreed = !!body.agreed

  if (!gardenName) {
    throw createError({ statusCode: 400, message: 'garden обязателен' })
  }

  // Load gardens.json
  let data: any = { gardens: {} }
  if (existsSync(GARDENS_FILE)) {
    try { data = JSON.parse(readFileSync(GARDENS_FILE, 'utf-8')) } catch {}
  }
  if (!data.gardens) data.gardens = {}

  // Create garden entry if it doesn't exist
  if (!data.gardens[gardenName]) {
    data.gardens[gardenName] = {}
  }

  data.gardens[gardenName].consent = agreed
  data.gardens[gardenName].consentAt = new Date().toISOString()
  data.gardens[gardenName].consentSource = 'deeplink'

  writeFileSync(GARDENS_FILE, JSON.stringify(data, null, 2))

  return { ok: true, agreed }
})
