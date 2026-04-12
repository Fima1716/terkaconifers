import { readFileSync, existsSync } from 'fs'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const period = (query.period as string) || 'today'

  const now = Date.now()
  let fromTs: number
  switch (period) {
    case 'week': fromTs = now - 7 * 86400_000; break
    case 'month': fromTs = now - 30 * 86400_000; break
    case 'all': fromTs = 0; break
    default: {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      fromTs = d.getTime()
    }
  }

  const statsFile = resolveStatsFile()
  if (!statsFile) {
    return emptyStats(fromTs, now)
  }

  const events = readAllEvents(statsFile, fromTs, now)
  return aggregate(events, fromTs, now)
})

function resolveStatsFile(): string | null {
  const paths = [
    '/var/www/rusadovich/data/bot-stats.jsonl',
    process.cwd() + '/rusinovich/data/bot-stats.jsonl',
  ]
  for (const p of paths) {
    if (existsSync(p)) return p
  }
  return null
}

interface BotEvent {
  ts: number
  platform: string
  userId: string
  userName?: string
  type: string
  query?: string
  queryType?: string
  response?: string
  responseLen?: number
  latencyMs?: number
  catalogHits?: number
  searchQuery?: string
  catalogMatches?: string[]
  stockCategory?: string
  error?: string
}

function readAllEvents(basePath: string, fromTs: number, toTs: number): BotEvent[] {
  const events: BotEvent[] = []
  const files = [basePath + '.old', basePath]
  for (const f of files) {
    if (!existsSync(f)) continue
    try {
      const lines = readFileSync(f, 'utf-8').split('\n').filter(l => l.trim())
      for (const line of lines) {
        try {
          const ev = JSON.parse(line) as BotEvent
          if (ev.ts < fromTs || ev.ts > toTs) continue
          events.push(ev)
        } catch {}
      }
    } catch {}
  }
  return events
}

// ── Intent clustering ──────────────
const INTENT_PATTERNS: [string, RegExp[]][] = [
  ['Наличие / В продаже', [
    /в наличии/i, /можно купить/i, /есть .*в продаже/i, /что есть/i, /что сейчас/i,
    /доступн/i, /есть ли/i, /есть у вас/i, /можно ли купить/i, /покажи.*ассортимент/i,
  ]],
  ['Цена / Стоимость', [
    /сколько стоит/i, /цена/i, /стоимость/i, /почем/i, /прайс/i, /расценк/i,
  ]],
  ['Доставка', [
    /доставк/i, /доставляете/i, /привезти/i, /привоз/i, /отправ/i, /транспорт/i,
    /самовывоз/i, /забрать/i, /курьер/i, /сдек/i, /почт/i,
  ]],
  ['Посадка / Уход', [
    /как.*сажать/i, /посадк/i, /как.*ухаживать/i, /уход/i, /полив/i, /удобрен/i,
    /обрезк/i, /зимов/i, /укрыт/i, /болезн/i, /вредител/i, /почв/i, /грунт/i,
    /мульч/i, /подкорм/i, /пересад/i,
  ]],
  ['Выбор / Рекомендация', [
    /посоветуй/i, /что выбрать/i, /что лучше/i, /подскаж/i, /порекоменд/i,
    /какой сорт/i, /что подойдет/i, /что подойдёт/i, /для.*участк/i, /для.*сад/i,
    /невысок/i, /карликов/i, /быстрорастущ/i, /морозостойк/i,
  ]],
  ['Заказ / Покупка', [
    /как заказать/i, /оформить заказ/i, /хочу купить/i, /хочу заказать/i,
    /оплат/i, /способ.*оплат/i, /карт/i, /перевод/i,
  ]],
  ['Контакты / Связь', [
    /телефон/i, /адрес/i, /как связаться/i, /где.*находит/i, /контакт/i,
    /позвонить/i, /написать/i, /время работ/i, /график/i,
  ]],
  ['О питомнике', [
    /кто вы/i, /что за питомник/i, /расскаж.*о.*питомник/i, /сколько.*лет/i,
    /откуда.*растени/i, /чем.*занимаетесь/i, /история/i,
  ]],
]

