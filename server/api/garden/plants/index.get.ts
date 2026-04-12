export default defineEventHandler(async (event) => {
  const access = await requireGardenAccess(event)

  if (!access.isAdmin) {
    // Owner: plants come from catalog, merged with any saved overrides
    const catalogPlants = loadCatalogPlantsForGarden(access.garden)
    const saved = loadGarden(access.storageKey)
    // Merge saved overrides (status, zone, notes, etc.) into catalog plants
    const overrides = new Map(saved.plants.map(p => [p.id, p]))
    const plants = catalogPlants.map(cp => {
      const ov = overrides.get(cp.id)
      return ov ? { ...cp, ...ov, catalogId: cp.catalogId, manualName: cp.manualName, manualSpecies: cp.manualSpecies } : cp
    })
    return { plants }
  }

  // Admin: existing behavior
  const garden = loadGarden(access.storageKey)
  return { plants: garden.plants }
})
