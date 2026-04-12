export default defineEventHandler(async (event) => {
  const access = await requireGardenAccess(event)
  const id = getRouterParam(event, 'id')!
  const ok = deleteGardenEvent(access.storageKey, id)
  if (!ok) throw createError({ statusCode: 404, message: 'Событие не найдено' })
  return { ok: true }
})
