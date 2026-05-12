/**
 * Nightly sync: fetches ALL messages from MAX channel,
 * compares with current catalog, adds new entries.
 *
 * Designed to run once per day via cron (e.g. 3:00 MSK).
 *
 * Usage:
 *   npx tsx scripts/sync-max.ts --token YOUR_BOT_TOKEN --chat-id CHANNEL_CHAT_ID
 *
 * Cron (every night at 3:00 MSK):
 *   0 3 * * * cd /path/to/terka && npx tsx scripts/sync-max.ts --token TOKEN --chat-id CHAT_ID >> logs/sync.log 2>&1
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs'
import { resolve } from 'path'
import { execSync } from 'child_process'
import { copyFileSync } from 'fs'

const ROOT = resolve(import.meta.dirname, '..')
const RAW_DIR = resolve(ROOT, 'data/raw')
const DATA_DIR = resolve(ROOT, 'data')
const LOG_DIR = resolve(ROOT, 'logs')
const STATE_FILE = resolve(DATA_DIR, 'sync-state.json')
const BASE_URL = 'https://platform-api.max.ru'

// ── CLI args ─────────────────────────────────────
const args = process.argv.slice(2)
function getArg(name: string): string {
  const idx = args.indexOf(`--${name}`)
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : ''
}

const TOKEN = getArg('token') || process.env.MAX_BOT_TOKEN || ''
const CHAT_ID = getArg('chat-id') || process.env.MAX_CHAT_ID || ''

if (!TOKEN || !CHAT_ID) {
  console.error('Usage: npx tsx scripts/sync-max.ts --token TOKEN --chat-id CHAT_ID')
  process.exit(1)
}

if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true })

function log(msg: string) {
  const ts = new Date().toISOString()
  const line = `[${ts}] ${msg}`
  console.log(line)
  appendFileSync(resolve(LOG_DIR, 'sync.log'), line + '\n')
}

// ── Valid genera ─────────────────────────────────
const VALID_GENERA = new Set([
  'Abies', 'Calocedrus', 'Cedrus', 'Chamaecyparis', 'Cryptomeria',
  'Ginkgo', 'Juniperus', 'Larix', 'Metasequoia', 'Microbiota',
  'Picea', 'Pinus', 'Platycladus', 'Pseudotsuga', 'Sciadopitys',
  'Sequoiadendron', 'Taxus', 'Thuja', 'Thujopsis', 'Tsuga',
])

const GENUS_RU: Record<string, string> = {
  Abies: 'Пихта', Calocedrus: 'Калоцедрус', Cedrus: 'Кедр',
  Chamaecyparis: 'Кипарисовик', Cryptomeria: 'Криптомерия',
  Ginkgo: 'Гинкго', Juniperus: 'Можжевельник', Larix: 'Лиственница',
  Metasequoia: 'Метасеквойя', Microbiota: 'Микробиота',
  Picea: 'Ель', Pinus: 'Сосна', Platycladus: 'Платикладус',
  Pseudotsuga: 'Псевдотсуга', Sciadopitys: 'Сциадопитис',
  Sequoiadendron: 'Секвойядендрон', Taxus: 'Тис',
  Thuja: 'Туя', Thujopsis: 'Туевик', Tsuga: 'Тсуга',
}

// ── Latin name regex ─────────────────────────────
// Captures genus, hybrid marker, species, variety — cultivar extracted separately
const LATIN_RE = /^([A-ZА-Я][a-zа-я]+)\s+(?:([хx×])\s+)?([a-zа-я][a-zа-я-]*)(?:\s+(?:var\.?\s+|subsp\.?\s+)([a-z]+))?/

// Extract cultivar: text between FIRST and LAST quote on the line
// Handles apostrophes within names like "Filip's Blue Compact"
const QUOTE_CHARS = new Set([`'`, `'`, '\u2018', '\u2019', '\u201C', '\u201D', '`', '"'])
function extractCultivar(line: string): string {
  let openIdx = -1
  for (let i = 0; i < line.length; i++) {
    if (QUOTE_CHARS.has(line[i])) { openIdx = i; break }
  }
  if (openIdx < 0) return ''
  let closeIdx = -1
  for (let i = line.length - 1; i > openIdx; i--) {
    if (QUOTE_CHARS.has(line[i])) { closeIdx = i; break }
  }
  if (closeIdx <= openIdx) return ''
  return line.slice(openIdx + 1, closeIdx).trim()
}

const GEO_MARKERS = [
  'обл', 'край', 'р-н', 'район', 'г.', 'город',
  'Москв', 'Санкт', 'Петербург', 'Подмосков',
  'Сибир', 'Урал', 'Крым', 'Татарстан', 'Башкир',
  'Ростов', 'Калинин', 'Тульск', 'Тверск', 'Нижегород',
  'Новосибирск', 'Омск', 'Пермск', 'Красноярск', 'Екатеринбург',
  'Челябинск', 'Ленинград', 'Калужск', 'Краснодар', 'Воронеж',
  'Белгород', 'Смоленск', 'Ставропол', 'Псков', 'Ярославск',
  'Хабаровск', 'Комсомольск', 'Приморск', 'Владивосток',
  'Иркутск', 'Томск', 'Сахалин', 'Курск', 'Владимир',
  'Беларусь', 'Уфа', 'Минск', 'Самар', 'Саратов', 'Волгоград',
  'Оренбург', 'Тюмен', 'Кемеров', 'Барнаул', 'Алтай',
  'Рязан', 'Орлов', 'Брянск', 'Липецк', 'Тамбов', 'Пенз',
  'Архангельск', 'Мурманск', 'Карелия', 'Вологод', 'Костром',
  'Киров', 'Чуваш', 'Марий', 'Удмурт', 'Дагестан',
  'Кубан', 'Сочи', 'Анапа', 'Крас­нодар',
]

// ── Parse plant from message text ────────────────
function extractPlant(text: string, photos: string[], maxUrl: string, nextId: number) {
  text = text.trim()
  if (!text) return null

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  if (!lines.length) return null

  const firstLine = lines[0]
  const m = LATIN_RE.exec(firstLine)
  let genus = '', species = '', cultivar = ''

  if (m) {
    genus = m[1]; species = m[3] || ''
  } else {
    const words = firstLine.split(/\s+/)
    if (!words.length || !VALID_GENERA.has(words[0])) return null
    genus = words[0]
    species = (words[1] && /^[a-z]/.test(words[1])) ? words[1] : ''
  }
  cultivar = extractCultivar(firstLine)

  if (!VALID_GENERA.has(genus)) return null

  let name_ru = ''
  for (const line of lines.slice(1, 4)) {
    if (/^[А-Яа-яЁё]/.test(line) && !line.startsWith('#')) { name_ru = line; break }
  }

  let region = ''
  const GENUS_RU_STARTS = ['Ель ', 'Пихта ', 'Сосна ', 'Можжевельник ', 'Туя ', 'Лиственница ', 'Кипарисовик ', 'Тис ', 'Тсуга ', 'Кедр ', 'Микробиота ', 'Туевик ', 'Гинкго ', 'Криптомерия ', 'Метасеквойя ', 'Секвойядендрон ', 'Псевдотсуга ', 'Сциадопитис ', 'Калоцедрус ']
  for (const line of lines.slice(1, 8)) {
    if (line.startsWith('#')) continue
    // Skip lines that are Russian plant names (e.g. "Можжевельник даурский Ленинград")
    if (GENUS_RU_STARTS.some(g => line.startsWith(g))) continue
    if (GEO_MARKERS.some(mk => line.includes(mk))) { region = line; break }
  }

  let age = ''
  for (const line of lines) {
    if (/возраст/i.test(line)) { age = line.replace(/Возраст:?\s*/i, '').trim(); break }
  }

  let size = ''
  for (const line of lines) {
    if (/размер/i.test(line)) { size = line.replace(/Размер:?\s*/i, '').trim(); break }
  }

  let originator = ''
  for (const line of lines) {
    if (/оригинатор/i.test(line)) { originator = line.replace(/Оригинатор\s*:?\s*/i, '').trim(); break }
  }

  const hashtags = [...text.matchAll(/#([A-Za-zА-Яа-яЁё0-9_]+)/g)].map(m => m[1])
  const gardenPrefixes = ['Сад', 'Русинов', 'Питомник', 'Коллекция', 'Альпинарий', 'Частный', 'Лес']
  let garden = hashtags.find(h => gardenPrefixes.some(p => h.startsWith(p)) || h.endsWith('Сад') || h.endsWith('сад')) || ''

  // Fallback: extract garden from plain text lines (e.g. "Сад Надежды Агуловой")
  if (!garden) {
    for (const line of lines) {
      if (line.startsWith('#')) continue
      const m = line.match(/^(Сад\s+.+|Питомник\s+.+|Коллекция\s+.+|Альпинарий\s+.+)$/i)
      if (m) {
        garden = m[1].replace(/\s+/g, '').replace(/^Частный[Сс]ад/, 'ЧастныйСад')
        break
      }
    }
  }
  const is_russian = hashtags.includes('Российский_сорт') || hashtags.includes('Белорусский_сорт')

  return {
    id: nextId,
    genus,
    genus_ru: GENUS_RU[genus] || '',
    species,
    cultivar,
    latin_full: firstLine,
    name_ru,
    region,
    age,
    size,
    garden,
    originator,
    is_russian,
    photos,
    thumbs: photos,
    date: new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    hashtags,
    max_url: maxUrl,
    _mid: '',  // Will be filled from msg.body.mid during sync
    is_new: true,
  }
}

// ── MAX API: fetch ALL messages with pagination ──
async function fetchAllMessages(): Promise<any[]> {
  const all: any[] = []
  let fromTs: number | null = null
  let page = 0

  while (true) {
    page++
    const params = new URLSearchParams({ chat_id: CHAT_ID, count: '100' })
    if (fromTs) params.set('from', String(fromTs))

    const resp = await fetch(`${BASE_URL}/messages?${params}`, {
      headers: { Authorization: TOKEN },
    })

    if (!resp.ok) {
      log(`API error on page ${page}: ${resp.status}`)
      break
    }

    const data = await resp.json()
    const messages = data.messages || []

    if (!messages.length) break

    all.push(...messages)
    log(`  Fetched page ${page}: ${messages.length} messages (total: ${all.length})`)

    // Pagination: use last message timestamp
    const lastTs = messages[messages.length - 1]?.timestamp
    if (!lastTs || messages.length < 100) break
    fromTs = lastTs - 1

    // Safety: don't hammer API
    await new Promise(r => setTimeout(r, 300))
  }

  return all
}

// ── State ────────────────────────────────────────
function loadState() {
  if (existsSync(STATE_FILE)) return JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
  return { last_sync: '', total_synced: 0 }
}

function saveState(state: any) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

// ── Main sync ────────────────────────────────────
async function main() {
  const startTime = Date.now()
  log('========================================')
  log('🌲 Nightly sync started')
  log(`  Channel: ${CHAT_ID}`)

  // Verify bot
  try {
    const me = await fetch(`${BASE_URL}/me`, { headers: { Authorization: TOKEN } })
    if (me.ok) {
      const bot = await me.json()
      log(`  Bot: ${bot.name || 'OK'}`)
    }
  } catch { log('  Bot: could not verify') }

  // Load current catalog
  const catalogPath = resolve(RAW_DIR, 'catalog.json')
  const catalog: any[] = existsSync(catalogPath) ? JSON.parse(readFileSync(catalogPath, 'utf-8')) : []
  log(`  Current catalog: ${catalog.length} entries`)

  // Normalize key: strip all quotes, collapse whitespace, lowercase
  // Garden: strip spaces too (hashtag "РусиновСад" vs display "Русинов Сад")
  function normKey(latinFull: string, garden: string): string {
    const norm = latinFull
      .replace(/[\u2018\u2019\u201C\u201D''""'"`]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
    const gardenNorm = (garden || '').replace(/\s+/g, '').toLowerCase()
    return `${norm}|||${gardenNorm}`
  }

  // Build lookup by normalized latin_full + garden AND by max_url
  const byKey = new Map<string, any>()
  const byUrl = new Map<string, any>()
  for (const p of catalog) {
    byKey.set(normKey(p.latin_full, p.garden), p)
    if (p.max_url) byUrl.set(p.max_url, p)
  }
  let nextId = Math.max(0, ...catalog.map((p: any) => p.id)) + 1

  // Clear old is_new flags (older than 7 days)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 7)
  let cleared = 0
  for (const plant of catalog) {
    if (!plant.is_new) continue
    const [d, m, y] = (plant.date || '').split('.')
    if (d && m && y) {
      const plantDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
      if (plantDate < cutoff) { plant.is_new = false; cleared++ }
    }
  }
  if (cleared > 0) log(`  Cleared ${cleared} old "new" flags`)

  // Fetch all messages from MAX
  log('📡 Fetching messages from MAX...')
  const messages = await fetchAllMessages()
  log(`  Total messages fetched: ${messages.length}`)

  // Parse, add new & update changed plants
  let added = 0
  let updated = 0
  for (const msg of messages) {
    const body = msg.body || {}
    const text: string = body.text || ''
    if (!text.trim()) continue

    const firstWord = text.trim().split(/\s+/)[0]
    if (!VALID_GENERA.has(firstWord)) continue

    const photos: string[] = []
    for (const att of (body.attachments || [])) {
      if (att.type === 'image') {
        const url = att.payload?.url
        if (url) photos.push(url)
      }
    }

    const msgUrl = msg.url || msg.link || ''
    const msgMid = body.mid || ''
    const plant = extractPlant(text, photos, msgUrl, nextId)
    if (!plant) continue
    plant._mid = msgMid;
    (plant as any)._msg_ts = msg.timestamp || 0

    const key = normKey(plant.latin_full, plant.garden)

    // Check if this exact URL already exists — update if text changed
    const existingByUrl = byUrl.get(msgUrl)
    if (existingByUrl) {
      // Backfill _mid and timestamp if missing
      if (msgMid && !existingByUrl._mid) { existingByUrl._mid = msgMid }
      if (msg.timestamp && !existingByUrl._msg_ts) { existingByUrl._msg_ts = msg.timestamp }
      // Compare key fields for changes
      let changed = false
      if (existingByUrl.region !== plant.region && plant.region) { existingByUrl.region = plant.region; changed = true }
      if (existingByUrl.age !== plant.age && plant.age) { existingByUrl.age = plant.age; changed = true }
      if (!existingByUrl.size && plant.size) { existingByUrl.size = plant.size; changed = true }
      if (!existingByUrl.originator && plant.originator) { existingByUrl.originator = plant.originator; changed = true }
      if (existingByUrl.name_ru !== plant.name_ru && plant.name_ru) { existingByUrl.name_ru = plant.name_ru; changed = true }
      if (existingByUrl.latin_full !== plant.latin_full) { existingByUrl.latin_full = plant.latin_full; changed = true }
      if (plant.is_russian !== existingByUrl.is_russian) { existingByUrl.is_russian = plant.is_russian; changed = true }
      if (JSON.stringify(plant.hashtags) !== JSON.stringify(existingByUrl.hashtags)) { existingByUrl.hashtags = plant.hashtags; changed = true }
      // Only update photos if:
      // 1. No local photos (avoid replacing local paths with MAX URLs)
      // 2. This message is not older than what's already stored (don't overwrite newer photos)
      const hasLocalPhotos = existingByUrl.photos?.some((p: string) => p.startsWith('photos/'))
      const isOlderThanStored = existingByUrl._msg_ts && msg.timestamp && msg.timestamp < existingByUrl._msg_ts
      if (!hasLocalPhotos && !isOlderThanStored && photos.length > 0) {
        existingByUrl.photos = photos; existingByUrl.thumbs = photos; changed = true
      }
      if (changed) { updated++; log(`  ~ Updated: ${existingByUrl.latin_full}`) }
      continue
    }

    // Check by key (same plant same garden)
    // If newer post → update photos + metadata (user re-posted with fresh photos)
    const existingByKey = byKey.get(key)
    if (existingByKey) {
      const msgTs = msg.timestamp || 0
      const existingTs = existingByKey._msg_ts || 0
      const isDifferentPost = existingByKey.max_url && existingByKey.max_url !== msgUrl
      const isNewer = msgTs > existingTs

      if (isDifferentPost && isNewer && photos.length > 0) {
        // Newer post of the same plant — update photos and metadata
        existingByKey.photos = photos
        existingByKey.thumbs = photos
        existingByKey.max_url = msgUrl
        existingByKey._mid = msgMid
        existingByKey._msg_ts = msgTs
        if (plant.region) existingByKey.region = plant.region
        if (plant.age) existingByKey.age = plant.age
        if (plant.size) existingByKey.size = plant.size
        if (plant.originator) existingByKey.originator = plant.originator
        if (plant.name_ru) existingByKey.name_ru = plant.name_ru
        byUrl.set(msgUrl, existingByKey)
        updated++
        log(`  ♻ Updated with newer photos: ${existingByKey.latin_full} (${existingByKey.garden})`)
      } else {
        // Same or older post — backfill missing fields only
        if (!existingByKey.max_url && msgUrl) { existingByKey.max_url = msgUrl; byUrl.set(msgUrl, existingByKey) }
        if (msgMid && !existingByKey._mid) { existingByKey._mid = msgMid }
        if (!existingByKey._msg_ts && msgTs) existingByKey._msg_ts = msgTs
        if (!existingByKey.size && plant.size) existingByKey.size = plant.size
        if (!existingByKey.age && plant.age) existingByKey.age = plant.age
        if (!existingByKey.region && plant.region) existingByKey.region = plant.region
        if (!existingByKey.originator && plant.originator) existingByKey.originator = plant.originator
      }
      continue
    }

    // Garden mismatch: one side has garden, other doesn't.
    // Match by latin_full only — if any existing entry lacks URL, backfill and skip.
    const latinNorm = normKey(plant.latin_full, '').split('|||')[0]
    const allByLatin = [...byKey.entries()].filter(([k]) => k.startsWith(latinNorm + '|||'))
    if (allByLatin.length > 0) {
      const needsUrl = allByLatin.find(([, v]) => !v.max_url)
      if (needsUrl) {
        const existing = needsUrl[1]
        // Backfill URL, garden, size, age if missing
        if (msgUrl && !existing.max_url) { existing.max_url = msgUrl; byUrl.set(msgUrl, existing) }
        if (plant.garden && !existing.garden) { existing.garden = plant.garden }
        if (plant.size && !existing.size) existing.size = plant.size
        if (plant.age && !existing.age) existing.age = plant.age
        if (plant.region && !existing.region) existing.region = plant.region
        if (plant.originator && !existing.originator) existing.originator = plant.originator
        continue
      }
      // All existing have URLs — skip if exact garden matches or if no URL-less entries remain
      const hasExactGarden = allByLatin.some(([k]) => k === key)
      if (hasExactGarden) continue
      // If there are existing entries with same latin AND same region AND same garden — likely same plant
      // Only skip if garden also matches (different gardens in same region = different plants)
      if (plant.region && plant.garden) {
        const sameRegionAndGarden = allByLatin.find(([, v]) =>
          v.region && plant.region.includes(v.region.split(',')[0]) &&
          v.garden && v.garden === plant.garden
        )
        if (sameRegionAndGarden) continue
      }
    }

    // New plant
    catalog.push(plant)
    byKey.set(key, plant)
    if (msgUrl) byUrl.set(msgUrl, plant)
    nextId++
    added++
    log(`  + New: ${plant.latin_full}`)

  }

  // ── Handle deleted posts: if a catalog entry's max_url no longer exists
  // in the channel, try to re-link to the best matching post still alive
  const allMsgUrls = new Set(messages.map(m => m.url || m.link || '').filter(Boolean))
  let relinked = 0
  for (const entry of catalog) {
    if (!entry.max_url || allMsgUrls.has(entry.max_url)) continue
    // This entry's post was deleted — find best alive match by key
    const entryKey = normKey(entry.latin_full, entry.garden)
    // Search messages for matching key, pick newest
    let bestMatch: any = null
    for (const msg of messages) {
      const body = msg.body || {}
      const text: string = body.text || ''
      if (!text.trim()) continue
      const fw = text.trim().split(/\s+/)[0]
      if (!VALID_GENERA.has(fw)) continue
      const msgUrl = msg.url || msg.link || ''
      const photos: string[] = []
      for (const att of (body.attachments || [])) {
        if (att.type === 'image' && att.payload?.url) photos.push(att.payload.url)
      }
      const p = extractPlant(text, photos, msgUrl, 0)
      if (!p) continue
      if (normKey(p.latin_full, p.garden) !== entryKey) continue
      if (!bestMatch || (msg.timestamp || 0) > (bestMatch.timestamp || 0)) {
        bestMatch = { msg, plant: p, photos, msgUrl, mid: body.mid || '' }
      }
    }
    if (bestMatch) {
      entry.max_url = bestMatch.msgUrl
      entry._mid = bestMatch.mid
      entry._msg_ts = bestMatch.msg.timestamp || 0
      entry.photos = bestMatch.photos
      entry.thumbs = bestMatch.photos
      if (bestMatch.plant.age) entry.age = bestMatch.plant.age
      if (bestMatch.plant.size) entry.size = bestMatch.plant.size
      if (bestMatch.plant.region) entry.region = bestMatch.plant.region
      if (bestMatch.plant.originator) entry.originator = bestMatch.plant.originator
      byUrl.set(bestMatch.msgUrl, entry)
      relinked++
      updated++
      log(`  🔗 Re-linked (deleted post): ${entry.latin_full} → ${bestMatch.msgUrl}`)
    }
  }
  if (relinked > 0) log(`  Re-linked ${relinked} entries with deleted posts`)

  log(`\n📊 Results:`)
  log(`  New plants added: ${added}`)
  log(`  Plants updated: ${updated}`)
  log(`  Total catalog now: ${catalog.length}`)

  if (added > 0 || updated > 0 || cleared > 0) {
    // Apply manual overrides (protected plants that shouldn't be overwritten by sync)
    const overridesPath = resolve(DATA_DIR, 'plant-overrides.json')
    if (existsSync(overridesPath)) {
      const overrides = JSON.parse(readFileSync(overridesPath, 'utf-8'))
      let overridden = 0
      for (const entry of catalog) {
        const ov = overrides[String(entry._site_id)]
        if (ov) {
          for (const [k, v] of Object.entries(ov)) entry[k] = v
          overridden++
        }
      }
      if (overridden > 0) log(`  Applied ${overridden} manual overrides`)
    }

    // Save catalog
    writeFileSync(catalogPath, JSON.stringify(catalog))
    log('  Saved catalog.json')

    // Auto-consent: all gardens in the catalog get consent (submitted via bot = agreed)
    const gardensPath = resolve(DATA_DIR, 'gardens.json')
    const gardensData = existsSync(gardensPath) ? JSON.parse(readFileSync(gardensPath, 'utf-8')) : { gardens: {} }
    if (!gardensData.gardens) gardensData.gardens = {}
    const allGardens = new Set(catalog.map((p: any) => p.garden).filter(Boolean))
    let newConsents = 0
    for (const g of allGardens) {
      // Convert hashtag form to display: "РусиновСад" → "Русинов Сад"
      const display = g.replace(/([a-zа-яё])([A-ZА-ЯЁ])/g, '$1 $2')
      if (!gardensData.gardens[display]?.consent) {
        gardensData.gardens[display] = {
          ...(gardensData.gardens[display] || {}),
          consent: true,
          consentAt: new Date().toISOString(),
          consentSource: 'channel-sync',
        }
        newConsents++
      }
    }
    if (newConsents > 0) {
      writeFileSync(gardensPath, JSON.stringify(gardensData, null, 2))
      log(`  Auto-consented ${newConsents} new gardens`)
    }

    // Run enrichment
    log('🔧 Running enrichment...')
    execSync('npx tsx scripts/enrich.ts', { cwd: ROOT, stdio: 'inherit' })

    // Copy to public
    copyFileSync(resolve(DATA_DIR, 'catalog-enriched.json'), resolve(ROOT, 'public/data/catalog-enriched.json'))
    copyFileSync(resolve(DATA_DIR, 'filters-enriched.json'), resolve(ROOT, 'public/data/filters-enriched.json'))
    log('  Updated public data')
  } else {
    log('  No changes, skipping enrichment')
  }

  // Save state
  const state = loadState()
  state.last_sync = new Date().toISOString()
  state.total_synced = (state.total_synced || 0) + added
  saveState(state)

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  log(`\n✅ Sync complete in ${elapsed}s`)
  log('========================================\n')
}

main().catch(err => {
  log(`❌ Fatal error: ${err}`)
  process.exit(1)
})
