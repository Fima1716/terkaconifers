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
interface BotState {
  consented: Record<string, boolean>
  banned: Record<string, boolean>
  midMap: Record<string, { userId: number; chatId: number; userName: string; photos?: string[] }>
  // Pending publication: admin accepted, waiting for edited text to post to catalog channel
  pendingPublish: Record<string, { photos: string[]; userName: string; aiText?: string }>
  // Pending edit: admin wants to edit a post in catalog channel
  pendingEdit: Record<string, { channelMid: string; plantId: number; url: string }>
  // Garden ownership: userId → { garden name, plant count }
  gardenOwners: Record<string, { garden: string; count: number }>
}

function loadState(): BotState {
  if (existsSync(STATE_FILE)) {
    try {
      const s = JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
      return { consented: s.consented || {}, banned: s.banned || {}, midMap: s.midMap || {}, pendingPublish: s.pendingPublish || {}, pendingEdit: s.pendingEdit || {}, gardenOwners: s.gardenOwners || {} }
    } catch {}
  }
  return { consented: {}, banned: {}, midMap: {}, pendingPublish: {}, pendingEdit: {}, gardenOwners: {} }
}

function saveState(s: BotState) {
  const midEntries = Object.entries(s.midMap)
  if (midEntries.length > 1000) s.midMap = Object.fromEntries(midEntries.slice(-1000))
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2))
}

const state = loadState()

// ── Dedup: skip already-processed updates ─────────────────
const processedMids = new Set<string>()
const MAX_DEDUP = 2000

function isDuplicate(mid: string): boolean {
  if (processedMids.has(mid)) return true
  processedMids.add(mid)
  if (processedMids.size > MAX_DEDUP) {
    const arr = [...processedMids]
    for (let i = 0; i < arr.length - MAX_DEDUP / 2; i++) processedMids.delete(arr[i])
  }
  return false
}

// ── Памятка (admin help topics) ───────────────────────────
const MEMO_TOPICS: Record<string, { title: string; text: string }> = {
  memo_flow: {
    title: '📨 Как приходят заявки',
    text: `📨 Как приходят заявки

Пользователь отправляет боту фото + описание растения → бот пересылает всё в «Корзину Терки» с фото и текстом.

💡 Сообщения с фото — это заявки.
Текстовые сообщения без фото — это дополнения/уточнения, не заявки.`,
  },
  memo_accept: {
    title: '✅ Принять / Отклонить',
    text: `✅❌ Принять / Отклонить / Ответить

Найдите сообщение с фото от бота и ответьте на него (зажать → «Ответить»):

✅ «+» → принять заявку
Бот возьмёт фото из этого сообщения, ИИ отформатирует текст и предложит вариант.

❌ «−» → отклонить заявку
Пользователь получит вежливый отказ.

💬 Любой другой текст → написать пользователю
Ваше сообщение будет переслано автору заявки от имени Лешего.

❗ Отвечайте + только на сообщение С ФОТО — именно оттуда берутся фотографии для публикации.`,
  },
  memo_after: {
    title: '📢 После принятия',
    text: `📢 После принятия (+)

Бот предложит отформатированный текст для канала:
• «ок» → опубликовать текст как есть
• свой текст → опубликовать ваш вариант

❗ Проверяйте текст от ИИ!
ИИ не всегда корректно обрабатывает информацию. Сверяйте с тем, что написал пользователь, и дополняйте важными деталями перед публикацией.`,
  },
  memo_edit: {
    title: '📝 Редактировать пост',
    text: `📝 Редактировать пост в канале

1. Найдите пост в канале «Территория хвойных. Каталог», скопируйте ссылку
2. Напишите в «Корзину Терки»:
   леший ССЫЛКА

Например: леший https://max.ru/id592005855318_biz/AZ1guYWCDXM

3. Бот найдёт пост и покажет текущий текст
4. Ответьте на сообщение бота новым текстом — бот заменит текст в канале
5. После замены бот пришлёт превью с фото и ссылкой

❗ Фото не меняются — редактируется только текст.
Изменения на сайте появятся на следующий день после ночной синхронизации.`,
  },
  memo_update: {
    title: '🔄 Обновить карточку',
    text: `🔄 Обновить карточку растения

Если растение выросло — заводим новую карточку:

1. Идём в бота
2. Отправляем новое фото + обновлённую информацию (новый возраст, размер и т.д.)
3. В Корзине проверяем текст
4. Публикуем как обычно

Пример: возраст 7–8 лет → обновляем до 10 лет.`,
  },
  memo_commands: {
    title: '🤖 Команды бота',
    text: `🤖 Команды бота

В «Корзине Терки»:
• памятка — эта справка
• леший ССЫЛКА — редактировать пост в канале
• /last — последние публикации
• /last 20 — показать 20 последних
• /удалить N — удалить публикацию №N из канала

В ЛС бота (пишет пользователь):
• /start — правила и согласие
• /help — справка
• мой сад — код для входа в личный кабинет`,
  },
}

