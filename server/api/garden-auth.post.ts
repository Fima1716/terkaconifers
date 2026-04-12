/** Verify 6-digit garden code → create session → set cookie */
export default defineEventHandler(async (event) => {
  const { code } = await readBody(event)
  if (!code || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    throw createError({ statusCode: 400, message: 'Введите 6-значный код' })
  }

  const garden = verifyGardenCode(code)
  if (!garden) {
    throw createError({ statusCode: 401, message: 'Неверный или просроченный код' })
  }

  const token = createGardenSession(garden)
  setGardenCookie(event, token)

  return { ok: true, garden }
})
