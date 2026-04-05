/**
 * Бот «Леший» — relay-бот для приёма заявок с системой очереди.
 *
 * Флоу:
 * 1. /start → правила + кнопка согласия
 * 2. Пользователь шлёт фото+текст → создаётся заявка, пересылается в админский чат
 * 3. Фото без текста → обновление фото последней заявки (или выбор если несколько)
 * 4. Текст без фото → пересылка как уточнение
 * 5. Админ reply "+" → принято (берёт заявку), AI форматирует, предлагает текст
 * 6. Админ reply "-" → отказ
 * 7. Админ reply текст → ответ пользователю с контекстом заявки
 * 8. /ban /unban /last /удалить — управление
 *
 * Запуск: npx tsx scripts/bot.ts
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { findAllDuplicates, formatDupeWarning, addPublication, parseLatinName, extractGarden, loadPublications, removePublication } from './lib/dupe-check.js'

const ROOT = resolve(import.meta.dirname, '..')
const STATE_FILE = resolve(ROOT, 'data/bot-state.json')

// Load .env file
const env: Record<string, string> = {}
const envPath = resolve(ROOT, '.env')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) env[m[1].trim()] = m[2].trim()
  }
}

const TOKEN = env.MAX_BOT_TOKEN || ''
const ADMIN_CHAT_ID = env.ADMIN_CHAT_ID || '-72548188058297'
const BASE_URL = 'https://platform-api.max.ru'
const AI_KEY = env.DEEPSEEK_API_KEY || env.GROQ_API_KEY || ''

const PROTECTED_CATALOG_ID = '-71324192443065'

if (!TOKEN) { console.error('No MAX_BOT_TOKEN in .env'); process.exit(1) }
if (String(ADMIN_CHAT_ID) === PROTECTED_CATALOG_ID) {
  console.error('ОШИБКА: ADMIN_CHAT_ID указывает на канал «Каталог»! Используйте чат «Корзина Терки» (-72548188058297).')
  process.exit(1)
}

// ── State ──────────────────────────────────────────────────
interface Submission {
  id: number
  origText: string
  origPhotos: string[]
  latestPhotos: string[]
  latestPhotoText: string
  allMids: string[]
  userName: string
  userId: number
  chatId: number
  createdAt: string
}

interface BotState {
  consented: Record<string, boolean>
  banned: Record<string, boolean>
  midMap: Record<string, { userId: number; chatId: number; userName: string; photos?: string[]; submissionId?: number }>
  pendingPublish: Record<string, { photos: string[]; userName: string; aiText?: string; submissionId?: number; submissionUserId?: string }>
  submissions: Record<string, Submission[]>
  submissionCounters: Record<string, number>
  pendingPhotoChoice: Record<string, { photos: string[]; timestamp: number }>
}

function loadState(): BotState {
  if (existsSync(STATE_FILE)) {
    try {
      const s = JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
      return {
        consented: s.consented || {},
        banned: s.banned || {},
        midMap: s.midMap || {},
        pendingPublish: s.pendingPublish || {},
        submissions: s.submissions || {},
        submissionCounters: s.submissionCounters || {},
        pendingPhotoChoice: s.pendingPhotoChoice || {},
      }
    } catch {}
  }
  return { consented: {}, banned: {}, midMap: {}, pendingPublish: {}, submissions: {}, submissionCounters: {}, pendingPhotoChoice: {} }
}

function saveState(s: BotState) {
  const midEntries = Object.entries(s.midMap)
  if (midEntries.length > 1000) s.midMap = Object.fromEntries(midEntries.slice(-1000))
  // Clean stale pending photo choices (older than 24h)
  const now = Date.now()
  for (const [k, v] of Object.entries(s.pendingPhotoChoice)) {
    if (now - v.timestamp > 86400000) delete s.pendingPhotoChoice[k]
  }
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2))
}

const state = loadState()

// ── Submission helpers ────────────────────────────────────
function getSubmissions(userId: number | string): Submission[] {
  return state.submissions[String(userId)] || []
}

function createSubmission(userId: number, chatId: number, userName: string, text: string, photos: string[]): Submission {
  const key = String(userId)
  if (!state.submissionCounters[key]) state.submissionCounters[key] = 0
  state.submissionCounters[key]++
  const sub: Submission = {
    id: state.submissionCounters[key],
    origText: text,
    origPhotos: photos,
    latestPhotos: [],
    latestPhotoText: '',
    allMids: [],
    userName, userId, chatId,
    createdAt: new Date().toISOString(),
  }
  if (!state.submissions[key]) state.submissions[key] = []
  state.submissions[key].push(sub)
  return sub
}

function findSubmissionByMid(userId: number | string, mid: string): Submission | undefined {
  return getSubmissions(userId).find(s => s.allMids.includes(mid))
}

function removeSubmission(userId: number | string, submissionId: number) {
  const key = String(userId)
  if (state.submissions[key]) {
    state.submissions[key] = state.submissions[key].filter(s => s.id !== submissionId)
    if (state.submissions[key].length === 0) delete state.submissions[key]
  }
}

/** Short latin name for display: first line of origText up to first comma/newline */
function submissionShortName(sub: Submission): string {
  const firstLine = sub.origText.split('\n')[0] || ''
  // Try to extract latin name (before comma, before 👤)
  const clean = firstLine.replace(/👤.*$/, '').replace(/#\S+/g, '').trim()
  const short = clean.split(/[,;]/)[0].trim()
  return short.substring(0, 60) || '(без описания)'
}

function subLabel(sub: Submission, total: number): string {
  const name = submissionShortName(sub)
  return total > 1 ? `заявка №${sub.id} (${name})` : `заявка (${name})`
}

function subLabelShort(sub: Submission, total: number): string {
  return total > 1 ? `Заявка №${sub.id}` : 'Заявка'
}

function getSubmissionPhotos(sub: Submission): string[] {
  return sub.latestPhotos.length > 0 ? sub.latestPhotos : sub.origPhotos
}

function getSubmissionTextForAI(sub: Submission, supplementText?: string): string {
  let text = sub.origText
  // Add latest photo text if it has extra info
  if (sub.latestPhotoText && sub.latestPhotoText !== sub.origText) {
    text += `\n\nДополнение от пользователя:\n${sub.latestPhotoText}`
  }
  // Add supplement from the specific message admin replied to
  if (supplementText && supplementText !== sub.origText && supplementText !== sub.latestPhotoText) {
    // Clean up: remove 👤 line and bot metadata
    const cleaned = supplementText.replace(/\n*👤.*$/s, '').trim()
    if (cleaned && cleaned !== sub.origText.replace(/\n*👤.*$/s, '').trim()) {
      text += `\n\nДополнение:\n${cleaned}`
    }
  }
  return text
}

// ── API ────────────────────────────────────────────────────
const H = { Authorization: TOKEN, 'Content-Type': 'application/json' }

async function send(chatId: number | string, text: string, attachments?: any[], replyTo?: string) {
  const body: any = { text }
  if (attachments) body.attachments = attachments
  if (replyTo) body.link = { type: 'reply', mid: replyTo }
  const resp = await fetch(`${BASE_URL}/messages?chat_id=${chatId}`, {
    method: 'POST', headers: H, body: JSON.stringify(body),
  })
  return resp.json()
}

async function answerCallback(cbId: string, note?: string) {
  await fetch(`${BASE_URL}/answers/callback?callback_id=${cbId}`, {
    method: 'POST', headers: H, body: JSON.stringify(note ? { notification: note } : {}),
  })
}

async function deleteMessage(mid: string): Promise<boolean> {
  const resp = await fetch(`${BASE_URL}/messages?message_id=${mid}`, {
    method: 'DELETE', headers: H,
  })
  return resp.ok
}

// Duplicate detection — uses shared lib (catalog + recent publications + pending both bots)

async function formatWithAI(rawText: string): Promise<string | null> {
  if (!AI_KEY) return null
  try {
    const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${AI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 0.1,
        max_tokens: 500,
        messages: [
          {
            role: 'system',
            content: `Ты форматируешь заявку на хвойное растение для канала «Территория хвойных. Каталог».

ФОРМАТ (строго, пустая строка после русского названия):

Genus species 'Cultivar'
Русское название вида

Регион, город
Возраст: X лет
Размер: ... (только если указан)
Оригинатор: ... (только если указан)
Название сада
#Род
#Род_вид
#НазваниеСада

ПРИМЕР ВХОДА:
Pinus mugo Aurus, российский сорт, Русинов сад, возраст 6 лет
👤 Александр Русинов, (#ID19732665)

ПРАВИЛЬНЫЙ ВЫХОД:
Pinus mugo 'Aurus'
Сосна горная

Пермский край, Чайковский
Возраст: 6 лет
Оригинатор: А.Русинов
Русинов Сад
#Сосна
#Сосна_горная
#РусиновСад
#Российский_сорт

ПРАВИЛА:

Латиница:
- Род с большой, вид с маленькой, сорт в одинарных кавычках: Pinus mugo 'Aurus'
- Без сорта — без кавычек: Pinus mugo

Русское название = название ВИДА (не рода!):
- Picea abies → Ель обыкновенная
- Pinus mugo → Сосна горная
- Abies koreana → Пихта корейская
- Picea pungens → Ель колючая

Название сада:
- Пиши как есть, БЕЗ префикса "Название сада:"
- С пробелами, человекочитаемо: "Сад Анжелики Колесник", "Русинов Сад", "Питомник Горошкевича"
- Если в тексте слитно — разбей: СадАнжеликиКолесник → Сад Анжелики Колесник
- Если сад не указан — используй имя автора: "Сад Имени Фамилия"

ОСОБЫЕ САДЫ (используй точное написание):
- Александр Русинов → сад: "Русинов Сад", хештег: #РусиновСад, регион по умолчанию: Пермский край, Чайковский

Хештеги (каждый с новой строки, в конце):
1. #Род — #Ель, #Сосна, #Пихта, #Можжевельник, #Туя, #Лиственница, #Тсуга, #Тис, #Кипарисовик, #Микробиота
2. #Род_вид — #Ель_обыкновенная, #Сосна_горная, #Пихта_корейская, #Туя_западная и т.д.
3. #НазваниеСада — слитно без пробелов, ОБЯЗАТЕЛЬНО с префиксом (Сад, Питомник и т.д.):
   ПРАВИЛЬНО: #СадКозловойНатальи, #СадАнжеликиКолесник, #ПитомникГорошкевича, #РусиновСад
   НЕПРАВИЛЬНО: #КозловойНатальи, #АнжеликиКолесник (нельзя без "Сад"!)
   Если название сада содержит слово "Сад" — оно ДОЛЖНО быть в хештеге. Никогда не выбрасывай "Сад" из хештега.
4. #Российский_сорт — если указано что сорт российский

Оригинатор:
- Если указан оригинатор (автор сорта, селекционер) — добавь строку "Оригинатор: Имя" после размера/возраста
- Оригинатор — это НЕ владелец сада, а автор/селекционер сорта
- Пиши как есть в тексте: "Оригинатор: С.Горошкевич", "Оригинатор: Д.Сивков"

Очистка:
- Удали: 👤, (#IDxxxx), @username, метки бота, "российский сорт" из текста (вынеси в хештег)
- Если данных не хватает — не выдумывай, пиши только то что есть

Отвечай ТОЛЬКО готовым текстом, без пояснений.`
          },
          { role: 'user', content: rawText }
        ],
      }),
    })
    if (!resp.ok) { log(`AI error: ${resp.status}`); return null }
    const data: any = await resp.json()
    return data.choices?.[0]?.message?.content?.trim() || null
  } catch (e) { log(`AI error: ${e}`); return null }
}

