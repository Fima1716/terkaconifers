export default defineEventHandler(async (event) => {
  const access = await requireGardenAccess(event)
  const body = await readBody(event)
  if (!body.plantId || !body.type || !body.intervalDays) {
    throw createError({ statusCode: 400, message: 'plantId, type, intervalDays обязательны' })
  }
  const schedule = addCareSchedule(access.storageKey, {
    plantId: body.plantId,
    type: body.type,
    name: body.name || '',
    intervalDays: Number(body.intervalDays),
    lastDone: body.lastDone || null,
    notes: body.notes || '',
    active: body.active !== false,
  })
  return { schedule }
})
