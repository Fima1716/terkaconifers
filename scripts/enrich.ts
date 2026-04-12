/**
 * Data enrichment script
 * Reads raw catalog data and produces enriched versions with
 * parsed forms, colors, normalized regions, hardiness zones, etc.
 *
 * Run: npx tsx scripts/enrich.ts
 */
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'fs'
import { resolve } from 'path'
import { createHash } from 'crypto'

const ROOT = resolve(import.meta.dirname, '..')
const RAW_DIR = resolve(ROOT, 'data/raw')
const OUT_DIR = resolve(ROOT, 'data')

// ── .env loading ──────────────────────────────────────────────
const env: Record<string, string> = {}
const envPath = resolve(ROOT, '.env')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) env[m[1].trim()] = m[2].trim()
  }
}
const AI_KEY = env.DEEPSEEK_API_KEY || ''

// ── Region cache (AI-resolved locations) ──────────────────────
const REGION_CACHE_PATH = resolve(OUT_DIR, 'region-cache.json')

function loadRegionCache(): Record<string, { region: string; district: string }> {
  if (!existsSync(REGION_CACHE_PATH)) return {}
  try { return JSON.parse(readFileSync(REGION_CACHE_PATH, 'utf-8')) } catch { return {} }
}

function saveRegionCache(cache: Record<string, { region: string; district: string }>) {
  writeFileSync(REGION_CACHE_PATH, JSON.stringify(cache, null, 2))
}

const regionCache = loadRegionCache()

async function resolveRegionWithAI(rawRegion: string): Promise<{ region: string; district: string } | null> {
  if (!AI_KEY || !rawRegion) return null
  const cacheKey = rawRegion.toLowerCase().trim()
  if (regionCache[cacheKey]) return regionCache[cacheKey]

  try {
    const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${AI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 0,
        max_tokens: 100,
        messages: [{
          role: 'system',
          content: `Ты определяешь субъект РФ по названию населённого пункта или локации.
Ответь СТРОГО в формате JSON: {"region": "Название области/края/республики", "district": "город/район"}
Примеры:
"г.Комсомольск-на-Амуре" → {"region": "Хабаровский край", "district": "Комсомольск-на-Амуре"}
"Раменский р-н" → {"region": "Московская область", "district": "Раменский район"}
"Минск" → {"region": "Беларусь", "district": "Минск"}
Если не знаешь — ответь {"region": "", "district": ""}. Только JSON, ничего больше.`,
        }, {
          role: 'user',
          content: rawRegion,
        }],
      }),
    })
    if (!resp.ok) return null
    const data: any = await resp.json()
    let text = data.choices?.[0]?.message?.content?.trim() || ''
    // Strip markdown code fences if present (```json ... ```)
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const parsed = JSON.parse(text)
    if (parsed.region) {
      const result = { region: parsed.region, district: parsed.district || '' }
      regionCache[cacheKey] = result
      saveRegionCache(regionCache)
      console.log(`  🤖 AI: "${rawRegion}" → ${result.region}, ${result.district}`)
      return result
    }
  } catch (e) {
    console.log(`  ⚠️ AI region resolve failed for "${rawRegion}": ${e}`)
  }
  return null
}

// ── Types ────────────────────────────────────────────────────

interface RawPlant {
  id: number
  genus: string
  genus_ru: string
  species: string
  cultivar: string
  latin_full: string
  name_ru: string
  region: string
  age: string
  size: string
  garden: string
  originator: string
  is_russian: boolean
  photos: string[]
  thumbs: string[]
  date: string
  hashtags: string[]
  max_url: string
  is_new?: boolean
}

interface EnrichedPlant extends RawPlant {
  is_new: boolean
  species_full: string
  species_ru: string
  cultivar_ru: string
  form: string | null
  form_ru: string | null
  color: string | null
  color_ru: string | null
  region_normalized: string
  region_district: string
  hardiness_zone: number | null
  hardiness_label: string
  garden_display: string
  garden_type: string
  garden_type_ru: string
  age_min: number | null
  age_max: number | null
  age_display: string
  size_display: string
  is_russian_enriched: boolean
}

// ── Form parsing from cultivar name ──────────────────────────

