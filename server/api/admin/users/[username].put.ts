export default defineEventHandler(async (event) => {
  const currentUser = await requireAuth(event, 'super_admin')

  const username = getRouterParam(event, 'username')
  const { displayName, role, gardens, password } = await readBody(event)

  const users = loadUsers()
  const idx = users.findIndex(u => u.username === username)
  if (idx < 0) throw createError({ statusCode: 404, message: 'Пользователь не найден' })

  const before = { ...users[idx], gardens: (users[idx].gardens || []).join(', ') }

  if (displayName !== undefined) users[idx].displayName = displayName
  if (role !== undefined) users[idx].role = normalizeRole(role)
  if (gardens !== undefined) users[idx].gardens = Array.isArray(gardens) ? gardens : []

  // Reset password if provided
  if (password && password.length >= 4) {
    const { hash, salt } = hashPassword(password)
    users[idx].passwordHash = hash
    users[idx].salt = salt
  }

  saveUsers(users)

  const changes = diffFields(before, {
    displayName: users[idx].displayName,
    role: users[idx].role,
    gardens: (users[idx].gardens || []).join(', '),
  }, ['displayName', 'role', 'gardens'])
  if (password && password.length >= 4) changes.push({ field: 'password', to: 'перевыдан' })
  logFor(event, currentUser, 'user.update', {
    targetId: username,
    title: users[idx].displayName || username,
    changes,
  })

  return { user: toPublic(users[idx]) }
})
