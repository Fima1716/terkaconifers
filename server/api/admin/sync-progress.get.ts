import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const PROGRESS_FILE = resolve(process.cwd(), 'data/sync-progress.json')

export default defineEventHandler(async (event) => {
  await requireAuth(event, 'super_admin')

  if (!existsSync(PROGRESS_FILE)) {
    return { status: 'idle', percent: 0, message: '', lines: [] }
  }
  return JSON.parse(readFileSync(PROGRESS_FILE, 'utf-8'))
})
