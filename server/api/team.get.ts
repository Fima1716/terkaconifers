import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const TEAM_FILE = resolve(process.cwd(), 'data/team.json')

export default defineEventHandler(() => {
  if (!existsSync(TEAM_FILE)) return { members: [] }
  try {
    return JSON.parse(readFileSync(TEAM_FILE, 'utf-8'))
  } catch {
    return { members: [] }
  }
})
