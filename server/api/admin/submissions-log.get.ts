import { readFileSync, existsSync, statSync, readdirSync } from 'fs'
import { resolve, join } from 'path'

/** Размер архива фотографий, МБ */
function archiveSizeMb(): number {
  const base = resolve(process.cwd(), 'data/submissions-archive')
  let bytes = 0
  const walk = (d: string) => {
    let items: string[] = []
    try { items = readdirSync(d) } catch { return }
    for (const it of items) {
      const f = join(d, it)
      try {
        const st = statSync(f)
        if (st.isDirectory()) walk(f)
        else bytes += st.size
      } catch {}
    }
  }
  walk(base)
  return Math.round(bytes / 1048576 * 10) / 10
}

interface Entry {
  ts: string
  stage: string
  source: string
  author?: string
  admin?: string
  latin?: string
  photos?: number
  askMid?: string
  channelMid?: string
  ok?: boolean
  error?: string
  text?: string
  aiText?: string
  photoUrls?: string[]
  files?: string[]
}

/** Журнал заявок бота «Леший»: пришла → принята → опубликована (или нет) */
export default defineEventHandler(async (event) => {
  await requireAuth(event, 'super_admin')

  const q = getQuery(event)
  const page = Math.max(1, parseInt(String(q.page || '1')))
  const limit = Math.min(200, Math.max(1, parseInt(String(q.limit || '50'))))
  const stage = q.stage ? String(q.stage) : ''
  const search = String(q.search || '').toLowerCase()

  const path = resolve(process.cwd(), 'data/submissions-log.json')
  if (!existsSync(path)) {
    return { entries: [], total: 0, page, pages: 1, stuck: [], failures: 0, counts: {}, archiveMb: 0, archived: 0 }
  }

  let all: Entry[] = []
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    all = Array.isArray(raw) ? raw : (raw.entries || [])
  } catch { all = [] }

  const counts: Record<string, number> = {}
  for (const e of all) counts[e.stage] = (counts[e.stage] || 0) + 1

  // Зависшие: принято больше суток назад, но нет published/rejected по тому же askMid
  const resolved = new Set<string>()
  for (const e of all) {
    if ((e.stage === 'published' || e.stage === 'rejected') && e.askMid) resolved.add(e.askMid)
  }
  const dayAgo = Date.now() - 86400_000
  const seen = new Set<string>()
  const stuck: Entry[] = []
  for (const e of all) {
    if (e.stage !== 'accepted' || !e.askMid) continue
    if (resolved.has(e.askMid) || seen.has(e.askMid)) continue
    if (new Date(e.ts).getTime() > dayAgo) continue
    seen.add(e.askMid)
    stuck.push(e)
  }

  const failures = all.filter(e =>
    e.stage === 'publish_failed' && new Date(e.ts).getTime() >= dayAgo
  ).length

  let entries = all.slice().reverse()
  if (stage) entries = entries.filter(e => e.stage === stage)
  if (search) {
    entries = entries.filter(e =>
      (e.latin || '').toLowerCase().includes(search) ||
      (e.author || '').toLowerCase().includes(search) ||
      (e.admin || '').toLowerCase().includes(search)
    )
  }

  const total = entries.length
  const start = (page - 1) * limit

  return {
    entries: entries.slice(start, start + limit),
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
    stuck,
    failures,
    counts,
    archiveMb: archiveSizeMb(),
    archived: all.reduce((n, e) => n + (e.files?.length || 0), 0),
  }
})