const FORM_KEYWORDS: Record<string, string[]> = {
  dwarf: ['Nana', 'Dwarf', 'Minima', 'Pumila', 'Little', 'Mini', 'Pygmaea', 'Compacta', 'Humilis', 'Brevifolia'],
  weeping: ['Pendula', 'Inversa', 'Reflexa', 'Weeping', 'Gracilis'],
  columnar: ['Columnaris', 'Fastigiata', 'Pyramidalis', 'Sentinel', 'Erecta', 'Stricta'],
  spreading: ['Horizontalis', 'Repens', 'Repanda', 'Expansa'],
  prostrate: ['Prostrata', 'Procumbens', 'Creeping', 'Hugging'],
  globose: ['Globosa', 'Globe', 'Spherica', 'Rotundata'],
}

const FORM_RU: Record<string, string> = {
  dwarf: 'Карликовая',
  weeping: 'Плакучая',
  columnar: 'Колонновидная',
  spreading: 'Распростёртая',
  prostrate: 'Стелющаяся',
  globose: 'Шаровидная',
}

// Species that inherently indicate a growth form
const SPECIES_FORM: Record<string, string> = {
  pumila: 'dwarf',
  nana: 'dwarf',
  horizontalis: 'spreading',
  prostrata: 'prostrate',
  repens: 'prostrate',
  pendula: 'weeping',
  columnaris: 'columnar',
}

function parseForm(cultivar: string, species?: string, latinFull?: string): { form: string | null; form_ru: string | null } {
  // 1. Check cultivar name keywords
  if (cultivar) {
    const lower = cultivar.toLowerCase()
    for (const [form, keywords] of Object.entries(FORM_KEYWORDS)) {
      for (const kw of keywords) {
        if (lower.includes(kw.toLowerCase())) {
          return { form, form_ru: FORM_RU[form] }
        }
      }
    }
  }

  // 2. Check latin_full for "f. nana", "var. nana", etc.
  if (latinFull) {
    const lfLower = latinFull.toLowerCase()
    const varMatch = lfLower.match(/(?:f\.|var\.)\s*(\w+)/)
    if (varMatch) {
      const varName = varMatch[1]
      for (const [form, keywords] of Object.entries(FORM_KEYWORDS)) {
        for (const kw of keywords) {
          if (varName === kw.toLowerCase()) {
            return { form, form_ru: FORM_RU[form] }
          }
        }
      }
    }
  }

  // 3. Check species name (e.g., pumila → dwarf, horizontalis → spreading)
  if (species) {
    const speciesLower = species.toLowerCase()
    const form = SPECIES_FORM[speciesLower]
    if (form) {
      return { form, form_ru: FORM_RU[form] }
    }
  }

  return { form: null, form_ru: null }
}

// ── Color parsing from cultivar name ─────────────────────────

const COLOR_KEYWORDS: Record<string, string[]> = {
  blue: ['Glauca', 'Blue', 'Azurea', 'Coerulea', 'Caerulea', 'Hoopsii'],
  gold: ['Aurea', 'Gold', 'Golden', 'Lutea', 'Flavescens', 'Yellow', 'Sunshine'],
  silver: ['Argentea', 'Silver', 'Alba', 'White', 'Albospica'],
  red: ['Rubra', 'Red', 'Purpurea', 'Crimson'],
  variegated: ['Variegata', 'Bicolor', 'Tricolor', 'Marginata'],
}

const COLOR_RU: Record<string, string> = {
  blue: 'Голубая',
  gold: 'Золотистая',
  silver: 'Серебристая',
  red: 'Красная',
  variegated: 'Пёстрая',
}

function parseColor(cultivar: string, species?: string): { color: string | null; color_ru: string | null } {
  if (!cultivar) return { color: null, color_ru: null }
  const lower = cultivar.toLowerCase()
  const speciesLower = (species || '').toLowerCase()
  for (const [color, keywords] of Object.entries(COLOR_KEYWORDS)) {
    for (const kw of keywords) {
      const kwLower = kw.toLowerCase()
      if (!lower.includes(kwLower)) continue
      // Skip if the keyword matches the species name (e.g. species=glauca, cultivar somehow contains "glauca")
      // But allow if cultivar has OTHER color indicators too (e.g. "Glauca Compacta" for species=peuce is fine)
      if (kwLower === speciesLower && lower === speciesLower) continue
      return { color, color_ru: COLOR_RU[color] }
    }
  }
  return { color: null, color_ru: null }
}

// ── Region normalization (202 → ~25 canonical) ──────────────

