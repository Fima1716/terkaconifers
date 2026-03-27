export default defineEventHandler(async (event) => {
  const currentUser = await requireAuth(event, 'super_admin')
  const username = getRouterParam(event, 'username')

  if (username === currentUser.sub) {
    throw createError({ statusCode: 400, message: 'Нельзя удалить себя' })
  }

  const users = loadUsers()
  const idx = users.findIndex(u => u.username === username)
  if (idx < 0) throw createError({ statusCode: 404, message: 'Пользователь не найден' })

  users.splice(idx, 1)
  saveUsers(users)

  return { ok: true }
})
