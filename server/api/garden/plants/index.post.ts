export default defineEventHandler(async (event) => {
  const access = await requireGardenAccess(event)
  if (!access.isAdmin) throw createError({ statusCode: 403, message: 'Растения берутся из каталога' })
  const body = await readBody(event)

  const plant = addGardenPlant(access.storageKey, {
    catalogId: body.catalogId ?? null,
    nickname: body.nickname || '',
    status: body.status || 'growing',
    zone: body.zone || '',
    plantedAt: body.plantedAt || '',
    source: body.source || '',
    pricePaid: body.pricePaid ?? null,
    notes: body.notes || '',
    manualName: body.manualName || '',
    manualSpecies: body.manualSpecies || '',
  })

  return { plant }
})
