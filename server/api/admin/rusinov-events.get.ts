import { readFileSync, existsSync } from 'fs'

export default defineEventHandler(async (event) => {
  await requireAuth(event, 'super_admin')

  const query = getQuery(event)
  const limit = Math.min(Number(query.limit) || 100, 500)
  const platform = query.platform as string | undefined
  const type = query.type as string | undefined

  const paths = [
    '/var/www/rusadovich/data/bot-stats.jsonl',
    process.cwd() + '/rusinovich/data/bot-stats.jsonl',
  ]

  let basePath = ''
  for (const p of paths) {
    if (existsSync(p)) { basePath = p; break }
  }

  if (!basePath) return { events: [] }

  let events: any[] = []
  const files = [basePath + '.old', basePath]
  for (const f of files) {
    if (!existsSync(f)) continue
    try {
      const lines = readFileSync(f, 'utf-8').split('\n').filter(l => l.trim())
      for (const line of lines) {
        try {
          const ev = JSON.parse(line)
          if (platform && ev.platform !== platform) continue
          if (type && ev.type !== type) continue
          events.push(ev)
        } catch {}
      }
    } catch {}
  }

  return { events: events.slice(-limit).reverse() }
})
