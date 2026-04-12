export default defineEventHandler(async (event) => {
  const access = await requireGardenAccess(event)
  const body = await readBody(event)
  if (!body.name) throw createError({ statusCode: 400, message: 'name обязателен' })
  const zone = addGardenZone(access.storageKey, {
    name: body.name,
    description: body.description || '',
    light: body.light,
    moisture: body.moisture,
    soil: body.soil,
  })
  return { zone }
})
