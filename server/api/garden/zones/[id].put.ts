export default defineEventHandler(async (event) => {
  const access = await requireGardenAccess(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const zone = updateGardenZone(access.storageKey, id, body)
  if (!zone) throw createError({ statusCode: 404, message: 'Зона не найдена' })
  return { zone }
})
