import { statSync, existsSync } from 'fs'
import { resolve } from 'path'

export default defineEventHandler((event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')

  const catalogPath = resolve(process.cwd(), 'public/data/catalog-enriched.json')
  const gardensPath = resolve(process.cwd(), 'data/gardens.json')

  const catalogMtime = statSync(catalogPath).mtimeMs
  const gardensMtime = existsSync(gardensPath) ? statSync(gardensPath).mtimeMs : 0

  // Combined version — changes when either file is modified
  return { version: Math.max(catalogMtime, gardensMtime) }
})
