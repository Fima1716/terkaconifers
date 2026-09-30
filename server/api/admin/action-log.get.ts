export default defineEventHandler(async (event) => {
  await requireAuth(event, 'super_admin')

  const q = getQuery(event)
  return readActionLog({
    page: parseInt(String(q.page || '1')),
    limit: parseInt(String(q.limit || '50')),
    user: q.user ? String(q.user) : undefined,
    action: q.action ? String(q.action) : undefined,
    search: q.search ? String(q.search) : undefined,
  })
})
