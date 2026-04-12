export default defineEventHandler(async (event) => {
  const access = await requireGardenAccess(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)

  // Special action: mark as done
  if (body._action === 'done') {
    const schedule = markScheduleDone(access.storageKey, id)
    if (!schedule) throw createError({ statusCode: 404, message: 'Расписание не найдено' })
    return { schedule }
  }

  const schedule = updateCareSchedule(access.storageKey, id, body)
  if (!schedule) throw createError({ statusCode: 404, message: 'Расписание не найдено' })
  return { schedule }
})
