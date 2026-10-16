/**
 * Возврат истории роста задним числом.
 *
 * Синк теперь уносит прежнее фото в «Дневник роста» при каждой замене, но всё,
 * что заменилось раньше, осталось только в канале MAX: авторы не правят старый
 * пост, а публикуют новый, и прежний пост со снимком никуда не делся.
 *
 * Скрипт проходит по всем сообщениям канала, находит посты, которые старше
 * текущего поста карточки, и переносит их фотографии в дневник этой карточки.
 * Повторный запуск безопасен: архив отсеивает уже сохранённое и по ссылке,
 * и по содержимому снимка.
 *
 * Запуск:
 *   npx tsx scripts/backfill-growth.ts --dry-run    # только отчёт
 *   npx tsx scripts/backfill-growth.ts              # перенести
 */
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { archiveOldPhotos } from './lib/growth-archive.js'
import { cultKey, extractCultivar, regionsClash } from './lib/plant-key.js'

const ROOT = resolve(import.meta.dirname, '..')
const BASE_URL = 'https://platform-api.max.ru'
const DRY_RUN = process.argv.includes('--dry-run')

// ── .env ─────────────────────────────────────────
const env: Record<string, string> = {}
const envPath = resolve(ROOT, '.env')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) env[m[1].trim()] = m[2].trim()
  }
}
const TOKEN = process.env.MAX_BOT_TOKEN || env.MAX_BOT_TOKEN || ''
const CHAT_ID = process.env.MAX_CHAT_ID || env.MAX_CHAT_ID || ''
if (!TOKEN || !CHAT_ID) {
  console.error('Нет MAX_BOT_TOKEN / MAX_CHAT_ID (.env или окружение)')
  process.exit(1)
}

// ── Разбор поста: нужен минимум — род, вид, сорт и сад ──
// Зеркалит логику sync-max.ts; полный разбор здесь не требуется.
const GARDEN_PREFIXES = ['Сад', 'Русинов', 'Питомник', 'Коллекция', 'Альпинарий', 'Частный', 'Лес']

function parsePost(text: string) {
  const first = (text.split('\n')[0] || '').trim()
  if (!first) return null
  const words = first.split(/\s+/)
  const genus = words[0] || ''
  if (!/^[A-Z][a-z]+$/.test(genus)) return null
  const species = words[1] && /^[a-zа-я]/.test(words[1]) ? words[1] : ''
  const cultivar = extractCultivar(first)
  if (!cultivar) return null  // без сорта карточку не опознать

  const hashtags = [...text.matchAll(/#([A-Za-zА-Яа-яЁё0-9_]+)/g)].map(m => m[1])
  let garden = hashtags.find(h => GARDEN_PREFIXES.some(p => h.startsWith(p)) || h.endsWith('Сад') || h.endsWith('сад')) || ''
  if (!garden) {
    for (const line of text.split('\n').map(l => l.trim())) {
      if (line.startsWith('#')) continue
      const m = line.match(/^(Сад\s+.+|Питомник\s+.+|Коллекция\s+.+|Альпинарий\s+.+)$/i)
      if (m) { garden = m[1].replace(/\s+/g, '').replace(/^Частный[Сс]ад/, 'ЧастныйСад'); break }
    }
  }

  let region = ''
  for (const line of text.split('\n').slice(1, 8).map(l => l.trim())) {
    if (!line || line.startsWith('#')) continue
    if (/обл|край|р-н|район|г\.|город|Омск|Москв|Санкт|Сибир|Урал/i.test(line)) { region = line; break }
  }

  return { genus, species, cultivar, garden, region }
}

// ── Все сообщения канала ─────────────────────────
async function fetchAllMessages(): Promise<any[]> {
  const all: any[] = []
  let fromTs: number | null = null
  while (true) {
    const params = new URLSearchParams({ chat_id: CHAT_ID, count: '100' })
    if (fromTs) params.set('from', String(fromTs))
    const resp = await fetch(`${BASE_URL}/messages?${params}`, { headers: { Authorization: TOKEN } })
    if (!resp.ok) { console.error(`  MAX API: ${resp.status}`); break }
    const data = await resp.json()
    const messages = data.messages || []
    if (!messages.length) break
    all.push(...messages)
    const lastTs = messages[messages.length - 1]?.timestamp
    if (!lastTs || messages.length < 100) break
    fromTs = lastTs - 1
    await new Promise(r => setTimeout(r, 250))
  }
  return all
}

async function main() {
  console.log(DRY_RUN ? '🔍 Холостой прогон (ничего не записываем)' : '📅 Возврат истории роста')

  const catalog: any[] = JSON.parse(readFileSync(resolve(ROOT, 'data/raw/catalog.json'), 'utf-8'))
  console.log(`  Карточек в каталоге: ${catalog.length}`)

  // Карточка по ключу «сорт + сад»; дубли берём первой найденной
  const byCult = new Map<string, any>()
  for (const p of catalog) {
    const k = cultKey(p)
    if (k && !byCult.has(k)) byCult.set(k, p)
  }

  const messages = await fetchAllMessages()
  console.log(`  Сообщений в канале: ${messages.length}`)

  // Посты старше текущего поста карточки — это и есть прежние снимки
  type Older = { card: any; photos: string[]; year: number; date: string }
  const queue: Older[] = []
  let noCard = 0
  for (const msg of messages) {
    const text: string = msg.body?.text || ''
    if (!text.trim()) continue
    const parsed = parsePost(text)
    if (!parsed) continue
    const card = byCult.get(cultKey(parsed))
    if (!card) { noCard++; continue }
    if (regionsClash(parsed.region, card.region)) continue
    const ts = msg.timestamp || 0
    if (!ts || ts >= (card._msg_ts || 0)) continue  // это текущий пост карточки
    const photos: string[] = []
    for (const att of (msg.body?.attachments || [])) {
      if (att.type === 'image' && att.payload?.url) photos.push(att.payload.url)
    }
    const fresh = new Set<string>(card.photos || [])
    const old = photos.filter(u => !fresh.has(u))
    if (!old.length) continue
    queue.push({
      card,
      photos: old,
      year: new Date(ts > 1e12 ? ts : ts * 1000).getFullYear(),
      date: new Date(ts > 1e12 ? ts : ts * 1000).toISOString().slice(0, 10),
    })
  }

  const cards = new Set(queue.map(q => q.card._site_id))
  console.log(`  Постов со старыми фото: ${queue.length} на ${cards.size} карточек`)
  console.log(`  Постов, которым не нашлось карточки: ${noCard}`)

  if (DRY_RUN) {
    for (const q of queue.slice(0, 40)) {
      console.log(`    ${q.date} → карточка ${q.card._site_id} ${q.card.latin_full} (${q.photos.length} фото)`)
    }
    if (queue.length > 40) console.log(`    … и ещё ${queue.length - 40}`)
    console.log('\nХолостой прогон завершён, ничего не записано.')
    return
  }

  // Старые посты обрабатываем от ранних к поздним — так и в дневнике порядок верный
  queue.sort((a, b) => a.year - b.year)
  let saved = 0
  for (const q of queue) {
    const n = await archiveOldPhotos(q.card, q.photos, q.card.photos || [], { year: q.year })
    if (n > 0) {
      saved += n
      console.log(`  + ${q.card.latin_full} (${q.card._site_id}): ${n} фото, ${q.year}`)
    }
  }
  console.log(`\n✅ Перенесено в дневник: ${saved} фото`)
}

main().catch(err => { console.error('❌', err); process.exit(1) })
