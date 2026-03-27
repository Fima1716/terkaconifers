import { readFileSync, statSync } from 'fs'
import { resolve } from 'path'

let cache: any = null
let cacheMtime = 0

export default defineEventHandler((event) => {
  setResponseHeader(event, 'Cache-Control', 'public, max-age=600, stale-while-revalidate=3600')

  try {
    const path = resolve(process.cwd(), 'data/conditions.json')
    const mtime = statSync(path).mtimeMs
    if (cache && mtime === cacheMtime) return cache
    cache = JSON.parse(readFileSync(path, 'utf-8'))
    cacheMtime = mtime
    return cache
  } catch {
    return { updated: '', species: {}, overrides: {} }
  }
})
