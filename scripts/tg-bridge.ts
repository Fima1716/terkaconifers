/**
 * TG-мост «Леший-TG» — Telegram бот, который пересылает заявки в Корзину MAX.
 *
 * Флоу:
 * 1. TG-пользователь /start → правила + кнопка согласия
 * 2. Отправляет фото + описание → бот скачивает фотки, пересылает в MAX Корзину
 * 3. Админ в MAX reply "+" → принято, AI форматирует, спрашивает текст
 * 4. Админ "ок" → публикация в канал-каталог
 * 5. Ответы админов релеятся обратно в TG
 *
 * Работает параллельно с Лешим (MAX-бот). Каждый обрабатывает только свои заявки.
 *
 * Запуск: npx tsx scripts/tg-bridge.ts
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { findAllDuplicates, formatDupeWarning, addPublication, parseLatinName } from './lib/dupe-check.js'

const ROOT = resolve(import.meta.dirname, '..')
const STATE_FILE = resolve(ROOT, 'data/tg-bridge-state.json')

// ── Load .env ────────────────────────────────────────────
const envVars: Record<string, string> = {}
const envPath = resolve(ROOT, '.env')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) envVars[m[1].trim()] = m[2].trim()
  }
}

const TG_TOKEN = envVars.TG_BOT_TOKEN || ''
const MAX_TOKEN = envVars.MAX_BOT_TOKEN || ''
const ADMIN_CHAT_ID = envVars.ADMIN_CHAT_ID || '-72548188058297'
const GROQ_KEY = envVars.GROQ_API_KEY || ''
const PROTECTED_CATALOG_ID = '-71324192443065'

const TG_API = `https://api.telegram.org/bot${TG_TOKEN}`
const MAX_API = 'https://platform-api.max.ru'
const MAX_H = { Authorization: MAX_TOKEN, 'Content-Type': 'application/json' }

if (!TG_TOKEN) { console.error('No TG_BOT_TOKEN in .env'); process.exit(1) }
if (!MAX_TOKEN) { console.error('No MAX_BOT_TOKEN in .env'); process.exit(1) }

// ── State ────────────────────────────────────────────────
interface BridgeState {
  consented: Record<string, boolean>
  banned: Record<string, boolean>
  // MAX mid → TG user info (for relaying admin replies back to TG)
  midMap: Record<string, { tgChatId: number; tgUserId: number; userName: string; photos: string[]; origText: string; tgMsgId?: number }>
  pendingPublish: Record<string, { photos: string[]; userName: string; aiText?: string }>
  // Reverse map: TG bot message ID → MAX mid (for user replies to moderator messages)
  tgToMax: Record<string, string>
}

function loadState(): BridgeState {
  if (existsSync(STATE_FILE)) {
    try {
      const s = JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
      return { consented: s.consented || {}, banned: s.banned || {}, midMap: s.midMap || {}, pendingPublish: s.pendingPublish || {}, tgToMax: s.tgToMax || {} }
    } catch {}
  }
  return { consented: {}, banned: {}, midMap: {}, pendingPublish: {}, tgToMax: {} }
}

function saveState(s: BridgeState) {
  const entries = Object.entries(s.midMap)
  if (entries.length > 1000) s.midMap = Object.fromEntries(entries.slice(-1000))
  const tgEntries = Object.entries(s.tgToMax)
  if (tgEntries.length > 1000) s.tgToMax = Object.fromEntries(tgEntries.slice(-1000))
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2))
}

const state = loadState()

// ── TG API helpers ───────────────────────────────────────
async function tgCall(method: string, body?: any) {
  const resp = await fetch(`${TG_API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return resp.json() as any
}

async function tgSend(chatId: number, text: string, opts?: { replyMarkup?: any; replyTo?: number }) {
  return tgCall('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    ...(opts?.replyMarkup ? { reply_markup: opts.replyMarkup } : {}),
    ...(opts?.replyTo ? { reply_parameters: { message_id: opts.replyTo } } : {}),
  })
}

async function tgSendPhoto(chatId: number, photoUrl: string, caption?: string) {
  return tgCall('sendPhoto', { chat_id: chatId, photo: photoUrl, caption, parse_mode: 'HTML' })
}

async function tgGetFileUrl(fileId: string): Promise<string | null> {
  const res = await tgCall('getFile', { file_id: fileId })
  if (!res.ok || !res.result?.file_path) return null
  return `https://api.telegram.org/file/bot${TG_TOKEN}/${res.result.file_path}`
}

// ── MAX API helpers ──────────────────────────────────────
async function maxSend(chatId: string | number, text: string, attachments?: any[], replyTo?: string) {
  const body: any = { text }
  if (attachments?.length) body.attachments = attachments
  if (replyTo) body.link = { type: 'reply', mid: replyTo }
  const resp = await fetch(`${MAX_API}/messages?chat_id=${chatId}`, {
    method: 'POST', headers: MAX_H, body: JSON.stringify(body),
  })
  return resp.json() as any
}

// ── AI formatting (same as Леший) ────────────────────────
async function formatWithAI(rawText: string): Promise<string | null> {
  if (!GROQ_KEY) return null
  try {
    const resp = await fetch('http://185.192.21.148:9443/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
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

ПРАВИЛА:

Латиница:
- Род с большой, вид с маленькой, сорт в одинарных кавычках: Pinus mugo 'Aurus'

Русское название = название ВИДА (не рода!):
- Picea abies → Ель обыкновенная
- Pinus mugo → Сосна горная

Название сада:
- Пиши как есть, БЕЗ префикса "Название сада:"
- Если сад не указан — используй имя автора: "Сад Имени Фамилия"

Хештеги (каждый с новой строки):
1. #Род — #Ель, #Сосна, #Пихта и т.д.
2. #Род_вид — #Ель_обыкновенная и т.д.
3. #НазваниеСада — слитно
4. #Российский_сорт — если указано

Очистка: удали 👤, (#IDxxxx), @username, метки бота.
Отвечай ТОЛЬКО готовым текстом, без пояснений.`
          },
          { role: 'user', content: rawText }
        ],
      }),
    })
    if (!resp.ok) { log(`Groq error: ${resp.status}`); return null }
    const data: any = await resp.json()
    return data.choices?.[0]?.message?.content?.trim() || null
  } catch (e) { log(`Groq error: ${e}`); return null }
}

// Duplicate detection — uses shared lib (catalog + recent publications + pending)

// ── Welcome text ─────────────────────────────────────────
function welcomeText(name: string) {
  return `Здравствуйте, ${name}!

Прежде чем отправлять ваши фото, прочитайте правила:

1. Отправляя фотографию, Вы соглашаетесь на размещение в канале «Территория хвойных. Каталог» и на сайте terkaconifers.ru. Вы подтверждаете, что фото принадлежит вам.

2. Вы можете отозвать согласие командой /revoke.

3. Администратор может не принять фото, если растение не подходит по критериям (возраст, состояние, качество).

4. Пришлите фото (1–3 шт.) с описанием в одном сообщении: латинское название, локация, возраст (от 5 лет), название сада.`
}

const CONSENT_OK = `✅ Согласие принято!

Отправьте фото растения (1–3 шт.) с описанием в одном сообщении.

Пример:
——————
Picea pungens 'Hoopsii'
Ель колючая
Московская обл.
Возраст: 10 лет
Сад Иванова
——————

Мы рассмотрим и ответим вам здесь.`

// ── Media group buffering ────────────────────────────────
// TG sends multi-photo messages as separate updates with same media_group_id
const mediaBuffer = new Map<string, { chatId: number; userId: number; userName: string; username: string; caption: string; fileIds: string[]; msgId: number; timer: ReturnType<typeof setTimeout> }>()

async function flushMediaGroup(groupId: string) {
  const group = mediaBuffer.get(groupId)
  if (!group) return
  mediaBuffer.delete(groupId)
  await forwardToMax(group.chatId, group.userId, group.userName, group.username, group.caption, group.fileIds, group.msgId)
}

// ── Forward TG submission to MAX ─────────────────────────
async function forwardToMax(tgChatId: number, tgUserId: number, userName: string, username: string, text: string, photoFileIds: string[], tgMsgId?: number) {
  // Download photo URLs from TG
  const photoUrls: string[] = []
  for (const fid of photoFileIds) {
    const url = await tgGetFileUrl(fid)
    if (url) photoUrls.push(url)
  }

  const userTag = username ? `@${username}` : ''
  let adminText = text || '(без описания)'
  adminText += `\n\n👤 ${userName}, ${userTag} [TG] (#TG${tgUserId})`

  const attachments = photoUrls.map(url => ({ type: 'image', payload: { url } }))

  const result = await maxSend(ADMIN_CHAT_ID, adminText, attachments.length ? attachments : undefined)
  const mid = result?.message?.body?.mid
  if (mid) {
    state.midMap[mid] = { tgChatId, tgUserId, userName, photos: photoUrls, origText: text, tgMsgId }
    saveState(state)
  }

  log(`Forwarded from TG ${userName}: ${photoUrls.length} photos, "${text.substring(0, 40)}"`)
}

// ── Process TG update ────────────────────────────────────
async function processTg(update: any) {
  // Callback query (consent button)
  if (update.callback_query) {
    const cb = update.callback_query
    const uid = String(cb.from?.id)
    const chatId = cb.message?.chat?.id
    if (cb.data === 'consent_agree') {
      await tgCall('answerCallbackQuery', { callback_query_id: cb.id })
      if (state.consented[uid]) {
        await tgSend(chatId, '✅ Вы уже дали согласие. Отправьте фото + описание.')
        return
      }
      state.consented[uid] = true
      saveState(state)
      await tgSend(chatId, CONSENT_OK)
      log(`TG consent: ${cb.from?.first_name} (${uid})`)
    }
    return
  }

  const msg = update.message
  if (!msg) return

  const chatId = msg.chat?.id
  const uid = String(msg.from?.id)
  const firstName = msg.from?.first_name || 'друг'
  const username = msg.from?.username || ''
  const text = msg.text || msg.caption || ''

  // Commands
  if (text === '/start') {
    if (state.consented[uid]) {
      await tgSend(chatId, CONSENT_OK)
      return
    }
    await tgSend(chatId, welcomeText(firstName), {
      replyMarkup: { inline_keyboard: [[{ text: '✅ Принимаю правила', callback_data: 'consent_agree' }]] },
    })
    return
  }

  if (text === '/help') {
    await tgSend(chatId, 'Команды:\n/start — правила\n/help — справка\n/revoke — отозвать согласие\n\nОтправьте фото + описание для заявки.')
    return
  }

  if (text === '/revoke') {
    if (state.consented[uid]) {
      delete state.consented[uid]
      saveState(state)
      await tgSend(chatId, '🔓 Согласие отозвано. /start чтобы начать заново.')
    } else {
      await tgSend(chatId, 'Вы ещё не давали согласие.')
    }
    return
  }

  // Ban check
  if (state.banned[uid]) {
    await tgSend(chatId, '🚫 Вы заблокированы.')
    return
  }

  // Consent check
  if (!state.consented[uid]) {
    await tgSend(chatId, 'Нажмите /start и примите правила.', {
      replyMarkup: { inline_keyboard: [[{ text: '✅ Принимаю правила', callback_data: 'consent_agree' }]] },
    })
    return
  }

  // User reply to a moderator message → forward back to MAX admin chat
  const replyToMsgId = msg.reply_to_message?.message_id
  if (replyToMsgId && state.tgToMax[String(replyToMsgId)]) {
    const maxMid = state.tgToMax[String(replyToMsgId)]
    const target = state.midMap[maxMid]
    const replyText = `💬 [TG] Ответ от ${firstName}:\n\n${text}`

    // Forward photos if user sent them
    const replyPhotos: string[] = []
    if (msg.photo) {
      const best = msg.photo[msg.photo.length - 1]
      const url = await tgGetFileUrl(best.file_id)
      if (url) replyPhotos.push(url)
    }
    const attachments = replyPhotos.map(url => ({ type: 'image', payload: { url } }))

    const maxResult = await maxSend(ADMIN_CHAT_ID, replyText, attachments.length ? attachments : undefined, maxMid)
    const newMid = maxResult?.message?.body?.mid
    if (newMid && target) {
      state.midMap[newMid] = { ...target, tgMsgId: msg.message_id }
      saveState(state)
    }
    log(`User reply → MAX: ${firstName}: ${text.substring(0, 50)}`)
    return
  }

  // Photo message → forward to MAX
  if (msg.photo && msg.photo.length > 0) {
    // Get highest resolution photo
    const bestPhoto = msg.photo[msg.photo.length - 1]

    // Handle media groups (multiple photos in one message)
    if (msg.media_group_id) {
      const gid = msg.media_group_id
      if (mediaBuffer.has(gid)) {
        const group = mediaBuffer.get(gid)!
        group.fileIds.push(bestPhoto.file_id)
        if (text && !group.caption) group.caption = text
      } else {
        const timer = setTimeout(() => flushMediaGroup(gid), 1500)
        mediaBuffer.set(gid, {
          chatId, userId: msg.from.id, userName: firstName,
          username, caption: text, fileIds: [bestPhoto.file_id], msgId: msg.message_id, timer,
        })
      }
      return
    }

    // Single photo
    await forwardToMax(chatId, msg.from.id, firstName, username, text, [bestPhoto.file_id], msg.message_id)
    await tgSend(chatId, '📨 Заявка отправлена! Ожидайте ответа.')
    return
  }

  // Text-only message (no photo)
  if (text && !text.startsWith('/')) {
    await tgSend(chatId, '📸 Пожалуйста, приложите фото растения к описанию (1–3 шт. в одном сообщении).')
    return
  }
}

// ── Process MAX admin reply (relay back to TG) ───────────
async function processMax(update: any) {
  if (update.update_type !== 'message_created') return
  const msg = update.message
  if (!msg || msg.sender?.is_bot) return

  const chatId = msg.recipient?.chat_id
  if (String(chatId) !== String(ADMIN_CHAT_ID)) return

  const replyMid = msg.link?.type === 'reply' ? msg.link.message?.mid : undefined
  if (!replyMid) return

  const target = state.midMap[replyMid]
  if (!target) return // Not a TG submission — let Леший handle it

  const text = msg.body?.text || ''
  const name = msg.sender?.name || '?'

  const NEXT_STEP = '\n\nЧтобы предложить ещё — отправьте фото (1–3 шт.) с описанием.'

  // /ban
  if (text === '/ban') {
    state.banned[String(target.tgUserId)] = true
    saveState(state)
    await maxSend(ADMIN_CHAT_ID, `🚫 TG-пользователь ${target.userName} (#TG${target.tgUserId}) заблокирован.`)
    await tgSend(target.tgChatId, '🚫 Вы заблокированы.', { replyTo: target.tgMsgId })
    log(`Banned TG: ${target.userName}`)
    return
  }

  // /unban
  if (text === '/unban') {
    delete state.banned[String(target.tgUserId)]
    saveState(state)
    await maxSend(ADMIN_CHAT_ID, `✅ TG-пользователь ${target.userName} разблокирован.`)
    log(`Unbanned TG: ${target.userName}`)
    return
  }

  // "+" → принято
  if (text.trim() === '+') {
    const acceptMsg = await tgSend(target.tgChatId, `✅ Ваше фото принято! Спасибо за вклад в каталог «Территория хвойных».${NEXT_STEP}`, { replyTo: target.tgMsgId })
    if (acceptMsg?.result?.message_id && replyMid) {
      state.tgToMax[String(acceptMsg.result.message_id)] = replyMid
    }

    // Use stored text from midMap (MAX reply chain may not include full text)
    const origText = target.origText || msg.link?.message?.text || msg.link?.message?.body?.text || ''
    const photos = target.photos || []
    log(`  origText for AI/dupe: "${origText.substring(0, 80)}"`)

    // AI formatting
    const formatted = origText ? await formatWithAI(origText) : null

    // Triple duplicate check: raw text → AI text → both against catalog + cache + pending
    let dupeResult = findAllDuplicates(origText)
    if (!dupeResult && formatted) dupeResult = findAllDuplicates(formatted)
    const dupeWarning = dupeResult ? formatDupeWarning(dupeResult.matches) : ''

    let askText: string
    if (formatted) {
      askText = `✅ [TG] Заявка от ${target.userName} принята.${dupeWarning}\n\n🤖 Текст:\n——————\n${formatted}\n——————\n\n«ок» → опубликовать, или ответьте своим текстом`
    } else {
      askText = `✅ [TG] Заявка от ${target.userName} принята.${dupeWarning}\n\nОтветьте текстом для публикации.`
    }

    const askResult = await maxSend(ADMIN_CHAT_ID, askText)
    const askMid = askResult?.message?.body?.mid
    if (askMid) {
      state.pendingPublish[askMid] = { photos, userName: target.userName, aiText: formatted || undefined }
      state.midMap[askMid] = { tgChatId: target.tgChatId, tgUserId: target.tgUserId, userName: target.userName, photos, origText }
    }
    saveState(state)
    log(`Accepted TG: ${target.userName} by ${name}`)
    return
  }

  // "-" → отказ
  if (text.trim() === '-') {
    await tgSend(target.tgChatId, `🙏 Спасибо за заявку! К сожалению, растение не подошло по критериям.${NEXT_STEP}`, { replyTo: target.tgMsgId })
    await maxSend(ADMIN_CHAT_ID, `❌ [TG] Заявка от ${target.userName} отклонена.`)
    saveState(state)
    log(`Rejected TG: ${target.userName} by ${name}`)
    return
  }

  // Pending publish check
  const pending = state.pendingPublish[replyMid]
  if (pending && text) {
    const isApprove = text.trim() === '+' || text.trim().toLowerCase() === 'ок' || text.trim().toLowerCase() === 'ok'
    const publishText = isApprove && pending.aiText ? pending.aiText : text
    const pubAttachments = pending.photos.map(url => ({ type: 'image', payload: { url } }))
    await maxSend(PROTECTED_CATALOG_ID, publishText, pubAttachments.length ? pubAttachments : undefined)
    await maxSend(ADMIN_CHAT_ID, `📢 [TG] Опубликовано в канале. Автор: ${pending.userName}`)

    // Record in shared publication cache (for cross-bot duplicate detection)
    const parsed = parseLatinName(publishText)
    if (parsed) addPublication(parsed.normalized, '', 'tg')

    delete state.pendingPublish[replyMid]
    saveState(state)
    log(`Published from TG: ${publishText.substring(0, 50)}`)
    return
  }

  // Any other reply → relay to TG user, save mapping for reverse replies
  const tgReply = await tgSend(target.tgChatId, `💬 Ответ от модератора:\n\n${text}`, { replyTo: target.tgMsgId })
  const tgBotMsgId = tgReply?.result?.message_id
  if (tgBotMsgId && replyMid) {
    state.tgToMax[String(tgBotMsgId)] = replyMid
    saveState(state)
  }
  log(`Reply → TG ${target.userName}: ${text.substring(0, 50)}`)
}

// ── Polling loops ────────────────────────────────────────
function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`)
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function pollTg() {
  let offset = 0
  log('🔵 TG polling started')
  while (true) {
    try {
      const res = await tgCall('getUpdates', { offset, timeout: 25, allowed_updates: ['message', 'callback_query'] })
      if (res.ok && res.result?.length) {
        for (const upd of res.result) {
          offset = upd.update_id + 1
          try { await processTg(upd) } catch (e) { console.error('TG update error:', e) }
        }
      }
    } catch (e) {
      log(`TG poll error: ${e}`)
      await sleep(5000)
    }
  }
}

async function pollMax() {
  let marker: number | null = null
  log('🟡 MAX polling started (watching admin chat for replies to TG submissions)')
  while (true) {
    try {
      const params = new URLSearchParams({ timeout: '25', limit: '100', types: 'message_created' })
      if (marker) params.set('marker', String(marker))
      const resp = await fetch(`${MAX_API}/updates?${params}`, { headers: { Authorization: MAX_TOKEN } })
      if (!resp.ok) { log(`MAX poll error: ${resp.status}`); await sleep(5000); continue }
      const data: any = await resp.json()
      if (data.marker) marker = data.marker
      for (const upd of (data.updates || [])) {
        try { await processMax(upd) } catch (e) { console.error('MAX update error:', e) }
      }
    } catch (e) {
      log(`MAX poll error: ${e}`)
      await sleep(5000)
    }
  }
}

// ── Start ────────────────────────────────────────────────
log('🌲 TG-мост «Леший-TG» запускается...')
log(`   TG бот: ${TG_TOKEN.substring(0, 10)}...`)
log(`   MAX Корзина: ${ADMIN_CHAT_ID}`)
log(`   AI: ${GROQ_KEY ? 'включен' : 'выключен'}`)

// Run both polling loops in parallel
Promise.all([pollTg(), pollMax()])