function classifyIntent(text: string): string {
  for (const [label, patterns] of INTENT_PATTERNS) {
    if (patterns.some(p => p.test(text))) return label
  }
  return 'Прочее'
}

// ── Plant extraction from raw query text ──
const PLANT_GENUS_MAP: [RegExp, string][] = [
  [/ел[ьией]|ёлк|елк|елок|picea/i, 'Ель'],
  [/сосн|pinus|кедр/i, 'Сосна'],
  [/ту[яиюйе]|thuja/i, 'Туя'],
  [/можжевельник|juniperus/i, 'Можжевельник'],
  [/пихт|abies/i, 'Пихта'],
  [/лиственниц|larix/i, 'Лиственница'],
  [/микробиот/i, 'Микробиота'],
  [/кипарисовик/i, 'Кипарисовик'],
  [/бересклет/i, 'Бересклет'],
  [/ив[аыу]\b/i, 'Ива'],
  [/клен|клён/i, 'Клён'],
  [/гинкго/i, 'Гинкго'],
  [/тсуг/i, 'Тсуга'],
]

function extractPlantGenus(text: string): string | null {
  for (const [re, genus] of PLANT_GENUS_MAP) {
    if (re.test(text)) return genus
  }
  return null
}

// Extract cultivar name: look for Latin/capitalized words after genus mention
function extractCultivar(text: string): string | null {
  // Match patterns like "ель Коника", "туя Смарагд", "сосна Мопс"
  const m = text.match(/(?:ель|сосна|туя|можжевельник|пихта|лиственница|микробиота|кипарисовик|бересклет|ива|клен|клён)\s+(\p{Lu}\p{Ll}+(?:\s+\p{Lu}\p{Ll}+)?)/u)
  if (m) return m[1]
  // Latin cultivar
  const latin = text.match(/(?:picea|pinus|thuja|juniperus|abies|larix)\s+(\w+(?:\s+\w+)?)/i)
  if (latin) return latin[1]
  return null
}

function extractPlantMention(text: string): string | null {
  const genus = extractPlantGenus(text)
  if (!genus) return null
  const cultivar = extractCultivar(text)
  if (cultivar) return `${genus} ${cultivar}`
  return genus
}

// ── Satisfaction detection ──
function detectSatisfaction(text: string): 'positive' | 'negative' | null {
  const lower = text.toLowerCase()
  if (/спасибо|благодар|отлично|супер|класс|здорово|понятно|ясно|хорошо/i.test(lower)) return 'positive'
  if (/не помог|бесполезн|ерунд|чушь|плох|не то|не так|неправильно|ошибк/i.test(lower)) return 'negative'
  return null
}

