import { readFileSync, existsSync } from 'fs'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const limit = Math.min(Number(query.limit) || 50, 200)

  const paths = [
    '/var/www/rusadovich/data/bot-stats.jsonl',
    process.cwd() + '/rusinovich/data/bot-stats.jsonl',
  ]

  let basePath = ''
  for (const p of paths) {
    if (existsSync(p)) { basePath = p; break }
  }

  if (!basePath) return { errors: [] }

  const errors: any[] = []
  const files = [basePath + '.old', basePath]
  for (const f of files) {
    if (!existsSync(f)) continue
    try {
      const lines = readFileSync(f, 'utf-8').split('\n').filter(l => l.trim())
      for (const line of lines) {
        try {
          const ev = JSON.parse(line)
          if (ev.type === 'error') errors.push(ev)
        } catch {}
      }
    } catch {}
  }

  return { errors: errors.slice(-limit).reverse() }
})
