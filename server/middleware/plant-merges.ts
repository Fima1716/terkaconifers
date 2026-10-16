import { readFileSync, existsSync, statSync } from 'fs'
import { resolve } from 'path'

/**
 * Склеенные дубли: /plant/<старый id> уводим на оставшуюся карточку.
 *
 * Редирект делает и сама страница, но она это умеет только после загрузки
 * каталога в браузере. Поисковикам и ссылкам из переписки нужен честный 301
 * до рендера — его и отдаём здесь.
 */
const MERGES_PATH = resolve(process.cwd(), 'data/plant-merges.json')

let cache: Record<string, number> = {}
let cachedAt = 0
let cachedMtime = 0

function merges(): Record<string, number> {
  const now = Date.now()
  if (now - cachedAt < 60_000) return cache
  cachedAt = now
  try {
    if (!existsSync(MERGES_PATH)) { cache = {}; return cache }
    const mtime = statSync(MERGES_PATH).mtimeMs
    if (mtime !== cachedMtime) {
      cache = JSON.parse(readFileSync(MERGES_PATH, 'utf-8')) || {}
      cachedMtime = mtime
    }
  } catch {
    cache = {}
  }
  return cache
}

export default defineEventHandler((event) => {
  const path = event.path || ''
  const m = path.match(/^\/plant\/(\d+)(?:[/?#]|$)/)
  if (!m) return
  const target = merges()[m[1]]
  if (!target) return
  const query = path.includes('?') ? path.slice(path.indexOf('?')) : ''
  return sendRedirect(event, `/plant/${target}${query}`, 301)
})
