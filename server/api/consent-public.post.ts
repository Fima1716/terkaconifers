import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const GARDENS_FILE = resolve(process.cwd(), 'data/gardens.json')

// Load .env for MAX bot credentials
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

async function notifyAdmins(text: string) {
  if (!MAX_TOKEN) return
  try {
    await fetch(`https://platform-api.max.ru/messages?chat_id=${ADMIN_CHAT_ID}`, {
      method: 'POST',
      headers: { Authorization: MAX_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
  } catch {}
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const gardenName = body.garden?.trim()
  const action = body.action || (body.agreed === false ? 'decline' : 'agree') // agree | decline | revoke

  if (!gardenName) {
    throw createError({ statusCode: 400, message: 'garden обязателен' })
  }

  let data: any = { gardens: {} }
  if (existsSync(GARDENS_FILE)) {
    try { data = JSON.parse(readFileSync(GARDENS_FILE, 'utf-8')) } catch {}
  }
  if (!data.gardens) data.gardens = {}
  if (!data.gardens[gardenName]) data.gardens[gardenName] = {}

  if (action === 'agree') {
    data.gardens[gardenName].consent = true
    data.gardens[gardenName].consentAt = new Date().toISOString()
    data.gardens[gardenName].consentSource = 'deeplink'
    writeFileSync(GARDENS_FILE, JSON.stringify(data, null, 2))

    await notifyAdmins(`✅ Согласие получено: ${gardenName}\nИсточник: deeplink-страница`)

    return { ok: true, action: 'agreed' }
  }

  if (action === 'decline') {
    data.gardens[gardenName].consent = false
    data.gardens[gardenName].consentAt = new Date().toISOString()
    data.gardens[gardenName].consentSource = 'deeplink'
    writeFileSync(GARDENS_FILE, JSON.stringify(data, null, 2))

    await notifyAdmins(`❌ Согласие отклонено: ${gardenName}\nИсточник: deeplink-страница`)

    return { ok: true, action: 'declined' }
  }

  if (action === 'revoke') {
    await notifyAdmins(`🔄 Запрос на отзыв публикации: ${gardenName}\n\nВладелец сада просит убрать сад с сайта. Проверьте и снимите галочку в Согласиях если подтвердите.`)
    return { ok: true, action: 'revoke_requested' }
  }

  if (action === 'contact') {
    const name = body.name?.trim() || 'Не указано'
    const contact = body.contact?.trim()
    const message = body.message?.trim()
    if (!contact || !message) throw createError({ statusCode: 400, message: 'Заполните контакт и сообщение' })

    await notifyAdmins(`📩 Сообщение от владельца сада\n\n🏡 Сад: ${gardenName}\n👤 Имя: ${name}\n📱 Контакт: ${contact}\n\n💬 ${message}`)
    return { ok: true, action: 'contact_sent' }
  }

  throw createError({ statusCode: 400, message: 'Неизвестное действие' })
})