function memoMenuAttachment() {
  return {
    type: 'inline_keyboard',
    payload: {
      buttons: [
        [
          { type: 'callback', text: '📨 Заявки', payload: 'memo_flow' },
          { type: 'callback', text: '✅ Принять/Отклонить', payload: 'memo_accept' },
        ],
        [
          { type: 'callback', text: '📢 После принятия', payload: 'memo_after' },
          { type: 'callback', text: '📝 Редактировать', payload: 'memo_edit' },
        ],
        [
          { type: 'callback', text: '🔄 Обновить карточку', payload: 'memo_update' },
          { type: 'callback', text: '🤖 Команды', payload: 'memo_commands' },
        ],
      ],
    },
  }
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

async function editMessage(mid: string, chatId: string | number, text: string, attachments?: any[]) {
  const body: any = { text }
  if (attachments) body.attachments = attachments
  const resp = await fetch(`${BASE_URL}/messages?message_id=${mid}&chat_id=${chatId}`, {
    method: 'PUT', headers: H, body: JSON.stringify(body),
  })
  return resp.ok
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

// ── Process updates ────────────────────────────────────────
async function process(update: any) {
  const type = update.update_type

  // IGNORE events from the catalog channel — bot must NEVER post there
  const eventChatId = update.message?.recipient?.chat_id || update.chat_id
  if (String(eventChatId) === PROTECTED_CATALOG_ID) return

  // Dedup: skip if we already processed this update
  // For callbacks, use callback_id (unique per click); for messages, use mid
  const dedupId = update.callback?.callback_id || update.message?.body?.mid || update.message?.mid || update.timestamp
  if (dedupId && isDuplicate(String(dedupId))) return

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

  // Callback buttons
  if (type === 'message_callback') {
    const cb = update.callback
    log(`Callback: payload=${cb?.payload}, mid=${update.message?.body?.mid}, chat=${update.message?.recipient?.chat_id || update.chat_id}`)
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
      return
    }
    // Памятка topic buttons — edit the same message in place
    const memoTopic = MEMO_TOPICS[cb?.payload]
    if (memoTopic) {
      const msgMid = update.message?.body?.mid
      const cbChatId = update.message?.recipient?.chat_id || update.chat_id
      await answerCallback(cb.callback_id)
      if (msgMid && cbChatId) {
        const ok = await editMessage(msgMid, cbChatId, memoTopic.text, [memoMenuAttachment()])
        log(`Memo edit: topic=${cb.payload}, mid=${msgMid}, ok=${ok}`)
      } else {
        log(`Memo edit SKIP: msgMid=${msgMid}, cbChatId=${cbChatId}`)
      }
      return
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

    // ── "памятка" — interactive admin help ──
    if (/^(леший\s+)?памятка$/i.test(text.trim())) {
      await send(ADMIN_CHAT_ID, '📋 Памятка Лешего\n\nВыберите тему:', [memoMenuAttachment()])
      log(`Memo requested by ${name}`)
      return
    }

    // ── "Леший ССЫЛКА": edit post in catalog channel ──
    const maxLinkMatch = /леший\s+(https?:\/\/max\.ru\/[^\s]+)/i.exec(text)
    if (maxLinkMatch) {
      const url = maxLinkMatch[1]
      // Extract short message ID (last path segment)
      const shortId = url.split('/').pop()
      if (shortId) {
        try {
          // 1. Try finding in local catalog first
          const catalogPath = resolve(ROOT, 'data/raw/catalog.json')
          const catalog = existsSync(catalogPath) ? JSON.parse(readFileSync(catalogPath, 'utf-8')) : []
          const plant = catalog.find((p: any) => p.max_url && p.max_url.includes(shortId))

          let channelMid = ''
          let currentText = ''
          let label = ''

          if (plant) {
            channelMid = plant._mid
            label = `${plant.latin_full} (id: ${plant._site_id})`
            // Reconstruct current text from catalog fields
            currentText = plant.latin_full || ''
            if (plant.name_ru) currentText += `\n${plant.name_ru}`
            currentText += '\n'
            if (plant.region) currentText += `\n${plant.region}`
            if (plant.age) currentText += `\nВозраст: ${plant.age}`
            if (plant.garden) currentText += `\n${plant.garden}`
            if (plant.hashtags?.length) currentText += `\n${plant.hashtags.map((h: string) => `#${h}`).join('\n')}`
          }

          // 2. Fallback: fetch recent messages from channel to find the post
          if (!channelMid) {
            await send(ADMIN_CHAT_ID, `🔍 Поста нет в каталоге, ищу в канале...`)
            let found = false
            let fromTs: number | null = null

            for (let page = 0; page < 5 && !found; page++) {
              const params = new URLSearchParams({ chat_id: PROTECTED_CATALOG_ID, count: '100' })
              if (fromTs) params.set('from', String(fromTs))
              const resp = await fetch(`${BASE_URL}/messages?${params}`, { headers: { Authorization: TOKEN } })
              if (!resp.ok) break
              const data: any = await resp.json()
              const messages = data.messages || []
              if (!messages.length) break

              for (const m of messages) {
                const msgUrl: string = m.url || m.link || ''
                if (msgUrl.includes(shortId)) {
                  channelMid = m.body?.mid || ''
                  currentText = m.body?.text || '(пустой текст)'
                  label = currentText.split('\n')[0] || 'пост'
                  found = true
                  break
                }
              }

              const lastTs = messages[messages.length - 1]?.timestamp
              if (!lastTs || messages.length < 100) break
              fromTs = lastTs - 1
              await new Promise(r => setTimeout(r, 200))
            }
          }

          if (channelMid) {
            const askText = `📝 Нашёл пост:\n——————\n${currentText}\n——————\n\n🆔 ${label}\n\n📌 Ответьте на ЭТО сообщение новым текстом — я заменю текст в канале.`
            const askResult: any = await send(ADMIN_CHAT_ID, askText)
            const askMid = askResult?.message?.body?.mid

            if (askMid) {
              state.midMap[askMid] = { userId: 0, chatId: 0, userName: '' }
              ;state.pendingEdit[askMid] = {
                channelMid,
                plantId: plant?._site_id || 0,
                url,
              }
              saveState(state)
            }
            log(`Edit request: ${label} by ${name}`)
          } else {
            await send(ADMIN_CHAT_ID, `⚠️ Пост не найден ни в каталоге, ни в последних 500 сообщениях канала.\nПроверьте ссылку.`)
          }
        } catch (e) {
          log(`Edit link error: ${e}`)
          await send(ADMIN_CHAT_ID, `❌ Ошибка при поиске поста: ${e}`)
        }
      }
      return
    }

    const replyMid = msg.link?.type === 'reply' ? msg.link.message?.mid : undefined
    if (!replyMid) return

    const target = state.midMap[replyMid]
    if (!target) return

    // ── Handle pending edit reply ──
    const pendingEdit = state.pendingEdit[replyMid]
    if (pendingEdit && text) {
      try {
        const editResp = await fetch(`${BASE_URL}/messages?message_id=${pendingEdit.channelMid}&chat_id=${PROTECTED_CATALOG_ID}`, {
          method: 'PUT', headers: H,
          body: JSON.stringify({ text }),
        })
        if (editResp.ok) {
          // Fetch the updated post from channel to show full preview with photos
          let preview = `✅ Текст поста обновлён!\n——————\n${text}\n——————\n🔗 ${pendingEdit.url}`
          let previewAttachments: any[] | undefined
          try {
            const msgResp = await fetch(`${BASE_URL}/messages?message_id=${pendingEdit.channelMid}`, {
              headers: { Authorization: TOKEN },
            })
            if (msgResp.ok) {
              const msgData: any = await msgResp.json()
              const m = msgData.message || msgData
              const photos: any[] = []
              for (const att of (m.body?.attachments || [])) {
                if (att.type === 'image' && att.payload?.url) {
                  photos.push({ type: 'image', payload: { url: att.payload.url } })
                }
              }
              if (photos.length) previewAttachments = photos
            }
          } catch {}
          await send(ADMIN_CHAT_ID, preview, previewAttachments)
          log(`Edited post: ${pendingEdit.plantId} by ${name}`)
        } else {
          const err = await editResp.text()
          await send(ADMIN_CHAT_ID, `❌ Не удалось отредактировать: ${editResp.status}\n${err}`)
        }
      } catch (e) {
        await send(ADMIN_CHAT_ID, `❌ Ошибка: ${e}`)
      }
      delete state.pendingEdit[replyMid]
      delete state.midMap[replyMid]
      saveState(state)
      return
    }

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
      const photos = (target as any).photos || []

      // Guard: don't accept messages without photos
      if (!photos.length) {
        await send(ADMIN_CHAT_ID, `⚠️ В этом сообщении нет фото. Ответьте + на сообщение с фото от ${target.userName}.`)
        return
      }

      const userMsg = `✅ Ваше фото принято! Спасибо за вклад в каталог «Территория хвойных».${NEXT_STEP}`
      await send(target.chatId, userMsg)

      // Get original message text from the forwarded message (via reply chain)
      const origText = msg.link?.message?.text || msg.link?.message?.body?.text || ''
      log(`  origText for dupe check: "${origText.substring(0, 80)}..."`)

      // AI formatting
      const formatted = origText ? await formatWithAI(origText) : null

      // Triple duplicate check: raw text → AI text → catalog + recent publications + pending
      let dupeResult = findAllDuplicates(origText)
      if (!dupeResult && formatted) dupeResult = findAllDuplicates(formatted)
      const submittedGarden = formatted ? extractGarden(formatted) : ''
      const dupeWarning = dupeResult ? formatDupeWarning(dupeResult.matches, submittedGarden) : ''

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

      // Track garden ownership: userId → garden name
      const gardenName = extractGarden(publishText)
      if (gardenName && target.userId) {
        const gardenDisplay = gardenName.replace(/([a-zа-яё])([A-ZА-ЯЁ])/g, '$1 $2') // "РусиновСад" → "Русинов Сад"
        const uidStr = String(target.userId)
        const existing = state.gardenOwners[uidStr]
        if (existing && existing.garden === gardenDisplay) {
          existing.count++
        } else if (!existing) {
          state.gardenOwners[uidStr] = { garden: gardenDisplay, count: 1 }
        }
        // Suggest garden management at 30+ plants
        if (state.gardenOwners[uidStr]?.count === 30) {
          await send(target.chatId,
            `🎉 У вас уже 30 растений в каталоге!\n\n` +
            `Вы можете управлять своим садом на сайте terkaconifers.ru — вести дневник роста, добавлять фото и замеры.\n\n` +
            `Напишите мне «мой сад» чтобы получить код для входа.`)
        }
      }

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

  // "мой сад" — generate garden access code
  if (/^мой сад$/i.test(text.trim())) {
    const uidStr = String(uid)
    const ownership = state.gardenOwners[uidStr]
    if (ownership && ownership.garden) {
      // Generate 6-digit code
      const CODES_PATH = resolve(ROOT, 'data/garden-codes.json')
      let codes: any[] = []
      if (existsSync(CODES_PATH)) try { codes = JSON.parse(readFileSync(CODES_PATH, 'utf-8')) } catch {}
      codes = codes.filter((c: any) => c.expiresAt > Date.now())
      codes = codes.filter((c: any) => c.garden !== ownership.garden) // remove old codes for this garden
      const code = String(Math.floor(100000 + Math.random() * 900000))
      codes.push({ code, garden: ownership.garden, expiresAt: Date.now() + 15 * 60 * 1000 })
      writeFileSync(CODES_PATH, JSON.stringify(codes, null, 2))

      await send(chatId, `🌲 Ваш сад: «${ownership.garden}» (${ownership.count} растений)\n\n🔑 Код для входа: ${code}\n\nВведите его на terkaconifers.ru/my-garden\nКод действует 15 минут.`)
      log(`Garden code generated: ${ownership.garden} for uid ${uidStr}`)
    } else {
      await send(chatId, '🤔 Не нашёл ваш сад. Отправьте заявки с растениями через бота — после публикации ваш сад появится автоматически.')
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

  // Add admin instructions to forwarded message
  if (photos.length > 0) {
    adminText += `\n\n📌 Ответьте на ЭТО сообщение:\n  +  принять (фото возьмутся отсюда, текст обработает ИИ)\n  −  отклонить\n  текст — написать пользователю`
  } else {
    adminText += `\n\n💬 Это текстовое сообщение (без фото). Для принятия заявки ответьте + на сообщение с фото.`
  }

  const result: any = await send(ADMIN_CHAT_ID, adminText, attachments.length ? attachments : undefined)
  const mid = result?.message?.body?.mid
  if (mid) {
    state.midMap[mid] = { userId: uid, chatId, userName: name, photos }
    saveState(state)
  }

  // Confirm to user
  if (photos.length > 0) {
    await send(chatId, '📋 Заявка получена! Администраторы рассмотрят и ответят вам здесь.')
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