const REGION_RULES: [string, RegExp[]][] = [
  ['Московская область', [/москов/i, /^мо[, ]/i, /^мо$/i, /черноголовк/i, /химк/i, /щёлков/i, /раменск/i, /чехов/i, /лотошин/i, /сергиев/i, /орехов/i, /подольск/i, /наро/i, /шахов/i, /клин/i, /горьков/i]],
  ['Ленинградская область', [/ленинград/i, /^ло[, ]/i, /петербург/i, /гатчин/i, /тоснен/i, /всеволож/i, /лужск/i, /лисино/i]],
  ['Пермский край', [/перм/i, /чайковск/i, /чусов/i]],
  ['Свердловская область', [/екатеринбург/i, /свердлов/i]],
  ['Урал', [/урал/i]],
  ['Челябинская область', [/челябинск/i, /миасс/i, /чебаркул/i]],
  ['Томская область', [/томск/i, /курлек/i]],
  ['Новосибирская область', [/новосибирск/i]],
  ['Омская область', [/^омск/i, /г\.\s?омск/i]],
  ['Иркутская область', [/иркутск/i]],
  ['Ростовская область', [/ростов/i, /батайск/i, /тарасов/i]],
  ['Калининградская область', [/калининград/i]],
  ['Тульская область', [/тульск/i, /заокск/i]],
  ['Калужская область', [/калужск/i, /жуковск/i]],
  ['Владимирская область', [/владимир/i, /кольчугин/i, /покров/i, /александров/i]],
  ['Ярославская область', [/ярославск/i]],
  ['Тверская область', [/тверск/i, /вышневолоц/i]],
  ['Нижегородская область', [/нижегород/i]],
  ['Краснодарский край', [/краснодар/i, /курганин/i]],
  ['Ставропольский край', [/ставропол/i, /пятигорск/i]],
  ['Воронежская область', [/воронеж/i]],
  ['Белгородская область', [/белгород/i]],
  ['Красноярский край', [/красноярск/i, /назаров/i]],
  ['Тамбовская область', [/тамбов/i]],
  ['Курская область', [/курск/i]],
  ['Смоленская область', [/смоленск/i, /дорогобуж/i]],
  ['Республика Татарстан', [/татарстан/i]],
  ['Республика Марий Эл', [/марий/i]],
  ['Псковская область', [/псков/i]],
  ['Беларусь', [/беларус/i, /минск/i, /радошкович/i]],
  ['Крым', [/крым/i]],
  ['Хабаровский край', [/хабаровск/i, /комсомольск/i, /амурск/i]],
  ['Приморский край', [/приморск/i, /раздольн/i, /владивосток/i]],
  ['Сахалинская область', [/сахалин/i]],
  ['Республика Адыгея', [/адыге/i, /кошехабл/i]],
  ['ДНР', [/донецк/i, /днр/i]],
  ['Республика Башкортостан', [/башкорт/i, /уфа/i]],
  ['Кировская область', [/киров/i]],
  ['Восточная Сибирь', [/сибир/i]],
  ['Алтайский край', [/алтай/i]],
]

async function normalizeRegion(region: string): Promise<{ normalized: string; district: string }> {
  if (!region) return { normalized: '', district: '' }

  // Noise words that are not real districts (macro-regions, duplicates of the region itself)
  const DISTRICT_NOISE = /^(западная сибирь|восточная сибирь|сибирь|урал|поволжье|дальний восток|центральная россия|юг россии)$/i

  for (const [canonical, patterns] of REGION_RULES) {
    for (const pat of patterns) {
      if (pat.test(region)) {
        const parts = region.split(',').map(s => s.trim())
        let district = parts.length > 1 ? parts.slice(1).join(', ').replace(/\.$/, '').trim() : ''
        // Strip noise: macro-regions and duplicates of canonical name
        if (DISTRICT_NOISE.test(district) || district.toLowerCase() === canonical.toLowerCase()) {
          district = ''
        }
        // If no meaningful district, ask AI to fill it in
        if (!district) {
          const aiResult = await resolveRegionWithAI(region)
          if (aiResult?.district) district = aiResult.district
        }
        return { normalized: canonical, district }
      }
    }
  }

  // Fallback: ask AI to determine the region + district
  const aiResult = await resolveRegionWithAI(region)
  if (aiResult && aiResult.region) {
    return { normalized: aiResult.region, district: aiResult.district }
  }

  return { normalized: region.replace(/\.$/, '').trim(), district: '' }
}

// ── Hardiness zones (by normalized region) ───────────────────