// ── Welcome ────────────────────────────────────────────────
function welcomeText(name: string) {
  return `Здравствуйте, ${name}!

Прежде чем отправлять ваши фото, прочитайте правила:

1. Отправляя нам фотографию и сопутствующую информацию, Вы тем самым выражаете свое согласие на их размещение в канале «Территория хвойных. Каталог» и на сайте terkaconifers.ru. Вы также подтверждаете, что данное изображение принадлежит вам, а растения на нем действительно произрастают в вашем саду.

2. Вы всегда можете отозвать свои фото и данные в этом боте.

3. Администратор имеет право не принять вашу фотографию, если она не соответствует внутренним критериям, таким как возраст растения, состояние, качество фото и т. д.

4. Пожалуйста, пришлите фотографию (не более 3 штук) вместе с описанием в одном сообщении: латинское название, локация, возраст (примерно, но более 5 лет, для известных сортов от 7 и более), сад в котором растет растение (по желанию, можно указать "частный сад").

Как определить возраст растения: надо сложить возраст в горшке плюс время с момента посадки. Для контейнеров p9 — 1 год, С2-3 — 2-3 года, С5 — 4-5 лет и т.д.`
}

const CONSENT_OK = `Отправьте фото растения (1–3 шт.) с описанием в одном сообщении.

Пример:
——————
Picea pungens 'Hoopsii'
Ель колючая
Московская обл., Раменский р-н
Возраст: 10 лет
Размер: высота 2.5 м
Сад Иванова
——————

Мы рассмотрим и ответим вам здесь.`

