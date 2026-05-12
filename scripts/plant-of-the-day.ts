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
const FORCE = process.argv.includes('--force')

// Max каналы
const POTD_CHANNELS = [
  '-72007651062457',  // Чат Хвоя Русинов Сад
  '-68936251771577',  // Канал Русинов Сад
]

// TG
const TG_TOKEN = envVars.POTD_TG_TOKEN || ''
const TG_CHANNEL = envVars.POTD_TG_CHANNEL || ''

// VK
const VK_TOKEN = envVars.POTD_VK_TOKEN || ''
const VK_USER_TOKEN = envVars.POTD_VK_USER_TOKEN || ''
const VK_GROUP_ID = envVars.POTD_VK_GROUP_ID || ''

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

  return candidates[Math.floor(Math.random() * candidates.length)]
}

// ── Format like MAX channel post ─────────────────────────
function formatPost(p: any): string {
  const lines: string[] = []

  // Header
  lines.push('РАСТЕНИЕ ДНЯ')
  lines.push('')

  // Latin name + Russian name (same format as channel)
  lines.push(p.latin_full)
  if (p.name_ru) lines.push(p.name_ru)
  lines.push('')

  // Info lines
  if (p.region) lines.push(p.region)
  if (p.age) lines.push(`Возраст: ${p.age}`)
  if (p.size) lines.push(`Размер: ${p.size}`)
  if (p.originator) {
    // Clean malformed "ы: Name" → "Name" (truncated "Оригинаторы:" from MAX parsing)
    const orig = p.originator.replace(/^ы:\s*/i, '').trim()
    if (orig) lines.push(`Оригинатор: ${orig}`)
  }

  // Garden name (human-readable)
  const garden = (p.garden || '').replace(/([a-zа-яё])([A-ZА-ЯЁ])/g, '$1 $2')
  if (garden) lines.push(garden)

  // Hashtags
  if (p.hashtags?.length) {
    lines.push(p.hashtags.map((h: string) => `#${h}`).join('\n'))
  }

  // Footer
  lines.push('')
  lines.push('terkaconifers.ru')
  lines.push('Территория хвойных. Каталог')

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

  const results = []
  for (const chatId of POTD_CHANNELS) {
    const resp = await fetch(`https://platform-api.max.ru/messages?chat_id=${chatId}`, {
      method: 'POST',
      headers: { Authorization: MAX_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await resp.json()
    console.log(`  → ${chatId}: ${resp.ok ? 'OK' : JSON.stringify(json)}`)
    results.push(json)
  }
  return results
}

// ── Post to TG ──────────────────────────────────────────
// Upload photos as files (TG can't always fetch URLs from Russian servers)
async function postToTelegram(text: string, photoUrls: string[]) {
  if (!TG_TOKEN || !TG_CHANNEL) { console.log('  TG: not configured, skipping'); return }
  try {
    const base = `https://api.telegram.org/bot${TG_TOKEN}`
    if (photoUrls.length === 0) {
      const r = await fetch(`${base}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TG_CHANNEL, text }) })
      const d = await r.json()
      console.log(`  TG: ${d.ok ? 'OK' : JSON.stringify(d)}`)
    } else if (photoUrls.length === 1) {
      const buf = Buffer.from(await (await fetch(photoUrls[0])).arrayBuffer())
      const boundary = '----TG' + Date.now()
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${TG_CHANNEL}\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${text.slice(0, 1024)}\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="photo.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
        buf,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ])
      const r = await fetch(`${base}/sendPhoto`, { method: 'POST', headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` }, body })
      const d = await r.json()
      console.log(`  TG: ${d.ok ? 'OK' : JSON.stringify(d)}`)
    } else {
      // Multiple photos: upload all as multipart in single sendMediaGroup
      const boundary = '----TG' + Date.now()
      const parts: Buffer[] = []
      const media = photoUrls.slice(0, 10).map((_, i) => ({
        type: 'photo',
        media: `attach://photo${i}`,
        ...(i === 0 ? { caption: text.slice(0, 1024) } : {}),
      }))
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${TG_CHANNEL}\r\n`))
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="media"\r\n\r\n${JSON.stringify(media)}\r\n`))
      for (let i = 0; i < photoUrls.slice(0, 10).length; i++) {
        const buf = Buffer.from(await (await fetch(photoUrls[i])).arrayBuffer())
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photo${i}"; filename="photo${i}.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`))
        parts.push(buf)
        parts.push(Buffer.from('\r\n'))
      }
      parts.push(Buffer.from(`--${boundary}--\r\n`))
      const body = Buffer.concat(parts)
      const r = await fetch(`${base}/sendMediaGroup`, { method: 'POST', headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` }, body })
      const d = await r.json()
      console.log(`  TG: ${d.ok ? 'OK' : JSON.stringify(d)}`)
    }
  } catch (err) { console.error('  TG error:', err) }
}

// ── Post to VK ──────────────────────────────────────────
async function postToVK(text: string, photoUrls: string[]) {
  if (!VK_TOKEN || !VK_GROUP_ID) { console.log('  VK: not configured, skipping'); return }
  try {
    let attachments = ''
    const photoToken = VK_USER_TOKEN || VK_TOKEN

    if (photoUrls.length > 0) {
      const srvRes = await fetch(`https://api.vk.com/method/photos.getWallUploadServer?group_id=${VK_GROUP_ID}&access_token=${photoToken}&v=5.199`)
      const uploadUrl = (await srvRes.json())?.response?.upload_url
      if (!uploadUrl) { console.error('  VK: no upload URL'); }

      if (uploadUrl) {
        const uploaded: string[] = []
        for (const url of photoUrls.slice(0, 10)) {
          try {
            const blob = await (await fetch(url)).arrayBuffer()
            const buf = Buffer.from(blob)
            const boundary = '----VK' + Date.now()
            const body = Buffer.concat([
              Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="photo.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
              buf,
              Buffer.from(`\r\n--${boundary}--\r\n`),
            ])
            const upRes = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` }, body })
            const upData = await upRes.json()
            if (!upData.photo || upData.photo === '[]') continue
            const saveRes = await fetch(`https://api.vk.com/method/photos.saveWallPhoto?group_id=${VK_GROUP_ID}&photo=${encodeURIComponent(upData.photo)}&server=${upData.server}&hash=${upData.hash}&access_token=${photoToken}&v=5.199`)
            const saved = (await saveRes.json())?.response?.[0]
            if (saved) uploaded.push(`photo${saved.owner_id}_${saved.id}`)
          } catch (e) { console.error('  VK photo error:', e) }
        }
        attachments = uploaded.join(',')
      }
    }

    const params = new URLSearchParams({ owner_id: `-${VK_GROUP_ID}`, from_group: '1', message: text, access_token: VK_TOKEN, v: '5.199' })
    if (attachments) params.set('attachments', attachments)
    const data = await (await fetch(`https://api.vk.com/method/wall.post?${params}`)).json()
    console.log(`  VK: ${data?.response?.post_id ? 'OK (post ' + data.response.post_id + ')' : JSON.stringify(data?.error || data)}`)
  } catch (err) { console.error('  VK error:', err) }
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

  const fullPhotoUrls = plant.photos.map((ph: string) => ph.startsWith('http') ? ph : `https://terkaconifers.ru/${ph}`)

  await postToMax(text, plant.photos)
  await postToTelegram(text, fullPhotoUrls)
  await postToVK(text, fullPhotoUrls)

  state.posted.push(plant.latin_full)
  state.lastDate = today
  saveState(state)
  console.log('Posted!')
}

main().catch(err => { console.error(err); process.exit(1) })
