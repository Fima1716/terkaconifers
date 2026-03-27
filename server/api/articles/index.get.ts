import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

export default defineEventHandler(() => {
  const path = resolve(process.cwd(), 'data/articles.json')
  if (!existsSync(path)) return []
  return JSON.parse(readFileSync(path, 'utf-8'))
})
