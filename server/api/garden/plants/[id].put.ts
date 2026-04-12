export default defineEventHandler(async (event) => {
  const access = await requireGardenAccess(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)

  const plant = updateGardenPlant(access.storageKey, id, body)
  if (!plant) throw createError({ statusCode: 404, message: 'Растение не найдено' })

  return { plant }
})
