/**
 * Shared duplicate detection for both Леший (MAX) and TG-bridge bots.
 *
 * Checks 3 sources:
 * 1. data/raw/catalog.json — main catalog (synced nightly)
 * 2. data/recent-publications.json — published but not yet synced
 * 3. Both bots' pendingPublish states
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(import.meta.dirname, '../..')
const CATALOG_PATH = resolve(ROOT, 'data/raw/catalog.json')
const PUBLICATIONS_PATH = resolve(ROOT, 'data/recent-publications.json')
const BOT_STATE_PATH = resolve(ROOT, 'data/bot-state.json')
const TG_STATE_PATH = resolve(ROOT, 'data/tg-bridge-state.json')

// ── Valid genera ─────────────────────────────────────────
const VALID_GENERA = new Set([
  'Abies', 'Calocedrus', 'Cedrus', 'Chamaecyparis', 'Cryptomeria',
  'Ginkgo', 'Juniperus', 'Larix', 'Metasequoia', 'Microbiota',
  'Picea', 'Pinus', 'Platycladus', 'Pseudotsuga', 'Sciadopitys',
  'Sequoiadendron', 'Taxus', 'Thuja', 'Thujopsis', 'Tsuga',
])

// ── Latin name parser ────────────────────────────────────
// Extracts genus, species, cultivar from freeform text like:
//   "Larix sibirica Samba Пермский край, Чайковский, 7 лет"
//   "Picea pungens 'Hoopsii'"
//   "Pinus mugo var. pumilio 'Winter Gold'"

const QUOTE_CHARS = /['''\u2018\u2019\u201C\u201D"`]/g

export interface ParsedLatin {
  genus: string       // "Larix"
  species: string     // "sibirica"
  cultivar: string    // "Samba"
  normalized: string  // "larix sibirica samba"
}

export function parseLatinName(text: string): ParsedLatin | null {
  if (!text) return null
  const firstLine = text.split('\n').map(l => l.trim()).filter(Boolean)[0] || ''
  const firstWord = firstLine.split(/\s+/)[0]
  if (!VALID_GENERA.has(firstWord)) return null

  const genus = firstWord

  // Remove genus, then extract species + cultivar from remaining
  const rest = firstLine.slice(genus.length).trim()

  // Try to find quoted cultivar first
  const quoteMatch = rest.match(/['''\u2018\u2019\u201C\u201D"`]([^'''\u2018\u2019\u201C\u201D"`]+)['''\u2018\u2019\u201C\u201D"`]/)
  let cultivar = quoteMatch ? quoteMatch[1].trim() : ''

  // Extract species: first lowercase latin word after genus
  // Handle: "sibirica", "x eurolepis", "gmelinii var rupprechtii"
  const speciesMatch = rest.match(/^(?:([хx×])\s+)?([a-z][a-z-]+)(?:\s+(?:var\.?\s+|subsp\.?\s+)([a-z]+))?/i)
  let species = ''
  let hybrid = ''
  let variety = ''
  if (speciesMatch) {
    hybrid = speciesMatch[1] || ''
    species = speciesMatch[2] || ''
    variety = speciesMatch[3] || ''
  }

  // If no quoted cultivar, try to find unquoted one:
  // After genus+species, look for a Capitalized word that's not Cyrillic/location
  if (!cultivar && species) {
    const afterSpecies = rest.slice(rest.indexOf(species) + species.length + (variety ? variety.length + 5 : 0)).trim()
    // Take words until we hit Cyrillic, comma, or number
    const words = afterSpecies.split(/[\s,]+/)
    const cultivarParts: string[] = []
    for (const w of words) {
      // Stop at Cyrillic, numbers followed by "лет", location-like words
      if (/[а-яА-ЯёЁ]/.test(w)) break
      if (/^\d+$/.test(w)) break
      if (!w || w.length < 2) break
      // Remove any remaining quotes
      const clean = w.replace(QUOTE_CHARS, '').trim()
      if (clean) cultivarParts.push(clean)
    }
    if (cultivarParts.length > 0 && cultivarParts.length <= 4) {
      cultivar = cultivarParts.join(' ')
    }
  }

  const parts = [genus, hybrid, species, variety, cultivar]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()

  return {
    genus,
    species: [hybrid, species, variety].filter(Boolean).join(' '),
    cultivar,
    normalized: parts.toLowerCase(),
  }
}

// ── Recent publications cache ────────────────────────────
export interface Publication {
  latin: string       // normalized latin
  garden: string
  date: string        // ISO
  source: string      // 'max' | 'tg'
  channelMid?: string // message ID in the catalog channel
  text?: string       // first line of published text (for display)
  author?: string     // who submitted
}

export function loadPublications(): Publication[] {
  if (!existsSync(PUBLICATIONS_PATH)) return []
  try {
    const data = JSON.parse(readFileSync(PUBLICATIONS_PATH, 'utf-8'))
    return data.entries || []
  } catch { return [] }
}

export function addPublication(latin: string, garden: string, source: string, extra?: { channelMid?: string; text?: string; author?: string }) {
  const pubs = loadPublications()
  pubs.push({
    latin: latin.toLowerCase(), garden, date: new Date().toISOString(), source,
    channelMid: extra?.channelMid, text: extra?.text, author: extra?.author,
  })
  // Keep last 500
  const trimmed = pubs.slice(-500)
  writeFileSync(PUBLICATIONS_PATH, JSON.stringify({ entries: trimmed }, null, 2))
}

export function removePublication(channelMid: string): boolean {
  const pubs = loadPublications()
  const idx = pubs.findIndex(p => p.channelMid === channelMid)
  if (idx < 0) return false
  pubs.splice(idx, 1)
  writeFileSync(PUBLICATIONS_PATH, JSON.stringify({ entries: pubs }, null, 2))
  return true
}

// ── Load pending from both bots ──────────────────────────
function loadPendingTexts(): string[] {
  const texts: string[] = []
  for (const path of [BOT_STATE_PATH, TG_STATE_PATH]) {
    if (!existsSync(path)) continue
    try {
      const state = JSON.parse(readFileSync(path, 'utf-8'))
      for (const p of Object.values(state.pendingPublish || {})) {
        const aiText = (p as any).aiText
        if (aiText) texts.push(aiText)
      }
    } catch {}
  }
  return texts
}

// ── Main duplicate check ─────────────────────────────────
export interface DupeMatch {
  latin_full: string
  garden: string
  max_url: string
  date: string
  source: string  // 'catalog' | 'recent' | 'pending'
}

export function findAllDuplicates(text: string): { parsed: ParsedLatin; matches: DupeMatch[] } | null {
  const parsed = parseLatinName(text)
  if (!parsed) return null

  const matches: DupeMatch[] = []

  // 1. Check catalog.json
  if (existsSync(CATALOG_PATH)) {
    try {
      const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'))
      for (const p of catalog) {
        const pParsed = parseLatinName(p.latin_full || '')
        if (!pParsed) continue
        if (pParsed.normalized === parsed.normalized) {
          matches.push({
            latin_full: p.latin_full,
            garden: p.garden || '',
            max_url: p.max_url || '',
            date: p.date || '',
            source: 'catalog',
          })
        }
      }
    } catch {}
  }

  // 2. Check recent publications (published but not yet synced)
  for (const pub of loadPublications()) {
    if (pub.latin === parsed.normalized) {
      matches.push({
        latin_full: pub.latin,
        garden: pub.garden,
        max_url: '',
        date: pub.date.slice(0, 10),
        source: 'recent',
      })
    }
  }

  // 3. Check pending in both bots
  for (const pendingText of loadPendingTexts()) {
    const pendingParsed = parseLatinName(pendingText)
    if (pendingParsed && pendingParsed.normalized === parsed.normalized) {
      // Extract garden from pending text (line before hashtags, after metadata)
      const lines = pendingText.split('\n').map(l => l.trim()).filter(Boolean)
      const gardenLine = lines.find(l => !l.startsWith('#') && !l.startsWith('Возраст') && !l.startsWith('Размер') && !l.startsWith('Оригинатор') && /[А-Яа-яЁё]/.test(l) && !l.includes(',') && lines.indexOf(l) > 2) || ''
      matches.push({
        latin_full: pendingText.split('\n')[0],
        garden: gardenLine,
        max_url: '',
        date: 'ожидает публикации',
        source: 'pending',
      })
    }
  }

  return matches.length > 0 ? { parsed, matches } : null
}

// ── Extract garden from AI-formatted text ────────────────
export function extractGarden(text: string): string {
  // Garden is usually the line before hashtags, after metadata lines
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].startsWith('#')) continue
    if (/^(Возраст|Размер|Оригинатор|Регион):/i.test(lines[i])) continue
    if (/[А-Яа-яЁё]/.test(lines[i]) && !lines[i].includes(',') && i > 1) return lines[i]
    break
  }
  return ''
}

function gardenMatch(g1: string, g2: string): boolean {
  if (!g1 || !g2) return false
  const n1 = g1.replace(/\s+/g, '').toLowerCase()
  const n2 = g2.replace(/\s+/g, '').toLowerCase()
  return n1.includes(n2) || n2.includes(n1)
}

function formatLine(m: DupeMatch): string {
  const gardenDisplay = (m.garden || '').replace(/([a-zа-яё])([A-ZА-ЯЁ])/g, '$1 $2')
  const sourceTag = m.source === 'recent' ? ' [недавно]'
    : m.source === 'pending' ? ' [ожидает]'
    : ''
  const link = m.max_url ? ` — ${m.max_url}` : ''
  return `  • ${gardenDisplay || 'без сада'}, ${m.date}${link}${sourceTag}`
}

// ── Format dupe warning for admin chat ───────────────────
export function formatDupeWarning(matches: DupeMatch[], submittedGarden?: string): string {
  if (!matches.length) return ''

  const sameGarden = submittedGarden
    ? matches.filter(m => gardenMatch(m.garden, submittedGarden))
    : []
  const otherGardens = submittedGarden
    ? matches.filter(m => !gardenMatch(m.garden, submittedGarden))
    : matches

  let result = ''

  if (sameGarden.length > 0) {
    const lines = sameGarden.map(formatLine).join('\n')
    result += `\n\n⚠️ ДУБЛИКАТ! Уже есть в этом саду:\n${lines}\n\nЕсли обновлённые фото — публикуйте, старые заменятся при синхронизации.`
  }

  if (otherGardens.length > 0) {
    const lines = otherGardens.map(formatLine).join('\n')
    result += `\n\nℹ️ Есть в других садах:\n${lines}`
  }

  return result
}
