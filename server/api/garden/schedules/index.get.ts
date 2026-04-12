export default defineEventHandler(async (event) => {
  const access = await requireGardenAccess(event)
  const garden = loadGarden(access.storageKey)
  return { schedules: garden.schedules }
})
