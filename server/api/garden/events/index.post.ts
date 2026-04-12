export default defineEventHandler(async (event) => {
  const access = await requireGardenAccess(event)
  const body = await readBody(event)
  if (!body.plantId || !body.type || !body.date) {
    throw createError({ statusCode: 400, message: 'plantId, type, date обязательны' })
  }
  const gardenEvent = addGardenEvent(access.storageKey, {
    plantId: body.plantId,
    type: body.type,
    date: body.date,
    height: body.height,
    width: body.width,
    trunkDiameter: body.trunkDiameter,
    product: body.product,
    dosage: body.dosage,
    problemType: body.problemType,
    severity: body.severity,
    photoUrl: body.photoUrl,
    text: body.text,
  })
  return { event: gardenEvent }
})
