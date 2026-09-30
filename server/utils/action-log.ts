import { readFileSync, writeFileSync, existsSync, renameSync } from 'fs'
import { resolve } from 'path'
import type { H3Event } from 'h3'

/**
 * Журнал действий: кто что поправил в каталоге.
 * Пишется в data/action-log.json, читается админкой (вкладка «Журнал»).
 */

const LOG_FILE = resolve(process.cwd(), 'data/action-log.json')
const MAX_ENTRIES = 5000          // храним последние N записей
const ARCHIVE_AT = 6000           // при превышении — half-rotate в .old

export interface ActionEntry {
  ts: string
  user: string
  displayName?: string
  role?: string
  action: string
  targetId?: string | number
  title?: string
  /** Поля, которые реально изменились: [{ field, from, to }] */
  changes?: Array<{ field: string; from?: string; to?: string }>
  note?: string
  ip?: string
  ok?: boolean
}

export const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Вход в систему',
  'plant.update': 'Правка карточки',
  'plant.photos': 'Изменение фото',
  'maxtext.update': 'Правка текста в MAX',
  'buylink.update': 'Ссылка «Купить»',
  'garden.update': 'Правка сада',
  'user.create': 'Создан пользователь',
  'user.update': 'Изменён пользователь',
  'user.delete': 'Удалён пользователь',
}

function load(): ActionEntry[] {
  if (!existsSync(LOG_FILE)) return []
  try {
    const raw = JSON.parse(readFileSync(LOG_FILE, 'utf-8'))
    return Array.isArray(raw) ? raw : (raw.entries || [])
  } catch { return [] }
}

function persist(entries: ActionEntry[]) {
  writeFileSync(LOG_FILE, JSON.stringify(entries, null, 2))
}

/**
 * Записать действие. Никогда не бросает исключение — журнал не должен
 * ломать основную операцию.
 */
export function logAction(entry: Omit<ActionEntry, 'ts'> & { ts?: string }) {
  try {
    const entries = load()
    entries.push({ ...entry, ts: entry.ts || new Date().toISOString() })

    if (entries.length > ARCHIVE_AT) {
      // Старую половину — в архивный файл, чтобы история не терялась совсем
      const cut = entries.length - MAX_ENTRIES
      try {
        const oldFile = LOG_FILE.replace(/\.json$/, '.old.json')
        if (existsSync(oldFile)) renameSync(oldFile, oldFile.replace('.old.json', '.old-prev.json'))
        writeFileSync(oldFile, JSON.stringify(entries.slice(0, cut), null, 2))
      } catch {}
      persist(entries.slice(cut))
      return
    }

    persist(entries)
  } catch {}
}

/** Хелпер: собрать действие из события + пользователя */
export function logFor(
  event: H3Event,
  user: { sub: string; role?: string },
  action: string,
  extra: Partial<ActionEntry> = {}
) {
  let displayName: string | undefined
  try { displayName = findUser(user.sub)?.displayName } catch {}
  logAction({
    user: user.sub,
    displayName,
    role: user.role,
    action,
    ip: getRequestIP(event, { xForwardedFor: true }) || undefined,
    ...extra,
  })
}

/** Прочитать журнал: новые сверху, с фильтрами */
export function readActionLog(opts: {
  page?: number
  limit?: number
  user?: string
  action?: string
  search?: string
} = {}) {
  const page = Math.max(1, opts.page || 1)
  const limit = Math.min(200, Math.max(1, opts.limit || 50))

  let entries = load().slice().reverse()

  if (opts.user) entries = entries.filter(e => e.user === opts.user)
  if (opts.action) entries = entries.filter(e => e.action === opts.action)
  if (opts.search) {
    const q = opts.search.toLowerCase()
    entries = entries.filter(e =>
      (e.title || '').toLowerCase().includes(q) ||
      (e.displayName || '').toLowerCase().includes(q) ||
      (e.user || '').toLowerCase().includes(q) ||
      String(e.targetId || '').includes(q)
    )
  }

  const total = entries.length
  const start = (page - 1) * limit

  // Сводка по авторам — для карточек «кто сколько поправил»
  const byUser = new Map<string, { user: string; displayName?: string; count: number; last?: string }>()
  for (const e of entries) {
    const cur = byUser.get(e.user) || { user: e.user, displayName: e.displayName, count: 0, last: e.ts }
    cur.count++
    if (!cur.displayName && e.displayName) cur.displayName = e.displayName
    if (!cur.last || e.ts > cur.last) cur.last = e.ts
    byUser.set(e.user, cur)
  }

  return {
    entries: entries.slice(start, start + limit),
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
    byUser: [...byUser.values()].sort((a, b) => b.count - a.count),
  }
}

/** Сравнить два объекта и вернуть список изменившихся полей */
export function diffFields(
  before: Record<string, any>,
  after: Record<string, any>,
  fields: string[]
): Array<{ field: string; from?: string; to?: string }> {
  const out: Array<{ field: string; from?: string; to?: string }> = []
  for (const f of fields) {
    if (after[f] === undefined) continue
    const a = before[f] ?? ''
    const b = after[f] ?? ''
    if (String(a) !== String(b)) {
      out.push({ field: f, from: String(a).slice(0, 200), to: String(b).slice(0, 200) })
    }
  }
  return out
}
