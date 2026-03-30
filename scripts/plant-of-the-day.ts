/**
 * «Растение дня» — выбирает случайное растение из каталога
 * и постит красивое сообщение с фото в MAX чат.
 *
 * Запуск вручную: npx tsx scripts/plant-of-the-day.ts
 * Крон (раз в неделю, случайный день): см. ниже
 *
 * Стратегия: крон запускает скрипт каждый день,
 * но скрипт сам решает постить или нет (1 из 7 дней).
 * Это даёт рандомный день недели без сложной логики.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(import.meta.dirname, '..')
const CATALOG_PATH = resolve(ROOT, 'data/catalog-enriched.json')
const STATE_PATH = resolve(ROOT, 'data/potd-state.json')

// Load .env
const envVars: Record<string, string> = {}
const envPath = resolve(ROOT, '.env')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) envVars[m[1].trim()] = m[2].trim()
  }
}

const MAX_TOKEN = envVars.MAX_BOT_TOKEN || ''
const CHAT_ID = envVars.ADMIN_CHAT_ID || '-72548188058297'
const FORCE = process.argv.includes('--force')

if (!MAX_TOKEN) { console.error('No MAX_BOT_TOKEN in .env'); process.exit(1) }

// ── State: track posted plants to avoid repeats ──────────
interface PotdState {
  posted: string[]    // latin_full of previously posted plants
  lastDate: string    // ISO date of last post
}

function loadState(): PotdState {
  if (existsSync(STATE_PATH)) {
    try { return JSON.parse(readFileSync(STATE_PATH, 'utf-8')) } catch {}
  }
  return { posted: [], lastDate: '' }
}

function saveState(s: PotdState) {
  // Keep last 200 posted to avoid repeats
  if (s.posted.length > 200) s.posted = s.posted.slice(-200)
  writeFileSync(STATE_PATH, JSON.stringify(s, null, 2))
}

// ── Should we post today? (1 in 7 chance) ────────────────
function shouldPostToday(): boolean {
  if (FORCE) return true
  // Deterministic per-day: hash the date → 1 in 7
  const today = new Date().toISOString().slice(0, 10)
  let hash = 0
  for (const ch of today) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0
  return Math.abs(hash) % 7 === 0
}

// ── Pick a good plant ────────────────────────────────────
function pickPlant(catalog: any[], posted: string[]): any | null {
  const postedSet = new Set(posted)

  // Filter: has photo, has species_ru, not already posted
  const candidates = catalog.filter(p =>
    p.thumbs?.length > 0 &&
    p.species_ru &&
    p.latin_full &&
    !postedSet.has(p.latin_full)
  )

  if (candidates.length === 0) return null

  // Prefer plants with: photos > 1, has conditions, is_russian_enriched
  const scored = candidates.map(p => ({
    plant: p,
    score: (p.photos?.length > 1 ? 2 : 0) +
           (p.conditions ? 1 : 0) +
           (p.is_russian_enriched ? 1 : 0) +
           (p.age_display ? 1 : 0) +
           Math.random() * 3, // randomness
  }))

  scored.sort((a, b) => b.score - a.score)
  return scored[0].plant
}

// ── Format the message ───────────────────────────────────
function formatMessage(p: any): string {
  const lines: string[] = []

  lines.push(`🌲 Растение дня`)
  lines.push('')
  lines.push(p.latin_full)
  if (p.species_ru) lines.push(p.species_ru)
  lines.push('')

  if (p.region_normalized) lines.push(`📍 ${p.region_normalized}`)
  if (p.age_display) lines.push(`🕐 Возраст: ${p.age_display}`)
  if (p.size_display) lines.push(`📏 ${p.size_display}`)
  if (p.garden_display) lines.push(`🏡 ${p.garden_display}`)

  lines.push('')
  lines.push(`Ещё ${Math.floor(Math.random() * 100 + 2200)}+ хвойных на terkaconifers.ru`)

  return lines.join('\n')
}

// ── Post to MAX ──────────────────────────────────────────
async function postToMax(text: string, photoUrl: string) {
  const body: any = { text }
  if (photoUrl) {
    body.attachments = [{ type: 'image', payload: { url: photoUrl } }]
  }
  const resp = await fetch(`https://platform-api.max.ru/messages?chat_id=${CHAT_ID}`, {
    method: 'POST',
    headers: { Authorization: MAX_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return resp.json()
}

// ── Main ─────────────────────────────────────────────────
async function main() {
  const state = loadState()
  const today = new Date().toISOString().slice(0, 10)

  // Already posted today?
  if (state.lastDate === today && !FORCE) {
    console.log(`Already posted today (${today}), skipping.`)
    return
  }

  // Should we post?
  if (!shouldPostToday()) {
    console.log(`Not posting today (${today}) — not our day. Use --force to override.`)
    return
  }

  // Load catalog
  if (!existsSync(CATALOG_PATH)) { console.error('Catalog not found'); process.exit(1) }
  const data = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'))
  const catalog = data.plants || data

  // Pick plant
  const plant = pickPlant(catalog, state.posted)
  if (!plant) { console.log('No suitable plant found'); return }

  // Format and post
  const text = formatMessage(plant)
  const photoUrl = plant.photos?.[0]
    ? (plant.photos[0].startsWith('http') ? plant.photos[0] : `https://terkaconifers.ru/${plant.photos[0]}`)
    : ''

  console.log(`Posting: ${plant.latin_full}`)
  console.log(text)
  console.log(`Photo: ${photoUrl}`)

  const result = await postToMax(text, photoUrl)
  console.log('Result:', JSON.stringify(result).substring(0, 200))

  // Save state
  state.posted.push(plant.latin_full)
  state.lastDate = today
  saveState(state)
  console.log('Done!')
}

main().catch(err => { console.error(err); process.exit(1) })
