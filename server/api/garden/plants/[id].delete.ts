export default defineEventHandler(async (event) => {
  const access = await requireGardenAccess(event)
  if (!access.isAdmin) throw createError({ statusCode: 403, message: 'Растения берутся из каталога' })
  const id = getRouterParam(event, 'id')!

  const ok = deleteGardenPlant(access.storageKey, id)
  if (!ok) throw createError({ statusCode: 404, message: 'Растение не найдено' })

  return { ok: true }
})
