/**
 * One-time script: fetch all messages from MAX and backfill _mid into catalog.json
 * Usage: npx tsx scripts/backfill-mids.ts
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(import.meta.dirname, '..')
const env: Record<string, string> = {}
const envPath = resolve(ROOT, '.env')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) env[m[1].trim()] = m[2].trim()
  }
}

const TOKEN = env.MAX_BOT_TOKEN || ''
const CHAT_ID = env.MAX_CHAT_ID || '-71324192443065'
const BASE_URL = 'https://platform-api.max.ru'

if (!TOKEN) { console.error('No MAX_BOT_TOKEN in .env'); process.exit(1) }

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
    if (!resp.ok) { console.error(`API error page ${page}: ${resp.status}`); break }

    const data = await resp.json()
    const messages = data.messages || []
    if (!messages.length) break

    all.push(...messages)
    console.log(`Page ${page}: ${messages.length} msgs (total: ${all.length})`)

    const lastTs = messages[messages.length - 1]?.timestamp
    if (!lastTs || messages.length < 100) break
    fromTs = lastTs - 1
    await new Promise(r => setTimeout(r, 300))
  }
  return all
}

async function main() {
  console.log('Fetching all messages from MAX...')
  const messages = await fetchAllMessages()
  console.log(`Total: ${messages.length} messages`)

  // Build url→mid map
  const urlToMid = new Map<string, string>()
  for (const msg of messages) {
    const url = msg.url || msg.link || ''
    const mid = msg.body?.mid || ''
    if (url && mid) urlToMid.set(url, mid)
  }
  console.log(`URL→MID mappings: ${urlToMid.size}`)

  // Load catalog
  const catalogPath = resolve(ROOT, 'data/raw/catalog.json')
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'))

  let filled = 0
  let already = 0
  let missing = 0
  for (const plant of catalog) {
    if (plant._mid) { already++; continue }
    const mid = urlToMid.get(plant.max_url)
    if (mid) {
      plant._mid = mid
      filled++
    } else {
      missing++
    }
  }

  writeFileSync(catalogPath, JSON.stringify(catalog))
  console.log(`Done: ${filled} filled, ${already} already had mid, ${missing} no match`)
}

main()
