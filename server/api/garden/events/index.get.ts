export default defineEventHandler(async (event) => {
  const access = await requireGardenAccess(event)
  const query = getQuery(event)
  const plantId = query.plantId as string
  if (!plantId) throw createError({ statusCode: 400, message: 'plantId обязателен' })
  return { events: getPlantEvents(access.storageKey, plantId) }
})
