import { spawn } from 'child_process'
import { readFileSync, writeFileSync, existsSync, openSync } from 'fs'
import { resolve } from 'path'

/**
 * Синхронизация каталога сразу после публикации заявки.
 *
 * Раньше карточка появлялась на сайте только после ночного синка в 3:00:
 * автор публиковал растение, шёл смотреть — а там старое фото или вовсе
 * ничего. Теперь публикация сама дёргает синк.
 *
 * Запуск отложенный и с защёлкой: если админ принимает несколько заявок
 * подряд, прогон будет один, а не по разу на каждую.
 */

const ROOT = resolve(import.meta.dirname, '../..')
const LOCK_FILE = resolve(ROOT, 'data/sync-trigger.json')

/** Пауза перед запуском — чтобы собрать пачку публикаций в один прогон */
const DELAY_MS = 90_000
/** Не чаще одного прогона в этот интервал */
const MIN_GAP_MS = 10 * 60_000

let timer: ReturnType<typeof setTimeout> | null = null
let pendingReasons: string[] = []

function env(name: string): string {
  if (process.env[name]) return process.env[name]!
  try {
    for (const line of readFileSync(resolve(ROOT, '.env'), 'utf-8').split('\n')) {
      const m = line.match(/^\s*([^#=]+?)\s*=\s*(.*)$/)
      if (m && m[1] === name) return m[2].trim()
    }
  } catch { /* .env может не быть */ }
  return ''
}

function lastRun(): number {
  try {
    if (!existsSync(LOCK_FILE)) return 0
    return JSON.parse(readFileSync(LOCK_FILE, 'utf-8')).startedAt || 0
  } catch { return 0 }
}

function markRun(reasons: string[]) {
  try {
    writeFileSync(LOCK_FILE, JSON.stringify({ startedAt: Date.now(), reasons }, null, 2))
  } catch { /* защёлка не критична */ }
}

function run(log: (m: string) => void) {
  const token = env('MAX_BOT_TOKEN')
  const chatId = env('MAX_CHAT_ID')
  if (!token || !chatId) { log('Синк после публикации: нет MAX_BOT_TOKEN/MAX_CHAT_ID'); return }

  const reasons = pendingReasons.slice(0, 10)
  pendingReasons = []
  markRun(reasons)

  try {
    const out = openSync(resolve(ROOT, 'logs/sync.log'), 'a')
    const proc = spawn('npx', ['tsx', 'scripts/sync-max.ts', '--token', token, '--chat-id', chatId], {
      cwd: ROOT,
      detached: true,
      stdio: ['ignore', out, out],
      env: { ...process.env, FORCE_COLOR: '0' },
    })
    proc.unref()
    log(`Синк после публикации запущен (${reasons.length} заявок): ${reasons.join('; ').slice(0, 120)}`)
  } catch (e) {
    log(`Синк после публикации не запустился: ${e}`)
  }
}

/**
 * Поставить синк в очередь. Безопасно звать на каждую публикацию:
 * прогон будет отложен и не чаще, чем раз в 10 минут.
 */
export function scheduleSync(reason: string, log: (m: string) => void = console.log) {
  pendingReasons.push(reason)
  if (timer) return

  const since = Date.now() - lastRun()
  const wait = since < MIN_GAP_MS ? Math.max(DELAY_MS, MIN_GAP_MS - since) : DELAY_MS
  log(`Синк после публикации будет через ${Math.round(wait / 1000)} с`)

  timer = setTimeout(() => {
    timer = null
    run(log)
  }, wait)
  timer.unref?.()
}
