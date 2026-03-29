/**
 * Бот «Леший» — relay-бот для приёма заявок.
 *
 * Флоу:
 * 1. /start → правила + кнопка согласия
 * 2. Пользователь шлёт фото/текст → бот пересылает в админский чат
 * 3. Админы обсуждают свободно
 * 4. Reply "+" → принято, reply "-" → отказ
 * 5. Reply с любым другим текстом → ответ пользователю
 * 6. /ban /unban — блокировка
 *
 * Запуск: npx tsx scripts/bot.ts
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'

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
const GROQ_KEY = env.GROQ_API_KEY || ''

const PROTECTED_CATALOG_ID = '-71324192443065'

if (!TOKEN) { console.error('No MAX_BOT_TOKEN in .env'); process.exit(1) }
if (String(ADMIN_CHAT_ID) === PROTECTED_CATALOG_ID) {
  console.error('ОШИБКА: ADMIN_CHAT_ID указывает на канал «Каталог»! Используйте чат «Корзина Терки» (-72548188058297).')
  process.exit(1)
}

// ── State ──────────────────────────────────────────────────
interface BotState {
  consented: Record<string, boolean>
  banned: Record<string, boolean>
  midMap: Record<string, { userId: number; chatId: number; userName: string; photos?: string[] }>
  // Pending publication: admin accepted, waiting for edited text to post to catalog channel
  pendingPublish: Record<string, { photos: string[]; userName: string; aiText?: string }>
}

function loadState(): BotState {
  if (existsSync(STATE_FILE)) {
    try {
      const s = JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
      return { consented: s.consented || {}, banned: s.banned || {}, midMap: s.midMap || {}, pendingPublish: s.pendingPublish || {} }
    } catch {}
  }
  return { consented: {}, banned: {}, midMap: {}, pendingPublish: {} }
}

function saveState(s: BotState) {
  const midEntries = Object.entries(s.midMap)
  if (midEntries.length > 1000) s.midMap = Object.fromEntries(midEntries.slice(-1000))
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2))
}

const state = loadState()

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

// ── Duplicate detection ──────────────────────────────────
const VALID_GENERA_BOT = new Set([
  'Abies', 'Calocedrus', 'Cedrus', 'Chamaecyparis', 'Cryptomeria',
  'Ginkgo', 'Juniperus', 'Larix', 'Metasequoia', 'Microbiota',
  'Picea', 'Pinus', 'Platycladus', 'Pseudotsuga', 'Sciadopitys',
  'Sequoiadendron', 'Taxus', 'Thuja', 'Thujopsis', 'Tsuga',
])

function findDuplicates(text: string): { latin: string; garden: string; matches: { latin_full: string; garden: string; max_url: string; date: string }[] } | null {
  if (!text) return null
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  if (!lines.length) return null

  // Extract latin name from first line
  const firstLine = lines[0]
  const firstWord = firstLine.split(/\s+/)[0]
  if (!VALID_GENERA_BOT.has(firstWord)) return null

  // Normalize for matching
  const latinNorm = firstLine
    .replace(/[\u2018\u2019\u201C\u201D''""'"`]/g, '')
    .replace(/\s+/g, ' ').trim().toLowerCase()

  // Extract garden from hashtags or text
  const hashtags = [...text.matchAll(/#([A-Za-zА-Яа-яЁё0-9_]+)/g)].map(m => m[1])
  const gardenPrefixes = ['Сад', 'Русинов', 'Питомник', 'Коллекция', 'Альпинарий', 'Частный', 'Лес']
  const garden = hashtags.find(h => gardenPrefixes.some(p => h.startsWith(p)) || h.endsWith('Сад') || h.endsWith('сад')) || ''

  // Load catalog and search
  const catalogPath = resolve(ROOT, 'data/raw/catalog.json')
  if (!existsSync(catalogPath)) return null
  try {
    const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'))
    const matches = catalog.filter((p: any) => {
      const pNorm = (p.latin_full || '')
        .replace(/[\u2018\u2019\u201C\u201D''""'"`]/g, '')
        .replace(/\s+/g, ' ').trim().toLowerCase()
      if (pNorm !== latinNorm) return false
      // Garden comparison: strip spaces for matching (hashtag "РусиновСад" vs display "Русинов Сад")
      if (garden && p.garden) {
        const g1 = p.garden.replace(/\s+/g, '').toLowerCase()
        const g2 = garden.replace(/\s+/g, '').toLowerCase()
        return g1.includes(g2) || g2.includes(g1)
      }
      return true
    }).map((p: any) => ({
      latin_full: p.latin_full,
      garden: p.garden || '',
      max_url: p.max_url || '',
      date: p.date || '',
    }))

    if (matches.length > 0) return { latin: firstLine, garden, matches }
  } catch {}
  return null
}

async function formatWithAI(rawText: string): Promise<string | null> {
  if (!GROQ_KEY) return null
  try {
    const resp = await fetch('http://38.180.51.140:8443/v1/chat/completions', {
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
3. #НазваниеСада — слитно без пробелов: #РусиновСад, #СадАнжеликиКолесник, #ПитомникГорошкевича
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
    if (!resp.ok) { log(`Groq error: ${resp.status}`); return null }
    const data: any = await resp.json()
    return data.choices?.[0]?.message?.content?.trim() || null
  } catch (e) { log(`Groq error: ${e}`); return null }
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
      log(`Consent callback: uid=${uid}, chat_id=${cbChatId}, raw=${JSON.stringify({ chat_id: update.chat_id, msg_chat: update.message?.recipient?.chat_id }).substring(0, 200)}`)
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

    const NEXT_STEP = `\n\nЕсли хотите предложить ещё одно растение — отправьте фото (1–3 шт.) с описанием в одном сообщении:\n\n— Латинское название\n— Русское название\n— Локация\n— Возраст\n— Размер\n— Название сада`

    // "+" → принято, AI форматирует, предлагает админу
    if (text.trim() === '+') {
      const userMsg = `✅ Ваше фото принято! Спасибо за вклад в каталог «Территория хвойных».${NEXT_STEP}`
      await send(target.chatId, userMsg)

      // Get original message text from the forwarded message (via reply chain)
      const origText = msg.link?.message?.text || msg.link?.message?.body?.text || ''
      const photos = (target as any).photos || []
      log(`  origText for dupe check: "${origText.substring(0, 80)}..."`)

      // Check for duplicates in catalog — try origText first, then AI-formatted text
      let dupes = origText ? findDuplicates(origText) : null

      // Try AI formatting
      const formatted = origText ? await formatWithAI(origText) : null

      // If origText didn't find dupes, try with AI-formatted text (has clean latin_full on first line)
      if (!dupes && formatted) {
        dupes = findDuplicates(formatted)
      }
      let dupeWarning = ''
      if (dupes && dupes.matches.length > 0) {
        const links = dupes.matches.map(m => {
          const gardenDisplay = m.garden.replace(/([a-zа-яё])([A-ZА-ЯЁ])/g, '$1 $2')
          const link = m.max_url || ''
          return `  • ${gardenDisplay || 'без сада'}, ${m.date}${link ? ` — ${link}` : ''}`
        }).join('\n')
        dupeWarning = `\n\n⚠️ ДУБЛИКАТ! Это растение уже есть в каталоге:\n${links}\n\nЕсли это обновлённые фото — публикуйте, при синхронизации старые фото заменятся на новые.`
      }

      let askText: string
      if (formatted) {
        askText = `✅ Заявка от ${target.userName} принята.${dupeWarning}\n\n🤖 Предложенный текст для канала:\n——————\n${formatted}\n——————\n\n📌 Что делать:\n• Текст устраивает → ответьте на это сообщение «ок»\n• Нужно поправить → ответьте на это сообщение своим вариантом текста`
      } else {
        askText = `✅ Заявка от ${target.userName} принята.${dupeWarning}\n\nОтветьте на это сообщение с текстом для публикации в канале.`
      }

      const askResult: any = await send(ADMIN_CHAT_ID, askText)
      const askMid = askResult?.message?.body?.mid
      if (askMid) {
        state.pendingPublish[askMid] = { photos, userName: target.userName, aiText: formatted || undefined } as any
        state.midMap[askMid] = { userId: target.userId, chatId: target.chatId, userName: target.userName }
      }

      saveState(state)
      log(`Accepted: ${target.userName} by ${name}, AI formatted: ${!!formatted}`)
      return
    }

    // "-" → отказ
    if (text.trim() === '-') {
      const userMsg = `🙏 Спасибо за вашу заявку! К сожалению, данное растение не подходит по нашим критериям.${NEXT_STEP}`
      await send(target.chatId, userMsg)
      await send(ADMIN_CHAT_ID, `❌ Заявка от ${target.userName} отклонена.`)
      saveState(state)
      log(`Rejected: ${target.userName} by ${name}`)
      return
    }

    // Check if this is a reply to a "publish text" request
    const pending = state.pendingPublish[replyMid] as any
    if (pending && text) {
      // "ок" → publish AI text; anything else → publish admin's text
      const isApprove = text.trim() === '+' || text.trim().toLowerCase() === 'ок' || text.trim().toLowerCase() === 'ok'
      const publishText = isApprove && pending.aiText ? pending.aiText : text

      const pubAttachments = pending.photos.map((url: string) => ({ type: 'image', payload: { url } }))
      await send(PROTECTED_CATALOG_ID, publishText, pubAttachments.length ? pubAttachments : undefined)
      await send(ADMIN_CHAT_ID, `📢 Опубликовано в канале «Территория хвойных».\nАвтор заявки: ${pending.userName}`)
      delete state.pendingPublish[replyMid]
      saveState(state)
      log(`Published to channel: ${publishText.substring(0, 50)} (${pending.photos.length} photos, from ${pending.userName})`)
      return
    }

    // Любой другой reply → пересылка пользователю
    const photos: any[] = []
    for (const att of (msg.body?.attachments || [])) {
      if (att.type === 'image') photos.push(att)
    }
    await send(target.chatId, text, photos.length ? photos : undefined)

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

  // ── Forward to admin chat ──
  const photos: string[] = []
  for (const att of (msg.body?.attachments || [])) {
    if (att.type === 'image' && att.payload?.url) photos.push(att.payload.url)
  }

  const userTag = username ? `@${username}` : ''
  let adminText = text || ''
  adminText += `\n\n👤 ${name}, ${userTag} (#ID${uid})`

  const attachments: any[] = photos.map(url => ({ type: 'image', payload: { url } }))

  const result: any = await send(ADMIN_CHAT_ID, adminText, attachments.length ? attachments : undefined)
  const mid = result?.message?.body?.mid
  if (mid) {
    state.midMap[mid] = { userId: uid, chatId, userName: name, photos }
    saveState(state)
  }

  log(`Forwarded from ${name}: ${photos.length} photos, ${text.substring(0, 40)}`)
}

// ── Logging ────────────────────────────────────────────────
function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`)
}

// ── Long polling ───────────────────────────────────────────
async function poll() {
  let marker: number | null = null
  log(`🌲 Bot "Леший" started → ADMIN_CHAT_ID=${ADMIN_CHAT_ID}`)

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