const NEXT_STEP = `\n\nЕсли хотите предложить ещё одно растение — отправьте фото (1–3 шт.) с описанием в одном сообщении:\n\n— Латинское название\n— Русское название\n— Локация\n— Возраст\n— Размер\n— Название сада`

// ── Dedup: prevent double processing when two bots poll same token ──
const PROCESSED_FILE = resolve(ROOT, 'data/processed-mids.json')
const processedMids = new Set<string>(
  existsSync(PROCESSED_FILE) ? JSON.parse(readFileSync(PROCESSED_FILE, 'utf-8')) : []
)

function markProcessed(mid: string) {
  processedMids.add(mid)
  // Keep last 500
  const arr = [...processedMids]
  if (arr.length > 500) {
    const trimmed = arr.slice(-500)
    processedMids.clear()
    for (const m of trimmed) processedMids.add(m)
  }
  writeFileSync(PROCESSED_FILE, JSON.stringify([...processedMids]))
}

function isAlreadyProcessed(mid: string): boolean {
  // Re-read from disk in case other bot wrote it
  try {
    const arr = JSON.parse(readFileSync(PROCESSED_FILE, 'utf-8'))
    return arr.includes(mid)
  } catch { return processedMids.has(mid) }
}

// ── Process updates ────────────────────────────────────────
async function process(update: any) {
  const type = update.update_type

  // IGNORE events from the catalog channel — bot must NEVER post there
  const eventChatId = update.message?.recipient?.chat_id || update.chat_id
  if (String(eventChatId) === PROTECTED_CATALOG_ID) return

  // Blue "START" button — treat as /start
  if (type === 'bot_started') {
    const uid = String(update.user?.user_id || '')
    const chatId = update.chat_id
    const firstName = update.user?.name || update.user?.first_name || 'друг'
    log(`bot_started: uid=${uid}, chat_id=${chatId}`)
    if (!uid || !chatId) return
    if (state.consented[uid]) {
      await send(chatId, CONSENT_OK)
      return
    }
    await send(chatId, welcomeText(firstName), [{
      type: 'inline_keyboard',
      payload: { buttons: [[{ type: 'callback', text: '✅ Принимаю правила', payload: 'consent_agree' }]] },
    }])
    return
  }

  // Consent button
  if (type === 'message_callback') {
    const cb = update.callback
    if (cb?.payload === 'consent_agree') {
      const uid = String(cb?.user?.user_id || update.user_id)
      const cbChatId = update.message?.recipient?.chat_id || update.chat_id
      log(`Consent callback: uid=${uid}, chat_id=${cbChatId}`)
      if (state.consented[uid]) {
        await answerCallback(cb.callback_id)
        if (cbChatId) await send(cbChatId, '✅ Вы уже дали согласие. Отправьте фото + описание растения.')
        return
      }
      await answerCallback(cb.callback_id)
      state.consented[uid] = true
      saveState(state)
      if (cbChatId) await send(cbChatId, CONSENT_OK)
      log(`Consent: user ${uid}`)
    }
    return
  }

  if (type !== 'message_created') return
  const msg = update.message
  if (!msg || msg.sender?.is_bot) return

  const uid = msg.sender?.user_id
  const name = msg.sender?.name || msg.sender?.first_name || '?'
  const username = msg.sender?.username || ''
  const chatId = msg.recipient?.chat_id
  const text = msg.body?.text || ''

  // ════════════════════════════════════════════
  // ADMIN CHAT
  // ════════════════════════════════════════════
  if (String(chatId) === String(ADMIN_CHAT_ID)) {
    // /last — show recent publications
    if (text === '/last' || text.startsWith('/last ')) {
      const count = parseInt(text.split(/\s+/)[1]) || 10
      const pubs = loadPublications()
      if (!pubs.length) {
        await send(ADMIN_CHAT_ID, '📭 Нет недавних публикаций.')
        return
      }
      const showing = Math.min(count, pubs.length, 20)
      const reversed = [...pubs].reverse().slice(0, showing)
      let msg = `📋 Последние ${showing} публикаций:\n\n`
      reversed.forEach((p, i) => {
        const date = p.date?.slice(0, 10) || '?'
        const title = p.text || p.latin || '?'
        const author = p.author ? ` (${p.author})` : ''
        const hasMid = p.channelMid ? '🗑' : '⚠️'
        msg += `${hasMid} ${i + 1}. ${title}${author} — ${date}\n`
      })
      msg += `\n🗑 = можно удалить командой /удалить N\n⚠️ = нет ID, удалить нельзя`
      await send(ADMIN_CHAT_ID, msg)
      return
    }

    // /удалить N — works without reply too
    if (text.startsWith('/удалить') || text.startsWith('/delete')) {
      const num = parseInt(text.split(/\s+/)[1])
      if (!num || num < 1) {
        await send(ADMIN_CHAT_ID, '⚠️ Укажите номер из списка /last. Пример: /удалить 3')
        return
      }
      const pubs = loadPublications()
      const reversed = [...pubs].reverse()
      const pub = reversed[num - 1]
      if (!pub) {
        await send(ADMIN_CHAT_ID, `⚠️ Нет публикации №${num}. Всего: ${pubs.length}`)
        return
      }
      if (!pub.channelMid) {
        await send(ADMIN_CHAT_ID, `⚠️ У публикации «${pub.text || pub.latin}» нет ID сообщения в канале — удалить автоматически нельзя.\nОна была опубликована до введения модерации.`)
        return
      }
      const ok = await deleteMessage(pub.channelMid)
      if (ok) {
        removePublication(pub.channelMid)
        await send(ADMIN_CHAT_ID, `✅ Удалено из канала: ${pub.text || pub.latin}`)
        log(`Deleted from channel: ${pub.text} (mid=${pub.channelMid}, by ${name})`)
      } else {
        await send(ADMIN_CHAT_ID, `❌ Не удалось удалить сообщение. Возможно, оно уже удалено.`)
      }
      return
    }

    const replyMid = msg.link?.type === 'reply' ? msg.link.message?.mid : undefined
    if (!replyMid) return

    const target = state.midMap[replyMid]
    if (!target) return

    // /ban
    if (text === '/ban') {
      state.banned[String(target.userId)] = true
      saveState(state)
      await send(ADMIN_CHAT_ID, `🚫 Пользователь ${target.userName} (${target.userId}) заблокирован.`)
      await send(target.chatId, '🚫 Вы заблокированы. Обратитесь к администратору если считаете это ошибкой.')
      log(`Banned: ${target.userName} (${target.userId})`)
      return
    }

    // /unban
    if (text === '/unban') {
      delete state.banned[String(target.userId)]
      saveState(state)
      await send(ADMIN_CHAT_ID, `✅ Пользователь ${target.userName} (${target.userId}) разблокирован.`)
      log(`Unbanned: ${target.userName} (${target.userId})`)
      return
    }

    // "+" → принято: найти заявку, AI форматировать, предложить админу
    if (text.trim() === '+') {
      const userSubs = getSubmissions(target.userId)
      // Find submission: by mid first, then fallback
      let sub = findSubmissionByMid(target.userId, replyMid)
      if (!sub && userSubs.length === 1) sub = userSubs[0]
      if (!sub && userSubs.length > 1) {
        await send(ADMIN_CHAT_ID, `⚠️ У пользователя ${target.userName} несколько активных заявок (${userSubs.length} шт.).\nОтветьте + на конкретное сообщение с фото нужной заявки.`)
        return
      }
      if (!sub) {
        // Fallback: no submission system entry (old-style message or submission was cleared)
        // Use photos/text from midMap directly (backward compatibility)
        const origText = msg.link?.message?.text || msg.link?.message?.body?.text || ''
        const photos = target.photos || []
        if (!origText && !photos.length) {
          await send(ADMIN_CHAT_ID, `⚠️ Не найдена активная заявка от ${target.userName}. Попросите прислать фото + описание заново.`)
          return
        }
        // Process old-style (no submission tracking)
        await processAccept(target, origText, photos, name, null)
        return
      }

      // Build text for AI
      const repliedText = msg.link?.message?.text || msg.link?.message?.body?.text || ''
      const aiInput = getSubmissionTextForAI(sub, repliedText)
      const photos = getSubmissionPhotos(sub)
      const total = userSubs.length
      const label = subLabel(sub, total)

      // Notify user
      await send(target.chatId, `✅ ${subLabelShort(sub, total)} принята! Спасибо за вклад в каталог «Территория хвойных».${NEXT_STEP}`)

      // AI + preview
      await processAccept(target, aiInput, photos, name, sub)
      return
    }

    // "-" → отказ
    if (text.trim() === '-') {
      const userSubs = getSubmissions(target.userId)
      let sub = findSubmissionByMid(target.userId, replyMid)
      if (!sub && userSubs.length === 1) sub = userSubs[0]

      if (sub) {
        const total = userSubs.length
        await send(target.chatId, `🙏 По ${subLabel(sub, total)}: к сожалению, данное растение не подходит по нашим критериям.${NEXT_STEP}`)
        await send(ADMIN_CHAT_ID, `❌ Отклонена ${subLabel(sub, total)} от ${target.userName}.`)
        removeSubmission(target.userId, sub.id)
      } else {
        await send(target.chatId, `🙏 Спасибо за вашу заявку! К сожалению, данное растение не подходит по нашим критериям.${NEXT_STEP}`)
        await send(ADMIN_CHAT_ID, `❌ Заявка от ${target.userName} отклонена.`)
      }
      saveState(state)
      log(`Rejected: ${target.userName} by ${name}`)
      return
    }

    // Check if this is a reply to a "publish text" request
    const pending = state.pendingPublish[replyMid] as any
    if (pending && text) {
      // "ок" → publish AI text; anything else → publish admin's text
      const isApprove = text.trim() === '+' || text.trim().toLowerCase() === 'ок' || text.trim().toLowerCase() === 'ok'
      let publishText = isApprove && pending.aiText ? pending.aiText : text
      // Safety: strip bot instruction text if admin accidentally copied the full preview
      publishText = publishText.replace(/\n?——————[\s\S]*$/, '').replace(/\n?📌 Что делать:[\s\S]*$/, '').trim()

      const pubAttachments = pending.photos.map((url: string) => ({ type: 'image', payload: { url } }))
      const pubResult: any = await send(PROTECTED_CATALOG_ID, publishText, pubAttachments.length ? pubAttachments : undefined)
      const channelMid = pubResult?.message?.body?.mid || ''
      await send(ADMIN_CHAT_ID, `📢 Опубликовано в канале «Территория хвойных».\nАвтор заявки: ${pending.userName}`)

      // Record in shared publication cache (cross-bot duplicate detection)
      const parsed = parseLatinName(publishText)
      const firstLine = publishText.split('\n').filter(Boolean)[0] || ''
      if (parsed) addPublication(parsed.normalized, '', 'max', { channelMid, text: firstLine, author: pending.userName })

      // Clean up submission
      if (pending.submissionId && pending.submissionUserId) {
        removeSubmission(pending.submissionUserId, pending.submissionId)
      }

      delete state.pendingPublish[replyMid]
      saveState(state)
      log(`Published to channel: ${publishText.substring(0, 50)} (${pending.photos.length} photos, from ${pending.userName})`)
      return
    }

    // Любой другой reply → пересылка пользователю с контекстом заявки
    const replyPhotos: any[] = []
    for (const att of (msg.body?.attachments || [])) {
      if (att.type === 'image') replyPhotos.push(att)
    }

    // Add submission context to relay
    const userSubs = getSubmissions(target.userId)
    const sub = findSubmissionByMid(target.userId, replyMid)
    let userText = text
    if (sub) {
      const total = userSubs.length
      userText = `💬 По ${subLabel(sub, total)}:\n${text}`
    }

    await send(target.chatId, userText, replyPhotos.length ? replyPhotos : undefined)

    // Confirm to admin with context
    if (sub) {
      const total = userSubs.length
      await send(ADMIN_CHAT_ID, `↩️ Отправлено пользователю (${subLabel(sub, total)})`, undefined, msg.body?.mid)
    }

    log(`Reply → ${target.userName}: ${text.substring(0, 50)}`)
    return
  }

  // ════════════════════════════════════════════
  // DM FROM USER
  // ════════════════════════════════════════════

  if (state.banned[String(uid)]) {
    await send(chatId, '🚫 Вы заблокированы.')
    return
  }

  if (text === '/start' || text.startsWith('/start')) {
    if (state.consented[String(uid)]) {
      await send(chatId, CONSENT_OK)
      return
    }
    await send(chatId, welcomeText(msg.sender?.first_name || 'друг'), [{
      type: 'inline_keyboard',
      payload: { buttons: [[{ type: 'callback', text: '✅ Принимаю правила', payload: 'consent_agree' }]] },
    }])
    return
  }

  if (text === '/help') {
    await send(chatId, 'Команды:\n/start — правила и согласие\n/help — справка\n/revoke — отозвать согласие\n\nОтправьте фото + описание для создания заявки.')
    return
  }

  if (text === '/revoke') {
    if (state.consented[String(uid)]) {
      delete state.consented[String(uid)]
      saveState(state)
      await send(chatId, '🔓 Согласие отозвано. Напишите /start чтобы начать заново.')
    } else {
      await send(chatId, 'Вы ещё не давали согласие.')
    }
    return
  }

  if (!state.consented[String(uid)]) {
    await send(chatId, 'Пожалуйста, сначала нажмите /start и примите правила.', [{
      type: 'inline_keyboard',
      payload: { buttons: [[{ type: 'callback', text: '✅ Принимаю правила', payload: 'consent_agree' }]] },
    }])
    return
  }

  // ── Dedup: check if another bot already processed this message ──
  const msgMid = msg.body?.mid || ''
  if (msgMid && isAlreadyProcessed(msgMid)) {
    log(`Dedup: skipping already processed message ${msgMid} from ${name}`)
    return
  }
  if (msgMid) markProcessed(msgMid)

  // ── Extract photos ──
  const photos: string[] = []
  for (const att of (msg.body?.attachments || [])) {
    if (att.type === 'image' && att.payload?.url) photos.push(att.payload.url)
  }

  const userTag = username ? `@${username}` : ''
  const userSubs = getSubmissions(uid)

  // ── Check for pending photo choice response ──
  const pendingChoice = state.pendingPhotoChoice[String(uid)]
  if (pendingChoice && !photos.length && text) {
    const num = parseInt(text.trim())
    if (num && num >= 1) {
      const targetSub = userSubs.find(s => s.id === num)
      if (targetSub) {
        targetSub.latestPhotos = pendingChoice.photos
        delete state.pendingPhotoChoice[String(uid)]

        // Confirm to user
        const total = userSubs.length
        const photoCount = pendingChoice.photos.length
        await send(chatId, `📸 Фото (${photoCount} шт.) обновлено для ${subLabel(targetSub, total)}.`)

        // Forward to admin
        const adminText = `📸 Обновлённые фото к ${subLabel(targetSub, total)}\n\n👤 ${name}, ${userTag} (#ID${uid})`
        const attachments = pendingChoice.photos.map(url => ({ type: 'image', payload: { url } }))
        const result: any = await send(ADMIN_CHAT_ID, adminText, attachments)
        const mid = result?.message?.body?.mid
        if (mid) {
          targetSub.allMids.push(mid)
          state.midMap[mid] = { userId: uid, chatId, userName: name, photos: pendingChoice.photos, submissionId: targetSub.id }
        }

        saveState(state)
        log(`Photo choice ${num} from ${name}: ${photoCount} photos → submission ${targetSub.id}`)
        return
      }
    }
    // Invalid choice — cancel and continue with normal processing
    delete state.pendingPhotoChoice[String(uid)]
    saveState(state)
  }

  // ── CASE A: Photo + text → new submission ──
  if (photos.length > 0 && text) {
    // Cancel any pending photo choice
    delete state.pendingPhotoChoice[String(uid)]

    const sub = createSubmission(uid, chatId, name, text, photos)
    const total = getSubmissions(uid).length

    // Confirm to user immediately
    const shortName = submissionShortName(sub)
    const label = total > 1 ? `📋 Заявка №${sub.id} получена!` : '📋 Заявка получена!'
    await send(chatId, `${label}\n${shortName}\n📸 ${photos.length} фото\nАдминистраторы рассмотрят и ответят вам здесь.`)

    // Forward to admin
    let adminText = `📋 ${subLabelShort(sub, total)}\n\n${text}\n\n👤 ${name}, ${userTag} (#ID${uid})`
    const attachments = photos.map(url => ({ type: 'image', payload: { url } }))
    const result: any = await send(ADMIN_CHAT_ID, adminText, attachments)
    const mid = result?.message?.body?.mid
    if (mid) {
      sub.allMids.push(mid)
      state.midMap[mid] = { userId: uid, chatId, userName: name, photos, submissionId: sub.id }
    }

    saveState(state)
    log(`New submission #${sub.id} from ${name}: ${photos.length} photos, "${text.substring(0, 40)}"`)
    return
  }

  // ── CASE B: Only photos, no text → update existing submission ──
  if (photos.length > 0 && !text) {
    if (userSubs.length === 0) {
      // No active submissions → create one without text
      const sub = createSubmission(uid, chatId, name, '', photos)
      const total = getSubmissions(uid).length
      await send(chatId, `📋 ${total > 1 ? `Заявка №${sub.id} получена!` : 'Заявка получена!'}\n📸 ${photos.length} фото\nПожалуйста, добавьте описание: латинское название, регион, возраст.`)

      const adminText = `📋 ${subLabelShort(sub, total)} (без описания)\n\n👤 ${name}, ${userTag} (#ID${uid})`
      const attachments = photos.map(url => ({ type: 'image', payload: { url } }))
      const result: any = await send(ADMIN_CHAT_ID, adminText, attachments)
      const mid = result?.message?.body?.mid
      if (mid) {
        sub.allMids.push(mid)
        state.midMap[mid] = { userId: uid, chatId, userName: name, photos, submissionId: sub.id }
      }
      saveState(state)
      log(`New submission #${sub.id} (no text) from ${name}: ${photos.length} photos`)
      return
    }

    if (userSubs.length === 1) {
      // Single active submission → update photos
      const sub = userSubs[0]
      sub.latestPhotos = photos
      const total = 1
      await send(chatId, `📸 Фото обновлено для вашей ${subLabel(sub, total)}.\nТеперь: ${photos.length} фото.`)

      const adminText = `📸 Обновлённые фото к ${subLabel(sub, total)}\n\n👤 ${name}, ${userTag} (#ID${uid})`
      const attachments = photos.map(url => ({ type: 'image', payload: { url } }))
      const result: any = await send(ADMIN_CHAT_ID, adminText, attachments)
      const mid = result?.message?.body?.mid
      if (mid) {
        sub.allMids.push(mid)
        state.midMap[mid] = { userId: uid, chatId, userName: name, photos, submissionId: sub.id }
      }
      saveState(state)
      log(`Updated photos for submission #${sub.id} from ${name}: ${photos.length} photos`)
      return
    }

    // Multiple submissions → ask user
    state.pendingPhotoChoice[String(uid)] = { photos, timestamp: Date.now() }
    let choiceText = `У вас несколько активных заявок:\n`
    for (const s of userSubs) {
      const photoCount = getSubmissionPhotos(s).length
      choiceText += `${s.id}. ${submissionShortName(s)} (${photoCount} фото)\n`
    }
    choiceText += `\nК какой заявке обновить фото? Ответьте номером.`
    await send(chatId, choiceText)
    saveState(state)
    log(`Photo choice requested from ${name}: ${userSubs.length} submissions`)
    return
  }

  // ── CASE C: Text only → forward as clarification ──
  if (text && !photos.length) {
    let adminText = text + `\n\n👤 ${name}, ${userTag} (#ID${uid})`

    // Tag with submission if unambiguous
    if (userSubs.length === 1) {
      const sub = userSubs[0]
      adminText = `↳ к ${subLabel(sub, 1)}\n\n${text}\n\n👤 ${name}, ${userTag} (#ID${uid})`
    }

    const result: any = await send(ADMIN_CHAT_ID, adminText)
    const mid = result?.message?.body?.mid
    if (mid) {
      state.midMap[mid] = { userId: uid, chatId, userName: name }
      // Link to submission if unambiguous
      if (userSubs.length === 1) {
        userSubs[0].allMids.push(mid)
        state.midMap[mid].submissionId = userSubs[0].id
      }
    }
    saveState(state)
    log(`Forwarded text from ${name}: "${text.substring(0, 40)}"`)
    return
  }

  // Fallback: no text, no photos (sticker, etc.)
  log(`Ignored non-text/photo message from ${name}`)
}

