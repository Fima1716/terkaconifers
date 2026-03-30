/**
 * «Растение дня» — берёт случайное растение из каталога
 * и постит его в MAX в том же формате что и канал-каталог,
 * с шапкой "Растение дня" и ссылкой на сайт.
 *
 * Запуск: npx tsx scripts/plant-of-the-day.ts --force
 * Крон:  каждый день в 10:00, скрипт сам решает постить (1 из 7).
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(import.meta.dirname, '..')
const RAW_CATALOG = resolve(ROOT, 'data/raw/catalog.json')
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

// ── State ────────────────────────────────────────────────
interface PotdState {
  posted: string[]
  lastDate: string
}

function loadState(): PotdState {
  if (existsSync(STATE_PATH)) {
    try { return JSON.parse(readFileSync(STATE_PATH, 'utf-8')) } catch {}
  }
  return { posted: [], lastDate: '' }
}

function saveState(s: PotdState) {
  if (s.posted.length > 500) s.posted = s.posted.slice(-500)
  writeFileSync(STATE_PATH, JSON.stringify(s, null, 2))
}

// ── Should we post today? ────────────────────────────────
function shouldPostToday(): boolean {
  if (FORCE) return true
  const today = new Date().toISOString().slice(0, 10)
  let hash = 0
  for (const ch of today) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0
  return Math.abs(hash) % 7 === 0
}

// ── Pick plant ───────────────────────────────────────────
function pickPlant(catalog: any[], posted: string[]): any | null {
  const postedSet = new Set(posted)
  const candidates = catalog.filter(p =>
    p.photos?.length > 0 && p.latin_full && !postedSet.has(p.latin_full)
  )
  if (!candidates.length) return null

  const scored = candidates.map(p => ({
    plant: p,
    score: (p.photos?.length > 1 ? 2 : 0) +
           (p.is_russian ? 1 : 0) +
           (p.age ? 1 : 0) +
           Math.random() * 3,
  }))
  scored.sort((a, b) => b.score - a.score)
  return scored[0].plant
}

// ── Format like MAX channel post ─────────────────────────
function formatPost(p: any): string {
  const lines: string[] = []

  // Header
  lines.push('Растение дня')
  lines.push('')

  // Latin name + Russian name (same format as channel)
  lines.push(p.latin_full)
  if (p.name_ru) lines.push(p.name_ru)
  lines.push('')

  // Info lines
  if (p.region) lines.push(p.region)
  if (p.age) lines.push(`Возраст: ${p.age}`)
  if (p.size) lines.push(`Размер: ${p.size}`)
  if (p.originator) lines.push(`Оригинатор: ${p.originator}`)

  // Garden name (human-readable)
  const garden = (p.garden || '').replace(/([a-zа-яё])([A-ZА-ЯЁ])/g, '$1 $2')
  if (garden) lines.push(garden)

  // Hashtags
  if (p.hashtags?.length) {
    lines.push(p.hashtags.map((h: string) => `#${h}`).join('\n'))
  }

  // Footer
  lines.push('')
  lines.push('terkaconifers.ru — каталог хвойных растений')

  return lines.join('\n')
}

// ── Post to MAX ──────────────────────────────────────────
async function postToMax(text: string, photos: string[]) {
  const attachments = photos.map(ph => {
    const url = ph.startsWith('http') ? ph : `https://terkaconifers.ru/${ph}`
    return { type: 'image', payload: { url } }
  })
  const body: any = { text }
  if (attachments.length) body.attachments = attachments
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

  if (state.lastDate === today && !FORCE) {
    console.log(`Already posted today (${today}), skipping.`)
    return
  }

  if (!shouldPostToday()) {
    console.log(`Not posting today (${today}). Use --force to override.`)
    return
  }

  if (!existsSync(RAW_CATALOG)) { console.error('Catalog not found'); process.exit(1) }
  const catalog = JSON.parse(readFileSync(RAW_CATALOG, 'utf-8'))

  const plant = pickPlant(catalog, state.posted)
  if (!plant) { console.log('No suitable plant found'); return }

  const text = formatPost(plant)
  console.log(text)
  console.log('---')
  console.log(`Photos: ${plant.photos.length}`)

  await postToMax(text, plant.photos)

  state.posted.push(plant.latin_full)
  state.lastDate = today
  saveState(state)
  console.log('Posted!')
}

main().catch(err => { console.error(err); process.exit(1) })
