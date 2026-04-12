export default defineEventHandler(async (event) => {
  const access = await requireGardenAccess(event)
  return getTodayTasks(access.storageKey)
})
