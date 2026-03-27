import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const FILE = resolve(process.cwd(), 'data/maintenance.json')

function load() {
  if (!existsSync(FILE)) return { enabled: false, message: '' }
  try { return JSON.parse(readFileSync(FILE, 'utf-8')) } catch { return { enabled: false, message: '' } }
}

export default defineEventHandler(async (event) => {
  await requireAuth(event, 'super_admin')

  const body = await readBody(event)
  const current = load()

  if (typeof body.enabled === 'boolean') current.enabled = body.enabled
  if (typeof body.message === 'string') current.message = body.message

  writeFileSync(FILE, JSON.stringify(current, null, 2))
  return current
})
