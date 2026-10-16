export default defineEventHandler(async (event) => {
  const currentUser = await requireAuth(event, 'super_admin')
  const username = getRouterParam(event, 'username')

  if (username === currentUser.sub) {
    throw createError({ statusCode: 400, message: 'Нельзя удалить себя' })
  }

  const users = loadUsers()
  const idx = users.findIndex(u => u.username === username)
  if (idx < 0) throw createError({ statusCode: 404, message: 'Пользователь не найден' })

  const removed = users[idx]
  users.splice(idx, 1)
  saveUsers(users)
  logFor(event, currentUser, 'user.delete', {
    targetId: username,
    title: removed.displayName || username,
  })

  return { ok: true }
})