const HARDINESS_MAP: Record<string, number> = {
  'Томская область': 2,
  'Новосибирская область': 2,
  'Омская область': 2,
  'Иркутская область': 2,
  'Восточная Сибирь': 2,
  'Красноярский край': 2,
  'Алтайский край': 3,
  'Хабаровский край': 3,
  'Сахалинская область': 3,
  'Приморский край': 3,
  'Пермский край': 3,
  'Свердловская область': 3,
  'Урал': 3,
  'Челябинская область': 3,
  'Кировская область': 3,
  'Республика Башкортостан': 3,
  'Московская область': 4,
  'Ленинградская область': 4,
  'Тверская область': 4,
  'Ярославская область': 4,
  'Нижегородская область': 4,
  'Владимирская область': 4,
  'Калужская область': 4,
  'Тульская область': 4,
  'Смоленская область': 4,
  'Псковская область': 4,
  'Калининградская область': 5,
  'Республика Татарстан': 4,
  'Республика Марий Эл': 4,
  'Тамбовская область': 4,
  'Курская область': 5,
  'Белгородская область': 5,
  'Воронежская область': 5,
  'Ростовская область': 5,
  'Беларусь': 5,
  'ДНР': 5,
  'Краснодарский край': 6,
  'Ставропольский край': 6,
  'Республика Адыгея': 6,
  'Крым': 7,
}

const HARDINESS_LABELS: Record<number, string> = {
  2: 'Очень зимостойкое (до −45°C)',
  3: 'Зимостойкое (до −40°C)',
  4: 'Умеренно зимостойкое (до −34°C)',
  5: 'Относительно зимостойкое (до −29°C)',
  6: 'Умеренно теплолюбивое (до −23°C)',
  7: 'Теплолюбивое (до −18°C)',
}

// ── Garden name deduplication ─────────────────────────────────

const GARDEN_ALIASES: Record<string, string> = {
  // Underscore → CamelCase
  'Сад_Александра': 'СадАлександра',
  'Сад_Ангелины_Жидковой': 'СадАнгелиныЖидковой',
  'Сад_Ольги_Семыкиной': 'СадОльгиСемыкиной',
  // Опечатки / варианты написания
  'СадАнгелиныЖидовой': 'СадАнгелиныЖидковой',
  'СадAvalongar_Den': 'Avalongarden',
  'СадAvalongarDen': 'Avalongarden',
  // ё → е
  'СадАлёныПлахт': 'СадАленыПлахт',
  // Порядок ФИО
  'СадФиличкинойИрины': 'СадИриныФиличкиной',
  // Частные сады (анонимные) → одна рубрика
  'ЧастныйСадЛО': 'ЧастныйСад',
  'ЧастныйСадМО': 'ЧастныйСад',
  'ЧастныйСадТатарстан': 'ЧастныйСад',
  'ЧастныйсадТатарстан': 'ЧастныйСад',
  'ЧастныйСадВоронеж': 'ЧастныйСад',
  'ЧастныйСадИркутск': 'ЧастныйСад',
  'ЧастныйСадКиров': 'ЧастныйСад',
  'ЧастныйСадКрасноярск': 'ЧастныйСад',
  'ЧастныйСадАлтай': 'ЧастныйСад',
  'ЧастныйСадНГО': 'ЧастныйСад',
  'ЧастныйсадХабаровск': 'ЧастныйСад',
}

function normalizeGarden(garden: string): string {
  return GARDEN_ALIASES[garden] || garden
}

// ── Garden name parsing (CamelCase → human-readable) ─────────

function parseGarden(garden: string): { display: string; type: string; type_ru: string } {
  if (!garden) return { display: '', type: 'unknown', type_ru: 'Неизвестно' }

  // Объединённая рубрика "Частные сады"
  if (garden === 'ЧастныйСад') {
    return { display: 'Частные сады', type: 'private', type_ru: 'Частный сад' }
  }

  let type = 'garden'
  let type_ru = 'Частный сад'

  if (garden.startsWith('Питомник')) {
    type = 'nursery'
    type_ru = 'Питомник'
  } else if (garden.startsWith('Альпинарий')) {
    type = 'alpine'
    type_ru = 'Альпинарий'
  } else if (garden.startsWith('Лес')) {
    type = 'forest'
    type_ru = 'Лесная коллекция'
  } else if (garden.startsWith('Коллекция')) {
    type = 'collection'
    type_ru = 'Коллекция'
  }

  // Break CamelCase into words
  let display = garden
    .replace(/^Сад_?/, 'Сад ')
    .replace(/^Питомник_?/, 'Питомник ')
    .replace(/^Коллекция_?/, 'Коллекция ')
    .replace(/^Альпинарий_?/, 'Альпинарий ')
    .replace(/^Лес_?/, 'Лес ')
    .replace(/^Частный[Сс]ад_?/, 'Частный сад ')
    .replace(/([а-яё])([А-ЯЁ])/g, '$1 $2')
    // Английские имена: разбиваем CamelCase и суффикс "garden"
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/(\w)garden$/i, '$1 Garden')
    .replace(/_/g, ' ')
    .replace(/  +/g, ' ')
    .trim()

  return { display, type, type_ru }
}

