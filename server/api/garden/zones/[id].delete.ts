export default defineEventHandler(async (event) => {
  const access = await requireGardenAccess(event)
  const id = getRouterParam(event, 'id')!
  const ok = deleteGardenZone(access.storageKey, id)
  if (!ok) throw createError({ statusCode: 404, message: 'Зона не найдена' })
  return { ok: true }
})
