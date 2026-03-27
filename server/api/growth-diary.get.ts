import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const DATA_PATH = resolve(process.cwd(), 'data/growth-diary.json')

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const plantId = parseInt(String(query.plantId || '0'))

  if (!existsSync(DATA_PATH)) return { entries: [] }
  const data = JSON.parse(readFileSync(DATA_PATH, 'utf-8'))

  let entries = data.entries || []
  if (plantId) entries = entries.filter((e: any) => e.plantId === plantId)

  // Sort by year ascending
  entries.sort((a: any, b: any) => a.year - b.year)
  return { entries }
})