// ── Accept + AI format + preview ────────────────────────────
async function processAccept(
  target: { userId: number; chatId: number; userName: string },
  aiInput: string,
  photos: string[],
  adminName: string,
  sub: Submission | null,
) {
  log(`  AI input: "${aiInput.substring(0, 80)}..."`)

  // AI formatting
  const formatted = aiInput ? await formatWithAI(aiInput) : null

  // Triple duplicate check
  let dupeResult = findAllDuplicates(aiInput)
  if (!dupeResult && formatted) dupeResult = findAllDuplicates(formatted)
  const submittedGarden = formatted ? extractGarden(formatted) : ''
  const dupeWarning = dupeResult ? formatDupeWarning(dupeResult.matches, submittedGarden) : ''

  const subContext = sub ? ` (${submissionShortName(sub)})` : ''

  let askText: string
  if (formatted) {
    askText = `✅ Заявка от ${target.userName}${subContext} принята.${dupeWarning}\n\n🤖 Предложенный текст для канала:\n——————\n${formatted}\n——————\n📸 Фото: ${photos.length} шт.\n\n📌 Что делать:\n• Текст устраивает → ответьте на это сообщение «ок»\n• Нужно поправить → ответьте на это сообщение своим вариантом текста`
  } else {
    askText = `✅ Заявка от ${target.userName}${subContext} принята.${dupeWarning}\n📸 Фото: ${photos.length} шт.\n\nОтветьте на это сообщение с текстом для публикации в канале.`
  }

  const askResult: any = await send(ADMIN_CHAT_ID, askText)
  const askMid = askResult?.message?.body?.mid
  if (askMid) {
    state.pendingPublish[askMid] = {
      photos,
      userName: target.userName,
      aiText: formatted || undefined,
      submissionId: sub?.id,
      submissionUserId: sub ? String(sub.userId) : undefined,
    } as any
    state.midMap[askMid] = { userId: target.userId, chatId: target.chatId, userName: target.userName }
    if (sub) sub.allMids.push(askMid)
  }

  saveState(state)
  log(`Accepted: ${target.userName} by ${adminName}, AI formatted: ${!!formatted}, photos: ${photos.length}`)
}

// ── Logging ────────────────────────────────────────────────
function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`)
}

// ── Long polling ───────────────────────────────────────────
async function poll() {
  let marker: number | null = null
  log(`🌲 Bot "Леший" v2 started → ADMIN_CHAT_ID=${ADMIN_CHAT_ID}`)

  while (true) {
    try {
      const params = new URLSearchParams({
        timeout: '25', limit: '100',
        types: 'message_created,message_callback,bot_started',
      })
      if (marker) params.set('marker', String(marker))

      const resp = await fetch(`${BASE_URL}/updates?${params}`, { headers: { Authorization: TOKEN } })
      if (!resp.ok) { log(`Poll error: ${resp.status}`); await sleep(5000); continue }

      const data: any = await resp.json()
      if (data.marker) marker = data.marker

      for (const upd of (data.updates || [])) {
        try {
          await process(upd)
        } catch (e) { console.error('Update error:', e) }
      }
    } catch (e) {
      log(`Poll error: ${e}`)
      await sleep(5000)
    }
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

poll()
