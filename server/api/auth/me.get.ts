export default defineEventHandler(async (event) => {
  const payload = await verifyToken(event)
  if (!payload) throw createError({ statusCode: 401, message: 'Не авторизован' })

  // Re-check user still exists and return fresh data
  const user = findUser(payload.sub)
  if (!user) {
    clearAuthCookie(event)
    throw createError({ statusCode: 401, message: 'Пользователь не найден' })
  }

  return { user: toPublic(user) }
})
