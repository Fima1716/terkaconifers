import { readFile } from 'fs/promises'
import { join } from 'path'

export default defineEventHandler(async (event) => {
  await requireAuth(event, 'super_admin')

  const dataPath = join(process.cwd(), 'data', 'rusinov-prompt.json')
  const raw = await readFile(dataPath, 'utf-8')
  return JSON.parse(raw)
})