// ── Age parsing ──────────────────────────────────────────────

function parseAge(age: string): { min: number | null; max: number | null; display: string } {
  if (!age) return { min: null, max: null, display: '' }

  // Clean up
  let cleaned = age
    .replace(/^Возраст:?\s*/i, '')
    .replace(/прим\.?\s*/i, '~')
    .replace(/примерно\s*/i, '~')
    .replace(/около\s*/i, '~')
    .replace(/\.$/, '')
    .trim()

  // Extract numbers
  const match = cleaned.match(/(\d+)\s*[-–—]\s*(\d+)/)
  if (match) {
    const min = parseInt(match[1])
    const max = parseInt(match[2])
    return { min, max, display: `${min}–${max} лет` }
  }

  const single = cleaned.match(/(\d+)\+?\s*(?:лет|год|года)/)
  if (single) {
    const n = parseInt(single[1])
    return { min: n, max: n, display: `${n} лет` }
  }

  return { min: null, max: null, display: cleaned }
}

// ── Cultivar re-extraction from latin_full ───────────────────
// Handles apostrophes in names like "Filip's Blue Compact"
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

// ── Species name enrichment ──────────────────────────────────

function enrichSpecies(plant: RawPlant): { species_full: string; species_ru: string; cultivar_ru: string } {
  const species_full = plant.species
    ? `${plant.genus} ${plant.species}`
    : plant.genus

  const nameRu = plant.name_ru || plant.genus_ru || ''

  // Extract Russian cultivar from quotes (e.g. "Ель сибирская 'Красна Девица'" → "Красна Девица")
  const cultivarMatch = nameRu.match(/[\u2018\u2019\u201C\u201D'"`]([^\u2018\u2019\u201C\u201D'"`]+)[\u2018\u2019\u201C\u201D'"`]/)
  const cultivar_ru = cultivarMatch ? cultivarMatch[1].trim() : ''

  // Remove cultivar names in any quotes to get clean species_ru
  let species_ru = nameRu
    .replace(/[\u2018\u2019\u201C\u201D'"`][^\u2018\u2019\u201C\u201D'"`]+[\u2018\u2019\u201C\u201D'"`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  return { species_full, species_ru, cultivar_ru }
}

// ── Main enrichment ──────────────────────────────────────────

async function enrich() {
  console.log('📖 Reading raw data...')
  const catalog: RawPlant[] = JSON.parse(readFileSync(resolve(RAW_DIR, 'catalog.json'), 'utf-8'))
  const genera = JSON.parse(readFileSync(resolve(RAW_DIR, 'genera.json'), 'utf-8'))

  console.log(`  Found ${catalog.length} plants, ${genera.length} genera`)

  // Fix cultivar names: re-extract from latin_full (handles apostrophes like Filip's)
  let fixedCv = 0
  for (const plant of catalog) {
    const cv = extractCultivar(plant.latin_full)
    if (cv && cv !== plant.cultivar) {
      plant.cultivar = cv
      fixedCv++
    }
  }
  if (fixedCv > 0) console.log(`  Fixed ${fixedCv} cultivar names from latin_full`)

  // ── Species typo corrections ──────────────────────────────
  const SPECIES_CORRECTIONS: Record<string, string> = {
    'engelmanii': 'engelmannii',
  }
  let fixedSpecies = 0
  for (const plant of catalog) {
    const wrong = plant.species
    const corrected = SPECIES_CORRECTIONS[wrong]
    if (corrected) {
      plant.species = corrected
      plant.latin_full = plant.latin_full.replace(wrong, corrected)
      fixedSpecies++
    }
  }
  if (fixedSpecies > 0) console.log(`  Fixed ${fixedSpecies} species typos`)

  console.log('🔧 Enriching data...')

  const formCounts: Record<string, number> = {}
  const colorCounts: Record<string, number> = {}
  const regionCounts: Record<string, number> = {}
  const hardinessCounts: Record<number, number> = {}
  const gardenTypeCounts: Record<string, number> = {}
  const speciesCounts: Record<string, Record<string, { ruVotes: Record<string, number>; count: number }>> = {}

  // Assign stable IDs based on content hash (survives re-syncs)
  // Uses _site_id from raw catalog if available (persists across edits)
  function stableId(p: RawPlant): number {
    const key = `${p.latin_full}|${p.garden}|${p.date}|${(p.photos[0] || '')}`
    const hash = createHash('md5').update(key).digest()
    // Use first 4 bytes as unsigned 32-bit int, cap to safe range
    return hash.readUInt32BE(0) % 10_000_000
  }

  // Generate stable IDs, handle collisions
  // Reuse _site_id if already assigned (survives field edits)
  const usedIds = new Set<number>()
  // First pass: reserve all existing _site_id values
  for (const plant of catalog) {
    if ((plant as any)._site_id) usedIds.add((plant as any)._site_id)
  }
  // Second pass: assign IDs
  let newlyAssigned = 0
  for (const plant of catalog) {
    if ((plant as any)._site_id) {
      plant.id = (plant as any)._site_id
    } else {
      let id = stableId(plant)
      while (usedIds.has(id)) id++
      usedIds.add(id)
      plant.id = id;
      (plant as any)._site_id = id
      newlyAssigned++
    }
  }
  // Write back _site_id to raw catalog for persistence
  if (newlyAssigned > 0) {
    writeFileSync(resolve(RAW_DIR, 'catalog.json'), JSON.stringify(catalog))
    console.log(`  Persisted ${newlyAssigned} new _site_id values to raw catalog`)
  }
  console.log(`  Assigned ${catalog.length} stable IDs (${newlyAssigned} new)`)

  // ── Region auto-correction: fix outliers for named gardens ──
  // For each named garden, if 90%+ entries have one region, override the rest
  const gardenRegionVotes: Record<string, Record<string, number>> = {}
  for (const plant of catalog) {
    const g = normalizeGarden(plant.garden)
    if (!g || g === 'ЧастныйСад') continue
    const { normalized } = await normalizeRegion(plant.region)
    if (!normalized) continue
    if (!gardenRegionVotes[g]) gardenRegionVotes[g] = {}
    gardenRegionVotes[g][normalized] = (gardenRegionVotes[g][normalized] || 0) + 1
  }
  let regionFixed = 0
  for (const plant of catalog) {
    const g = normalizeGarden(plant.garden)
    if (!g || g === 'ЧастныйСад') continue
    const votes = gardenRegionVotes[g]
    if (!votes) continue
    const total = Object.values(votes).reduce((a, b) => a + b, 0)
    if (total < 5) continue
    const sorted = Object.entries(votes).sort((a, b) => b[1] - a[1])
    const [topRegion, topCount] = sorted[0]
    if (topCount / total < 0.9) continue
    const { normalized } = await normalizeRegion(plant.region)
    if (normalized && normalized !== topRegion) {
      plant.region = topRegion
      regionFixed++
    }
  }
  if (regionFixed > 0) console.log(`  Fixed ${regionFixed} outlier regions by garden majority vote`)

  const enriched: EnrichedPlant[] = []
  for (const plant of catalog) {
    const { form, form_ru } = parseForm(plant.cultivar, plant.species, plant.latin_full)
    const { color, color_ru } = parseColor(plant.cultivar, plant.species)
    const { normalized: region_normalized, district: region_district } = await normalizeRegion(plant.region)
    const hardiness_zone = HARDINESS_MAP[region_normalized] ?? null
    const hardiness_label = hardiness_zone ? HARDINESS_LABELS[hardiness_zone] : ''
    // Normalize garden name (dedup aliases, fix typos)
    const gardenNormalized = normalizeGarden(plant.garden)
    const { display: garden_display, type: garden_type, type_ru: garden_type_ru } = parseGarden(gardenNormalized)
    const { min: age_min, max: age_max, display: age_display } = parseAge(plant.age)
    const size_display = (plant.size || '').replace(/\.$/, '').trim()
    const { species_full, species_ru, cultivar_ru } = enrichSpecies(plant)

    const is_russian_enriched = plant.is_russian ||
      plant.hashtags.includes('Российский_сорт') ||
      plant.hashtags.includes('Белорусский_сорт')

    // Count for filters
    if (form) formCounts[form] = (formCounts[form] || 0) + 1
    if (color) colorCounts[color] = (colorCounts[color] || 0) + 1
    if (region_normalized) regionCounts[region_normalized] = (regionCounts[region_normalized] || 0) + 1
    if (hardiness_zone) hardinessCounts[hardiness_zone] = (hardinessCounts[hardiness_zone] || 0) + 1
    if (garden_type !== 'unknown') gardenTypeCounts[garden_type] = (gardenTypeCounts[garden_type] || 0) + 1

    // Species per genus — vote for the most common Russian name (cleanest wins)
    if (plant.genus && plant.species) {
      if (!speciesCounts[plant.genus]) speciesCounts[plant.genus] = {}
      const key = plant.species
      if (!speciesCounts[plant.genus][key]) {
        speciesCounts[plant.genus][key] = { ruVotes: {}, genusRu: plant.genus_ru, count: 0 }
      }
      // Only vote names that start with the genus in Russian (skip garbage like "Омск...")
      if (species_ru.startsWith(plant.genus_ru)) {
        speciesCounts[plant.genus][key].ruVotes[species_ru] = (speciesCounts[plant.genus][key].ruVotes[species_ru] || 0) + 1
      }
      speciesCounts[plant.genus][key].count++
    }

    enriched.push({
      ...plant,
      garden: gardenNormalized,
      species_full,
      species_ru,
      cultivar_ru,
      form,
      form_ru,
      color,
      color_ru,
      region_normalized,
      region_district,
      hardiness_zone,
      hardiness_label,
      garden_display,
      garden_type,
      garden_type_ru,
      age_min,
      age_max,
      age_display,
      size_display,
      is_russian_enriched,
      is_new: plant.is_new || false,
    })
  }

  // Rebuild genera index from actual catalog data (picks up new genera/counts automatically)
  const generaFromCatalog = new Map<string, { genus: string; genus_ru: string; count: number; cover_thumb: string; species: Set<string> }>()
  for (const p of enriched) {
    const existing = generaFromCatalog.get(p.genus)
    if (existing) {
      existing.count++
      if (p.species) existing.species.add(p.species)
    } else {
      // Try to find cover_thumb from old genera.json, fallback to first plant's thumb
      const oldGenus = genera.find((g: any) => g.genus === p.genus)
      generaFromCatalog.set(p.genus, {
        genus: p.genus,
        genus_ru: p.genus_ru,
        count: 1,
        cover_thumb: oldGenus?.cover_thumb || p.thumbs?.[0] || '',
        species: new Set(p.species ? [p.species] : []),
      })
    }
  }

  // Also update raw genera.json so it stays in sync
  const generaJsonUpdated = [...generaFromCatalog.values()]
    .sort((a, b) => b.count - a.count)
    .map(g => ({
      genus: g.genus,
      genus_ru: g.genus_ru,
      count: g.count,
      species: [...g.species].sort(),
      cover_thumb: g.cover_thumb,
    }))
  writeFileSync(resolve(RAW_DIR, 'genera.json'), JSON.stringify(generaJsonUpdated, null, 2))

  // Build enriched filters
  const filtersEnriched = {
    genera: generaJsonUpdated.map(g => ({
      value: g.genus,
      label: g.genus_ru,
      count: g.count,
      cover_thumb: g.cover_thumb,
    })),

    species: Object.fromEntries(
      Object.entries(speciesCounts).map(([genus, species]) => [
        genus,
        Object.entries(species)
          .map(([value, { ruVotes, count }]) => {
            // Pick the most common Russian name; on tie, prefer shortest (least garbage)
            const votes = Object.entries(ruVotes)
              .sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)
            let ru = votes.length > 0 ? votes[0][0] : value
            // Strip parenthetical notes like "(гибрид ели черной и...)"
            ru = ru.replace(/\s*\([^)]*\)\s*/g, ' ').trim()
            // Strip trailing location names (match against region rules)
            for (const [, patterns] of REGION_RULES) {
              for (const pat of patterns) {
                ru = ru.replace(new RegExp('\\s+' + pat.source + '$', pat.flags), '').trim()
              }
            }
            const latin = `${genus} ${value}`
            return { value, label: ru, latin, count }
          })
          .sort((a, b) => b.count - a.count),
      ])
    ),

    forms: Object.entries(FORM_RU)
      .map(([value, label]) => ({ value, label, count: formCounts[value] || 0 }))
      .filter(f => f.count > 0)
      .sort((a, b) => b.count - a.count),

    colors: [
      { value: 'blue', label: 'Голубая', swatch: '#6BA4C9', count: colorCounts['blue'] || 0 },
      { value: 'gold', label: 'Золотистая', swatch: '#D4A843', count: colorCounts['gold'] || 0 },
      { value: 'silver', label: 'Серебристая', swatch: '#C0C0C0', count: colorCounts['silver'] || 0 },
      { value: 'red', label: 'Красная', swatch: '#CC4444', count: colorCounts['red'] || 0 },
      { value: 'variegated', label: 'Пёстрая', swatch: null, count: colorCounts['variegated'] || 0 },
    ].filter(c => c.count > 0),

    hardiness: Object.entries(HARDINESS_LABELS)
      .map(([zone, label]) => ({
        value: parseInt(zone),
        label: `Зона ${zone} — ${label}`,
        count: hardinessCounts[parseInt(zone)] || 0,
      }))
      .filter(h => h.count > 0)
      .sort((a, b) => a.value - b.value),

    regions: Object.entries(regionCounts)
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count),

    gardenTypes: [
      { value: 'garden', label: 'Частный сад', count: gardenTypeCounts['garden'] || 0 },
      { value: 'nursery', label: 'Питомник', count: gardenTypeCounts['nursery'] || 0 },
      { value: 'alpine', label: 'Альпинарий', count: gardenTypeCounts['alpine'] || 0 },
      { value: 'collection', label: 'Коллекция', count: gardenTypeCounts['collection'] || 0 },
      { value: 'forest', label: 'Лесная коллекция', count: gardenTypeCounts['forest'] || 0 },
      { value: 'private', label: 'Частный сад (региональный)', count: gardenTypeCounts['private'] || 0 },
    ].filter(g => g.count > 0),

    ageRanges: [
      { value: '1-3', label: '1–3 года (молодое)', count: enriched.filter(p => p.age_min !== null && p.age_min >= 1 && p.age_max !== null && p.age_max <= 3).length },
      { value: '4-7', label: '4–7 лет', count: enriched.filter(p => p.age_min !== null && p.age_min >= 4 && p.age_max !== null && p.age_max <= 7).length },
      { value: '8-12', label: '8–12 лет (взрослое)', count: enriched.filter(p => p.age_min !== null && p.age_min >= 8 && p.age_max !== null && p.age_max <= 12).length },
      { value: '13+', label: '13+ лет (крупномер)', count: enriched.filter(p => p.age_min !== null && p.age_min >= 13).length },
    ],

    russianCount: enriched.filter(p => p.is_russian_enriched).length,
  }

  // Write output
  console.log('💾 Writing enriched data...')
  writeFileSync(resolve(OUT_DIR, 'catalog-enriched.json'), JSON.stringify(enriched, null, 0))
  writeFileSync(resolve(OUT_DIR, 'filters-enriched.json'), JSON.stringify(filtersEnriched, null, 2))

  // Sync to public/data/ and .output/public/data/ so API and SSR always serve the same file
  for (const dir of ['public/data', '.output/public/data']) {
    const target = resolve(ROOT, dir)
    if (!existsSync(target)) mkdirSync(target, { recursive: true })
    copyFileSync(resolve(OUT_DIR, 'catalog-enriched.json'), resolve(target, 'catalog-enriched.json'))
    copyFileSync(resolve(OUT_DIR, 'filters-enriched.json'), resolve(target, 'filters-enriched.json'))
  }
  console.log('  Synced to public/data/ and .output/public/data/')

  // Stats
  console.log('\n📊 Enrichment stats:')
  console.log(`  Forms detected: ${Object.values(formCounts).reduce((a, b) => a + b, 0)} plants`)
  Object.entries(formCounts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`    ${FORM_RU[k]}: ${v}`))
  console.log(`  Colors detected: ${Object.values(colorCounts).reduce((a, b) => a + b, 0)} plants`)
  Object.entries(colorCounts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`    ${COLOR_RU[k]}: ${v}`))
  console.log(`  Regions normalized: ${Object.keys(regionCounts).length} canonical from 202 raw`)
  console.log(`  Russian varieties: ${filtersEnriched.russianCount} (was ${catalog.filter(p => p.is_russian).length})`)
  console.log(`  Age parsed: ${enriched.filter(p => p.age_min !== null).length} / ${catalog.length}`)
  console.log('\n✅ Done!')
}

enrich().catch(e => { console.error(e); process.exit(1) })
