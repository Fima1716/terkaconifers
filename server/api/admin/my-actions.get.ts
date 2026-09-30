/** Личная лента правок — доступна самому админу/менеджеру, без прав на общий журнал */
export default defineEventHandler(async (event) => {
  const user = await requireContentEditor(event)

  const q = getQuery(event)
  const limit = Math.min(50, Math.max(1, parseInt(String(q.limit || '8'))))

  const { entries, total } = readActionLog({ user: user.sub, limit, page: 1 })

  // Сколько правок за последние 7 дней
  const weekAgo = Date.now() - 7 * 86400_000
  const week = readActionLog({ user: user.sub, limit: 200, page: 1 })
    .entries.filter(e => e.action !== 'auth.login' && new Date(e.ts).getTime() >= weekAgo).length

  return { entries, total, week }
})
