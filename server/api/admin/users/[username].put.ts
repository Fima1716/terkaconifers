export default defineEventHandler(async (event) => {
  await requireAuth(event, 'super_admin')

  const username = getRouterParam(event, 'username')
  const { displayName, role, gardens, password } = await readBody(event)

  const users = loadUsers()
  const idx = users.findIndex(u => u.username === username)
  if (idx < 0) throw createError({ statusCode: 404, message: 'Пользователь не найден' })

  if (displayName !== undefined) users[idx].displayName = displayName
  if (role !== undefined) users[idx].role = role === 'super_admin' ? 'super_admin' : 'admin'
  if (gardens !== undefined) users[idx].gardens = Array.isArray(gardens) ? gardens : []

  // Reset password if provided
  if (password && password.length >= 4) {
    const { hash, salt } = hashPassword(password)
    users[idx].passwordHash = hash
    users[idx].salt = salt
  }

  saveUsers(users)
  return { user: toPublic(users[idx]) }
})
