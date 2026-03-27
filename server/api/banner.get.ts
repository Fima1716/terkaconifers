import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const BANNER_DIR = resolve(process.cwd(), 'data/banner')

export default defineEventHandler((event) => {
  const page = (getQuery(event).page as string) || 'home'
  const safePage = page.replace(/[^a-z0-9-]/gi, '')
  const filename = safePage === 'home' ? 'config.json' : `config-${safePage}.json`
  const configPath = resolve(BANNER_DIR, filename)
  if (!existsSync(configPath)) return { enabled: false, slides: [], interval: 6000 }
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8'))
  } catch {
    return { enabled: false, slides: [], interval: 6000 }
  }
})
