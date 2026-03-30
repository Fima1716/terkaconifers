import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// Load .env
const envPath = resolve(process.cwd(), '.env')
const envVars: Record<string, string> = {}
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) envVars[m[1].trim()] = m[2].trim()
  }
}
const MAX_TOKEN = envVars.MAX_BOT_TOKEN || ''
const ADMIN_CHAT_ID = envVars.ADMIN_CHAT_ID || '-72548188058297'

// Rate limiting: 1 message per IP per 5 minutes
const rateMap = new Map<string, number>()

export default defineEventHandler(async (event) => {
  const ip = getRequestHeader(event, 'x-real-ip') || getRequestHeader(event, 'x-forwarded-for') || 'unknown'
  const now = Date.now()
  const last = rateMap.get(ip) || 0
  if (now - last < 5 * 60 * 1000) {
    throw createError({ statusCode: 429, message: 'Подождите 5 минут перед повторной отправкой' })
  }

  const body = await readBody(event)
  const garden = body.garden?.trim()
  const name = body.name?.trim() || 'Не указано'
  const contact = body.contact?.trim()
  const requestType = body.requestType?.trim() || 'Другое'
  const message = body.message?.trim()

  if (!garden) throw createError({ statusCode: 400, message: 'Не указан сад' })
  if (!contact) throw createError({ statusCode: 400, message: 'Укажите контакт для связи' })
  if (!message) throw createError({ statusCode: 400, message: 'Напишите сообщение' })

  rateMap.set(ip, now)

  // Clean old entries
  if (rateMap.size > 1000) {
    for (const [k, v] of rateMap) {
      if (now - v > 10 * 60 * 1000) rateMap.delete(k)
    }
  }

  const typeEmoji: Record<string, string> = {
    'edit': '✏️ Изменить информацию',
    'photos': '📷 Обновить фото',
    'remove': '🗑 Убрать сад с сайта',
    'other': '💬 Другой вопрос',
  }

  const text = `📩 Обращение по саду

🏡 Сад: ${garden}
📋 Тип: ${typeEmoji[requestType] || requestType}
👤 Имя: ${name}
📱 Контакт: ${contact}

💬 Сообщение:
${message}`

  if (MAX_TOKEN) {
    try {
      await fetch(`https://platform-api.max.ru/messages?chat_id=${ADMIN_CHAT_ID}`, {
        method: 'POST',
        headers: { Authorization: MAX_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
    } catch {}
  }

  return { ok: true }
})
