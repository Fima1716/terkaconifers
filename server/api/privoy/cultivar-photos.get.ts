import { readFileSync, existsSync, statSync } from 'fs'
import { resolve } from 'path'
import { createHmac, timingSafeEqual } from 'crypto'

const SHARED_SECRET = process.env.PRIVOY_SHARED_SECRET || ''
const MAX_DRIFT_MS = 60_000

function verifyHmac(event: any): boolean {
  if (!SHARED_SECRET) return false
  const ts = getHeader(event, 'x-privoy-ts')
  const sig = getHeader(event, 'x-privoy-sig')
  if (!ts || !sig) return false
  const now = Date.now()
  const reqTime = parseInt(ts, 10)
  if (isNaN(reqTime) || Math.abs(now - reqTime) > MAX_DRIFT_MS) return false
  const path = getRequestURL(event).pathname + (getRequestURL(event).search || '')
  const expected = createHmac('sha256', SHARED_SECRET)
    .update(`${ts}\n${path}`)
    .digest('hex')
  if (sig.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))
}

let cache: any[] | null = null
let cacheMtime = 0

function loadCatalog(): any[] {
  const path = resolve(process.cwd(), 'public/data/catalog-enriched.json')
  if (!existsSync(path)) return []
  const mtime = statSync(path).mtimeMs
  if (cache && mtime === cacheMtime) return cache
  cache = JSON.parse(readFileSync(path, 'utf-8'))
  cacheMtime = mtime
  return cache!
}

export default defineEventHandler((event) => {
  if (!SHARED_SECRET) throw createError({ statusCode: 503, message: 'not configured' })
  if (!verifyHmac(event)) throw createError({ statusCode: 403, message: 'forbidden' })

  const q = getQuery(event)
  const speciesFull = (q.species_full as string || '').trim()
  const cultivar = (q.cultivar as string || '').trim()

  if (!speciesFull) throw createError({ statusCode: 400, message: 'species_full required' })

  setResponseHeader(event, 'Cache-Control', 'private, max-age=3600')
  setResponseHeader(event, 'X-Robots-Tag', 'noindex')

  const catalog = loadCatalog()
  const sfLower = speciesFull.toLowerCase()
  const cvLower = cultivar.toLowerCase()

  const matches = catalog.filter((p: any) => {
    if (p.species_full?.toLowerCase() !== sfLower) return false
    if (cultivar && p.cultivar?.toLowerCase() !== cvLower) return false
    if (!cultivar && p.cultivar) return false
    return true
  })

  if (matches.length === 0) return { items: [] }

  const seen = new Set<string>()
  const items = matches
    .filter((p: any) => p.thumbs?.length > 0 || p.photos?.length > 0)
    .map((p: any) => {
      const thumb = p.thumbs?.[0] || p.photos?.[0] || ''
      if (!thumb || seen.has(thumb)) return null
      seen.add(thumb)
      const isLocal = !thumb.startsWith('http')
      return {
        thumb: isLocal ? `https://terkaconifers.ru${thumb.startsWith('/') ? '' : '/'}${thumb}` : thumb,
        region: p.region_normalized || p.region || '',
        age: p.age_display || '',
      }
    })
    .filter(Boolean)
    .slice(0, 6)

  return { items }
})
