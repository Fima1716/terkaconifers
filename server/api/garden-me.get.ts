/** Returns current garden access: admin mode or owner mode */
export default defineEventHandler(async (event) => {
  // Try JWT (admin)
  try {
    const user = await verifyToken(event)
    if (user && user.role === 'super_admin') {
      return { mode: 'admin', garden: null }
    }
  } catch {}

  // Try garden cookie (owner)
  const garden = getGardenFromCookie(event)
  if (garden) {
    return { mode: 'owner', garden }
  }

  throw createError({ statusCode: 401, message: 'Не авторизован' })
})
