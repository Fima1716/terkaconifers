import { readFileSync, writeFileSync, existsSync, renameSync } from 'fs'
import { resolve } from 'path'

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
  /** mid опубликованного поста в канале (только для published) */
  channelMid?: string
  ok?: boolean
  error?: string
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
