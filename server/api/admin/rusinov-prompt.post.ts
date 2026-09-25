import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

export default defineEventHandler(async (event) => {
  await requireAuth(event, 'super_admin')

  const body = await readBody(event)
  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, message: 'Invalid body' })
  }

  const dataPath = join(process.cwd(), 'data', 'rusinov-prompt.json')

  // Validate structure
  const config = {
    role: String(body.role || ''),
    tone: String(body.tone || ''),
    rules: Array.isArray(body.rules) ? body.rules.map((r: any) => ({
      enabled: Boolean(r.enabled),
      text: String(r.text || ''),
    })) : [],
    fallbackResponse: String(body.fallbackResponse || ''),
    catalogLinks: Array.isArray(body.catalogLinks) ? body.catalogLinks.map((l: any) => ({
      category: String(l.category || ''),
      url: String(l.url || ''),
    })) : [],
    knowledgeBase: String(body.knowledgeBase || ''),
    greeting: String(body.greeting || ''),
    maxLength: Number(body.maxLength) || 1500,
  }

  await writeFile(dataPath, JSON.stringify(config, null, 2), 'utf-8')
  return { ok: true }
})
