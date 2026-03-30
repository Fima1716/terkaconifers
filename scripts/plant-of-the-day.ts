/**
 * «Растение дня» — выбирает случайное растение из каталога,
 * генерирует красивое описание через DeepSeek и постит в MAX.
 *
 * Запуск: npx tsx scripts/plant-of-the-day.ts --force
 * Крон:  каждый день в 10:00, скрипт сам решает постить (1 из 7).
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
const AI_KEY = envVars.DEEPSEEK_API_KEY || envVars.GROQ_API_KEY || ''
const FORCE = process.argv.includes('--force')

if (!MAX_TOKEN) { console.error('No MAX_BOT_TOKEN in .env'); process.exit(1) }

// ── State: track posted plants ───────────────────────────
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

// ── Should we post today? (1 in 7 chance) ────────────────
function shouldPostToday(): boolean {
  if (FORCE) return true
  const today = new Date().toISOString().slice(0, 10)
  let hash = 0
  for (const ch of today) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0
  return Math.abs(hash) % 7 === 0
}

// ── Pick a good plant ────────────────────────────────────
function pickPlant(catalog: any[], posted: string[]): any | null {
  const postedSet = new Set(posted)
  const candidates = catalog.filter(p =>
    p.thumbs?.length > 0 && p.species_ru && p.latin_full && !postedSet.has(p.latin_full)
  )
  if (!candidates.length) return null

  const scored = candidates.map(p => ({
    plant: p,
    score: (p.photos?.length > 1 ? 2 : 0) +
           (p.conditions ? 1 : 0) +
           (p.is_russian_enriched ? 1 : 0) +
           (p.age_display ? 1 : 0) +
           Math.random() * 3,
  }))
  scored.sort((a, b) => b.score - a.score)
  return scored[0].plant
}

// ── AI description ───────────────────────────────────────
async function generateDescription(p: any): Promise<string> {
  const facts = [
    `Латинское: ${p.latin_full}`,
    `Русское: ${p.species_ru}`,
    p.region_normalized ? `Регион: ${p.region_normalized}` : '',
    p.age_display ? `Возраст: ${p.age_display}` : '',
    p.size_display ? `Размер: ${p.size_display}` : '',
    p.garden_display ? `Сад: ${p.garden_display}` : '',
    p.form_ru ? `Форма: ${p.form_ru}` : '',
    p.color_ru ? `Цвет: ${p.color_ru}` : '',
    p.originator ? `Оригинатор: ${p.originator}` : '',
  ].filter(Boolean).join('\n')

  if (!AI_KEY) return fallbackFormat(p)

  try {
    const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${AI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 0.7,
        max_tokens: 300,
        messages: [
          {
            role: 'system',
            content: `Ты пишешь короткий пост «Растение дня» для канала любителей хвойных растений.

ФОРМАТ (строго):
1. Первая строка: "Растение дня" (без эмодзи)
2. Пустая строка
3. Латинское название
4. Русское название вида
5. Пустая строка
6. 2-3 предложения — интересный факт о сорте, виде или форме. Пиши живо, для увлечённых садоводов. Без воды и банальностей. Если знаешь что-то конкретное про этот сорт — пиши. Если нет — расскажи про вид или форму.
7. Пустая строка
8. Характеристики (каждая с новой строки, БЕЗ эмодзи):
   Регион: ...
   Возраст: ...
   Размер: ... (если есть)
   Сад: ...
9. Пустая строка
10. Последняя строка: "2300+ хвойных в каталоге — terkaconifers.ru"

ПРАВИЛА:
- Никаких эмодзи
- Никаких хештегов
- Текст без кавычек-ёлочек
- Пиши по-русски, кроме латинского названия
- Если данных мало — не выдумывай, просто напиши что есть`
          },
          { role: 'user', content: facts }
        ],
      }),
    })
    if (!resp.ok) {
      console.error(`AI error: ${resp.status}`)
      return fallbackFormat(p)
    }
    const data: any = await resp.json()
    return data.choices?.[0]?.message?.content?.trim() || fallbackFormat(p)
  } catch (e) {
    console.error(`AI error: ${e}`)
    return fallbackFormat(p)
  }
}

function fallbackFormat(p: any): string {
  const lines = ['Растение дня', '', p.latin_full, p.species_ru, '']
  if (p.region_normalized) lines.push(`Регион: ${p.region_normalized}`)
  if (p.age_display) lines.push(`Возраст: ${p.age_display}`)
  if (p.size_display) lines.push(`Размер: ${p.size_display}`)
  if (p.garden_display) lines.push(`Сад: ${p.garden_display}`)
  lines.push('', '2300+ хвойных в каталоге — terkaconifers.ru')
  return lines.join('\n')
}

// ── Post to MAX ──────────────────────────────────────────
async function postToMax(text: string, photoUrl: string) {
  const body: any = { text }
  if (photoUrl) body.attachments = [{ type: 'image', payload: { url: photoUrl } }]
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

  if (!existsSync(CATALOG_PATH)) { console.error('Catalog not found'); process.exit(1) }
  const data = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'))
  const catalog = data.plants || data

  const plant = pickPlant(catalog, state.posted)
  if (!plant) { console.log('No suitable plant found'); return }

  console.log(`Picked: ${plant.latin_full}`)

  const text = await generateDescription(plant)
  console.log('---')
  console.log(text)
  console.log('---')

  const photoUrl = plant.photos?.[0]
    ? (plant.photos[0].startsWith('http') ? plant.photos[0] : `https://terkaconifers.ru/${plant.photos[0]}`)
    : ''

  await postToMax(text, photoUrl)

  state.posted.push(plant.latin_full)
  state.lastDate = today
  saveState(state)
  console.log('Posted!')
}

main().catch(err => { console.error(err); process.exit(1) })
