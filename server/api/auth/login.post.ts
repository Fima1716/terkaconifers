export default defineEventHandler(async (event) => {
  const ip = getRequestIP(event) || 'unknown'
  if (!checkRateLimit(ip)) {
    throw createError({ statusCode: 429, message: 'Слишком много попыток. Подождите 15 минут.' })
  }

  const { username, password } = await readBody(event)
  if (!username || !password) {
    throw createError({ statusCode: 400, message: 'Укажите имя пользователя и пароль' })
  }

  const user = findUser(username)
  if (!user || !verifyPassword(password, user.passwordHash, user.salt)) {
    throw createError({ statusCode: 401, message: 'Неверное имя пользователя или пароль' })
  }

  // Update last login
  const users = loadUsers()
  const idx = users.findIndex(u => u.username === username)
  if (idx >= 0) {
    users[idx].lastLogin = new Date().toISOString()
    saveUsers(users)
  }

  resetRateLimit(ip)

  const token = await signToken(user)
  setAuthCookie(event, token)

  return { user: toPublic(user) }
})
