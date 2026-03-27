import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'

const DATA_PATH = resolve(process.cwd(), 'data/exchange.json')

// Simple rate limit
const lastPost = new Map<string, number>()

export default defineEventHandler(async (event) => {
  const ip = getHeader(event, 'x-real-ip') || getHeader(event, 'x-forwarded-for') || 'unknown'
  const now = Date.now()
  if (lastPost.has(ip) && now - lastPost.get(ip)! < 60000) {
    throw createError({ statusCode: 429, message: 'Подождите минуту перед следующим объявлением' })
  }

  const body = await readBody(event)
  const type = String(body.type || '').trim()
  const plantName = String(body.plantName || '').trim().slice(0, 200)
  const region = String(body.region || '').trim().slice(0, 100)
  const contact = String(body.contact || '').trim().slice(0, 100)
  const description = String(body.description || '').trim().slice(0, 500)

  if (!['looking', 'offering'].includes(type)) throw createError({ statusCode: 400, message: 'Укажите тип объявления' })
  if (!plantName) throw createError({ statusCode: 400, message: 'Укажите название растения' })
  if (!contact) throw createError({ statusCode: 400, message: 'Укажите контакт' })

  let data = { posts: [] as any[], nextId: 1 }
  if (existsSync(DATA_PATH)) {
    data = JSON.parse(readFileSync(DATA_PATH, 'utf-8'))
  }

  const post = {
    id: data.nextId,
    type,
    plantName,
    region,
    contact,
    description,
    createdAt: new Date().toISOString(),
  }

  data.posts.push(post)
  data.nextId++

  const dir = dirname(DATA_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(DATA_PATH, JSON.stringify(data, null, 2))

  lastPost.set(ip, now)
  return { ok: true, post }
})
