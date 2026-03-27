import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const GARDENS_PATH = resolve(process.cwd(), 'data/gardens.json')

function loadGardens() {
  if (!existsSync(GARDENS_PATH)) return { gardens: {} }
  try { return JSON.parse(readFileSync(GARDENS_PATH, 'utf-8')) } catch { return { gardens: {} } }
}

export default defineEventHandler(async (event) => {
  await requireAuth(event, 'super_admin')

  const body = await readBody(event)

  // Batch update: { consents: { "GardenName": true, "OtherGarden": false, ... } }
  if (body.consents && typeof body.consents === 'object') {
    const data = loadGardens()
    for (const [gardenId, consent] of Object.entries(body.consents)) {
      if (!data.gardens[gardenId]) data.gardens[gardenId] = {}
      data.gardens[gardenId].consent = consent === true
      data.gardens[gardenId].consentAt = new Date().toISOString()
    }
    writeFileSync(GARDENS_PATH, JSON.stringify(data, null, 2))
    return { ok: true }
  }

  // Single update (backward compat): { gardenId, consent }
  const { gardenId, consent } = body
  if (!gardenId || typeof consent !== 'boolean') {
    throw createError({ statusCode: 400, message: 'consents объект или gardenId+consent обязательны' })
  }

  const data = loadGardens()
  if (!data.gardens[gardenId]) data.gardens[gardenId] = {}
  data.gardens[gardenId].consent = consent
  data.gardens[gardenId].consentAt = new Date().toISOString()

  writeFileSync(GARDENS_PATH, JSON.stringify(data, null, 2))
  return { ok: true }
})
