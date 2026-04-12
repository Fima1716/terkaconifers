export default defineEventHandler(async (event) => {
  const access = await requireGardenAccess(event)
  const id = getRouterParam(event, 'id')!
  const ok = deleteCareSchedule(access.storageKey, id)
  if (!ok) throw createError({ statusCode: 404, message: 'Расписание не найдено' })
  return { ok: true }
})
