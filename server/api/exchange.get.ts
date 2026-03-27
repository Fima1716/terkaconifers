import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const DATA_PATH = resolve(process.cwd(), 'data/exchange.json')

export default defineEventHandler(() => {
  if (!existsSync(DATA_PATH)) return { posts: [] }
  const data = JSON.parse(readFileSync(DATA_PATH, 'utf-8'))
  // Return newest first
  return { posts: (data.posts || []).reverse() }
})
