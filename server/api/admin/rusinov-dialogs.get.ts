import { readFileSync, existsSync } from 'fs'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const userId = query.userId as string | undefined
  const platform = query.platform as string | undefined

  const paths = [
    '/var/www/rusadovich/data/bot-stats.jsonl',
    process.cwd() + '/rusinovich/data/bot-stats.jsonl',
  ]

  let basePath = ''
  for (const p of paths) {
    if (existsSync(p)) { basePath = p; break }
  }

  if (!basePath) return { dialogs: [], users: [] }

  // Read all events
  let events: any[] = []
  const files = [basePath + '.old', basePath]
  for (const f of files) {
    if (!existsSync(f)) continue
    try {
      const lines = readFileSync(f, 'utf-8').split('\n').filter(l => l.trim())
      for (const line of lines) {
        try { events.push(JSON.parse(line)) } catch {}
      }
    } catch {}
  }

  // If specific user requested — return their dialog
  if (userId) {
    const userEvents = events
      .filter(e => e.userId === userId && (!platform || e.platform === platform))
      .sort((a, b) => a.ts - b.ts)
    return { dialog: userEvents }
  }

  // Otherwise return list of users with message counts
  const users = new Map<string, { userId: string; userName: string; platform: string; messageCount: number; lastTs: number; lastQuery: string }>()
  for (const ev of events) {
    if (!ev.userId || ev.type !== 'message') continue
    const key = `${ev.platform}_${ev.userId}`
    const existing = users.get(key)
    if (existing) {
      existing.messageCount++
      if (ev.ts > existing.lastTs) {
        existing.lastTs = ev.ts
        existing.lastQuery = ev.query || ''
        if (ev.userName) existing.userName = ev.userName
      }
    } else {
      users.set(key, {
        userId: ev.userId,
        userName: ev.userName || ev.userId,
        platform: ev.platform,
        messageCount: 1,
        lastTs: ev.ts,
        lastQuery: ev.query || '',
      })
    }
  }

  const sorted = [...users.values()].sort((a, b) => b.lastTs - a.lastTs)
  return { users: sorted }
})
