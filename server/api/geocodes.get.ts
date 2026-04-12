import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

let cache: Record<string, [number, number]> | null = null

export default defineEventHandler(() => {
  if (cache) return cache

  const path = resolve(process.cwd(), 'data/geocodes-cache.json')
  if (!existsSync(path)) return {}

  cache = JSON.parse(readFileSync(path, 'utf-8'))
  return cache
})
