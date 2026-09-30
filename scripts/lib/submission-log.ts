import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync, statSync, readdirSync } from 'fs'
import { resolve, join } from 'path'

/**
 * Журнал жизненного цикла заявок бота «Леший».
 *
 * Пишет каждый шаг: заявка пришла → принята/отклонена → опубликована
 * или НЕ опубликована. Нужен, чтобы молчаливые потери (бот отвечает
 * «Опубликовано», а в канал ничего не ушло) больше не оставались
 * незамеченными.
 */

const ROOT = resolve(import.meta.dirname, '../..')
const LOG_FILE = resolve(ROOT, 'data/submissions-log.json')
const MAX_ENTRIES = 3000
const ARCHIVE_AT = 3600

export type Stage = 'received' | 'accepted' | 'rejected' | 'published' | 'publish_failed'

export interface SubmissionEntry {
  ts: string
  stage: Stage
  source: 'max' | 'tg'
  /** Кто прислал растение */
  author?: string
  /** Кто из админов обработал */
  admin?: string
  latin?: string
  photos?: number
  /** mid сообщения-заявки в «Корзине» — связывает шаги одной заявки */
  askMid?: string
  /** mid исходного пересланного сообщения — ключ архива */
  srcMid?: string
  /** mid опубликованного поста в канале (только для published) */
  channelMid?: string
  ok?: boolean
  error?: string

  // ── Всё, что нужно для восстановления ──
  /** Полный текст, как прислал автор */
  text?: string
  /** Текст, предложенный AI (он же публикуется по «ок») */
  aiText?: string
  /** Исходные ссылки на фото в MAX */
  photoUrls?: string[]
  /** Локальные копии фото: пути относительно data/ */
  files?: string[]
}

// ── Архив фотографий ───────────────────────────────────────
const ARCHIVE_DIR = resolve(ROOT, 'data/submissions-archive')
const MAX_PHOTO_BYTES = 15 * 1024 * 1024
const FETCH_TIMEOUT_MS = 30_000

function safeId(id: string): string {
  return (id || 'unknown').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80)
}

/**
 * Скачивает фото заявки на диск, чтобы её можно было восстановить даже
 * когда ссылки MAX перестанут открываться. Возвращает пути относительно
 * data/. Никогда не бросает: часть фото может не скачаться.
 */
export async function archivePhotos(subId: string, urls: string[]): Promise<string[]> {
  if (!urls?.length) return []
  const id = safeId(subId)
  const dir = join(ARCHIVE_DIR, id)
  const saved: string[] = []

  try { mkdirSync(dir, { recursive: true }) } catch { return [] }

  for (let i = 0; i < urls.length; i++) {
    const rel = `submissions-archive/${id}/${i + 1}.jpg`
    const abs = join(dir, `${i + 1}.jpg`)
    try {
      if (existsSync(abs) && statSync(abs).size > 0) { saved.push(rel); continue }

      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
      const resp = await fetch(urls[i], { signal: ctrl.signal })
      clearTimeout(timer)
      if (!resp.ok) continue

      const buf = Buffer.from(await resp.arrayBuffer())
      if (!buf.length || buf.length > MAX_PHOTO_BYTES) continue

      writeFileSync(abs, buf)
      saved.push(rel)
    } catch { /* пропускаем это фото */ }
  }

  // Рядом с фото кладём исходные ссылки — вдруг понадобятся
  try { writeFileSync(join(dir, 'urls.json'), JSON.stringify(urls, null, 2)) } catch {}

  return saved
}

/** Размер архива в мегабайтах — для отображения в админке */
export function archiveSizeMb(): number {
  let bytes = 0
  const walk = (d: string) => {
    let items: string[] = []
    try { items = readdirSync(d) } catch { return }
    for (const it of items) {
      const p = join(d, it)
      try {
        const st = statSync(p)
        if (st.isDirectory()) walk(p)
        else bytes += st.size
      } catch {}
    }
  }
  walk(ARCHIVE_DIR)
  return Math.round(bytes / 1048576 * 10) / 10
}

function load(): SubmissionEntry[] {
  if (!existsSync(LOG_FILE)) return []
  try {
    const raw = JSON.parse(readFileSync(LOG_FILE, 'utf-8'))
    return Array.isArray(raw) ? raw : (raw.entries || [])
  } catch { return [] }
}

/** Никогда не бросает — журнал не должен ломать работу бота */
export function logSubmission(entry: Omit<SubmissionEntry, 'ts'> & { ts?: string }) {
  try {
    const entries = load()
    entries.push({ ...entry, ts: entry.ts || new Date().toISOString() })

    if (entries.length > ARCHIVE_AT) {
      const cut = entries.length - MAX_ENTRIES
      try {
        const old = LOG_FILE.replace(/\.json$/, '.old.json')
        if (existsSync(old)) renameSync(old, old.replace('.old.json', '.old-prev.json'))
        writeFileSync(old, JSON.stringify(entries.slice(0, cut), null, 2))
      } catch {}
      writeFileSync(LOG_FILE, JSON.stringify(entries.slice(cut), null, 2))
      return
    }

    writeFileSync(LOG_FILE, JSON.stringify(entries, null, 2))
  } catch {}
}

/**
 * Заявки, принятые больше `hours` назад, но так и не опубликованные.
 * Используется сторожем при старте бота и раз в час.
 */
export function findStuck(hours = 24): SubmissionEntry[] {
  const entries = load()
  const cutoff = Date.now() - hours * 3600_000

  const resolved = new Set<string>()
  for (const e of entries) {
    if ((e.stage === 'published' || e.stage === 'rejected') && e.askMid) resolved.add(e.askMid)
  }

  const stuck: SubmissionEntry[] = []
  const seen = new Set<string>()
  for (const e of entries) {
    if (e.stage !== 'accepted' || !e.askMid) continue
    if (resolved.has(e.askMid) || seen.has(e.askMid)) continue
    if (new Date(e.ts).getTime() > cutoff) continue
    seen.add(e.askMid)
    stuck.push(e)
  }
  return stuck
}

/** Ошибки публикации за последние `hours` часов */
export function recentFailures(hours = 24): SubmissionEntry[] {
  const cutoff = Date.now() - hours * 3600_000
  return load().filter(e => e.stage === 'publish_failed' && new Date(e.ts).getTime() >= cutoff)
}