function aggregate(events: BotEvent[], fromTs: number, toTs: number) {
  const messages = events.filter(e => e.type === 'message')
  const errors = events.filter(e => e.type === 'error')
  const allUserKeys = new Set(events.filter(e => e.userId).map(e => `${e.platform}_${e.userId}`))

  // ── Basic by-platform ──
  const byPlatform: Record<string, { messages: number; errors: number; users: Set<string>; lastActivity: number }> = {}
  for (const p of ['max', 'tg', 'vk']) {
    byPlatform[p] = { messages: 0, errors: 0, users: new Set(), lastActivity: 0 }
  }
  for (const ev of events) {
    const bp = byPlatform[ev.platform]
    if (!bp) continue
    if (ev.type === 'message') bp.messages++
    if (ev.type === 'error') bp.errors++
    if (ev.userId) bp.users.add(ev.userId)
    if (ev.ts > bp.lastActivity) bp.lastActivity = ev.ts
  }

  // ── Query types ──
  const queryTypes: Record<string, number> = {}
  for (const m of messages) {
    const qt = m.queryType || 'conversation'
    queryTypes[qt] = (queryTypes[qt] || 0) + 1
  }

  // ── Hourly distribution ──
  const hourly: Record<string, number> = {}
  for (const m of messages) {
    const h = new Date(m.ts).getHours().toString().padStart(2, '0')
    hourly[h] = (hourly[h] || 0) + 1
  }

  // ── Daily activity ──
  const daily: Record<string, number> = {}
  for (const m of messages) {
    const d = new Date(m.ts).toISOString().slice(0, 10)
    daily[d] = (daily[d] || 0) + 1
  }

  // ── Average latency ──
  const latencies = messages.filter(m => m.latencyMs).map(m => m.latencyMs!)
  const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0

  // ══════════════════════════════
  // ── RICH ANALYTICS ──
  // ══════════════════════════════

  // ── 1. Plant interest: what plants people ask about ──
  const plantCounts: Record<string, number> = {}
  const cultivarCounts: Record<string, number> = {}
  for (const m of messages) {
    // Use structured data first (catalogMatches, searchQuery)
    if (m.catalogMatches?.length) {
      for (const name of m.catalogMatches) {
        cultivarCounts[name] = (cultivarCounts[name] || 0) + 1
      }
    }
    if (m.stockCategory) {
      plantCounts[m.stockCategory] = (plantCounts[m.stockCategory] || 0) + 1
    }
    // Also extract from raw query text for broader coverage
    if (m.query) {
      const genus = extractPlantGenus(m.query)
      if (genus) plantCounts[genus] = (plantCounts[genus] || 0) + 1
      const mention = extractPlantMention(m.query)
      if (mention && mention !== genus) {
        cultivarCounts[mention] = (cultivarCounts[mention] || 0) + 1
      }
    }
    if (m.searchQuery) {
      const mention = extractPlantMention(m.searchQuery)
      if (mention) cultivarCounts[mention] = (cultivarCounts[mention] || 0) + 1
    }
  }

  const plantInterest = Object.entries(plantCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }))

  const cultivarInterest = Object.entries(cultivarCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, count]) => ({ name, count }))

  // ── 2. Intent clusters ──
  const intentCounts: Record<string, { count: number; examples: string[] }> = {}
  for (const m of messages) {
    if (!m.query) continue
    const intent = classifyIntent(m.query)
    if (!intentCounts[intent]) intentCounts[intent] = { count: 0, examples: [] }
    intentCounts[intent].count++
    if (intentCounts[intent].examples.length < 3) {
      intentCounts[intent].examples.push(m.query.slice(0, 120))
    }
  }
  const intentClusters = Object.entries(intentCounts)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([intent, data]) => ({ intent, count: data.count, examples: data.examples }))

  // ── 3. Top queries (smarter grouping) ──
  const queryCounts: Record<string, { count: number; variants: Set<string> }> = {}
  for (const m of messages) {
    if (!m.query) continue
    // Normalize: lowercase, strip punctuation, trim
    const normalized = m.query.toLowerCase().replace(/[?!.,;:()«»""]/g, '').replace(/\s+/g, ' ').trim()
    if (!normalized || normalized.length < 3) continue
    // Group very similar queries (same first 40 chars as key)
    const key = normalized.slice(0, 40)
    if (!queryCounts[key]) queryCounts[key] = { count: 0, variants: new Set() }
    queryCounts[key].count++
    if (queryCounts[key].variants.size < 5) {
      queryCounts[key].variants.add(m.query.slice(0, 150))
    }
  }
  const topQueries = Object.entries(queryCounts)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15)
    .map(([, data]) => ({
      query: [...data.variants][0],
      count: data.count,
      variants: [...data.variants],
    }))

  // ── 4. User behavior ──
  const userMessages: Record<string, { count: number; name?: string; platform: string; firstSeen: number; lastSeen: number; satisfied?: boolean }> = {}
  for (const ev of events) {
    if (!ev.userId || ev.type === 'error') continue
    const key = `${ev.platform}_${ev.userId}`
    if (!userMessages[key]) {
      userMessages[key] = { count: 0, name: ev.userName, platform: ev.platform, firstSeen: ev.ts, lastSeen: ev.ts }
    }
    if (ev.type === 'message') userMessages[key].count++
    if (ev.userName) userMessages[key].name = ev.userName
    if (ev.ts < userMessages[key].firstSeen) userMessages[key].firstSeen = ev.ts
    if (ev.ts > userMessages[key].lastSeen) userMessages[key].lastSeen = ev.ts
    // Detect satisfaction from user's last messages
    if (ev.type === 'message' && ev.query) {
      const sat = detectSatisfaction(ev.query)
      if (sat === 'positive') userMessages[key].satisfied = true
      if (sat === 'negative') userMessages[key].satisfied = false
    }
  }

  const users = Object.values(userMessages)
  const activeUsers = users.filter(u => u.count > 0)
  const returningUsers = activeUsers.filter(u => u.count > 1)
  const avgMessagesPerUser = activeUsers.length ? +(activeUsers.reduce((a, u) => a + u.count, 0) / activeUsers.length).toFixed(1) : 0
  const powerUsers = activeUsers
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map(u => ({ name: u.name || u.platform + '_' + 'user', platform: u.platform, messages: u.count }))

  // ── 5. Satisfaction ──
  const satisfiedUsers = users.filter(u => u.satisfied === true).length
  const dissatisfiedUsers = users.filter(u => u.satisfied === false).length

  // ── 6. Category interest (from stock_category queries) ──
  const categoryInterest: Record<string, number> = {}
  for (const m of messages) {
    if (m.stockCategory) {
      categoryInterest[m.stockCategory] = (categoryInterest[m.stockCategory] || 0) + 1
    }
  }

  // ── 7. Catalog hit rate ──
  const productQueries = messages.filter(m => m.queryType === 'product')
  const withHits = productQueries.filter(m => m.catalogHits && m.catalogHits > 0)
  const catalogHitRate = productQueries.length ? Math.round((withHits.length / productQueries.length) * 100) : 0

  // ── Serialize ──
  const byPlatformSerialized: Record<string, any> = {}
  for (const [k, v] of Object.entries(byPlatform)) {
    byPlatformSerialized[k] = {
      messages: v.messages,
      errors: v.errors,
      users: v.users.size,
      lastActivity: v.lastActivity || null,
    }
  }

  return {
    period: { from: new Date(fromTs).toISOString(), to: new Date(toTs).toISOString() },
    totals: { messages: messages.length, errors: errors.length, uniqueUsers: allUserKeys.size },
    byPlatform: byPlatformSerialized,
    queryTypes,
    hourly: Object.entries(hourly).sort((a, b) => a[0].localeCompare(b[0])).map(([hour, count]) => ({ hour, count })),
    daily: Object.entries(daily).sort((a, b) => a[0].localeCompare(b[0])).map(([date, count]) => ({ date, count })),
    topQueries,
    avgLatency,
    // Rich analytics
    plantInterest,
    cultivarInterest,
    intentClusters,
    userBehavior: {
      totalUsers: activeUsers.length,
      returningUsers: returningUsers.length,
      returningPct: activeUsers.length ? Math.round((returningUsers.length / activeUsers.length) * 100) : 0,
      avgMessagesPerUser,
      powerUsers,
    },
    satisfaction: {
      positive: satisfiedUsers,
      negative: dissatisfiedUsers,
      neutral: users.length - satisfiedUsers - dissatisfiedUsers,
    },
    categoryInterest: Object.entries(categoryInterest)
      .sort((a, b) => b[1] - a[1])
      .map(([category, count]) => ({ category, count })),
    catalogHitRate,
  }
}

function emptyStats(fromTs: number, toTs: number) {
  return {
    period: { from: new Date(fromTs).toISOString(), to: new Date(toTs).toISOString() },
    totals: { messages: 0, errors: 0, uniqueUsers: 0 },
    byPlatform: {
      max: { messages: 0, errors: 0, users: 0, lastActivity: null },
      tg: { messages: 0, errors: 0, users: 0, lastActivity: null },
      vk: { messages: 0, errors: 0, users: 0, lastActivity: null },
    },
    queryTypes: {},
    hourly: [],
    daily: [],
    topQueries: [],
    avgLatency: 0,
    plantInterest: [],
    cultivarInterest: [],
    intentClusters: [],
    userBehavior: { totalUsers: 0, returningUsers: 0, returningPct: 0, avgMessagesPerUser: 0, powerUsers: [] },
    satisfaction: { positive: 0, negative: 0, neutral: 0 },
    categoryInterest: [],
    catalogHitRate: 0,
  }
}
