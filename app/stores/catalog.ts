import { defineStore } from 'pinia'
import Fuse from 'fuse.js'

let fuseInstance: Fuse<Plant> | null = null

export interface GrowingConditions {
  light?: 'full_sun' | 'partial_shade' | 'shade'
  moisture?: 'loves_water' | 'moderate' | 'drought_tolerant'
  wind?: 'wind_resistant' | 'needs_shelter'
  winter?: 'needs_cover' | 'hardy'
  soil?: ('any' | 'acidic' | 'alkaline' | 'well_drained')[]
}

export interface Plant {
  id: number
  genus: string
  genus_ru: string
  species: string
  cultivar: string
  cultivar_ru: string
  latin_full: string
  photos: string[]
  thumbs: string[]
  date: string
  species_full: string
  species_ru: string
  form: string | null
  form_ru: string | null
  color: string | null
  color_ru: string | null
  region_normalized: string
  region_district: string
  garden_display: string
  garden_type_ru: string
  age_min: number | null
  age_max: number | null
  age_display: string
  size_display: string
  originator: string
  is_russian_enriched: boolean
  is_new: boolean
  price?: number | null
  old_price?: number | null
  status?: string
  price_note?: string
  conditions?: GrowingConditions
}

export interface Genus { value: string; label: string; count: number; cover_thumb: string }
export interface FilterOption { value: string; label: string; count: number; swatch?: string | null; latin?: string }

export interface Filters {
  genera: Genus[]
  species: Record<string, FilterOption[]>
  forms: FilterOption[]
  colors: (FilterOption & { swatch: string | null })[]
  hardiness: { value: number; label: string; count: number }[]
  regions: { value: string; count: number }[]
  gardenTypes: FilterOption[]
  ageRanges: FilterOption[]
  russianCount: number
}

export interface ActiveFilters {
  genus: string[]
  species: string
  cultivar: string
  form: string
  color: string
  hardiness: number | null
  region: string
  garden: string
  isRussian: boolean
  onlyNew: boolean
  inStock: boolean
  ageRange: string
  search: string
  sort: 'date_desc' | 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc'
}

// Helper: apply all filters EXCEPT the one named `exclude`
function applyFilters(plants: Plant[], f: ActiveFilters, exclude?: string): Plant[] {
  if (f.search && f.search.length >= 2 && fuseInstance && exclude !== 'search') {
    plants = fuseInstance.search(f.search, { limit: 500 }).map(r => r.item)
  }
  if (f.genus.length > 0 && exclude !== 'genus') {
    plants = plants.filter(p => f.genus.includes(p.genus))
  }
  if (f.species && exclude !== 'species') {
    plants = plants.filter(p => p.species === f.species)
  }
  if (f.cultivar && exclude !== 'cultivar') {
    // Match by cultivar name + species (not exact latin_full, to handle formatting differences)
    const [cv, sp] = f.cultivar.split('||')
    if (sp) {
      plants = plants.filter(p => p.cultivar === cv && p.species_full === sp)
    } else {
      plants = plants.filter(p => p.latin_full === f.cultivar)
    }
  }
  if (f.form && exclude !== 'form') {
    plants = plants.filter(p => p.form === f.form)
  }
  if (f.color && exclude !== 'color') {
    plants = plants.filter(p => p.color === f.color)
  }
  if (f.hardiness !== null && exclude !== 'hardiness') {
    plants = plants.filter(p => p.hardiness_zone === f.hardiness)
  }
  if (f.region && exclude !== 'region') {
    plants = plants.filter(p => p.region_normalized === f.region)
  }
  if (f.garden && exclude !== 'garden') {
    plants = plants.filter(p => p.garden_display === f.garden)
  }
  if (f.isRussian && exclude !== 'isRussian') {
    plants = plants.filter(p => p.is_russian_enriched)
  }
  if (f.onlyNew && exclude !== 'onlyNew') {
    plants = plants.filter(p => p.is_new)
  }
  if (f.inStock && exclude !== 'inStock') {
    plants = plants.filter(p => p.status === 'in_stock')
  }
  if (f.ageRange && exclude !== 'ageRange') {
    const [minStr, maxStr] = f.ageRange.split('-')
    const min = parseInt(minStr)
    const max = maxStr === '+' ? 999 : parseInt(maxStr || minStr)
    plants = plants.filter(p => {
      if (p.age_min === null) return false
      return p.age_min >= min && (p.age_max ?? p.age_min) <= max
    })
  }
  return plants
}

function countBy<T>(arr: Plant[], key: (p: Plant) => T): Map<T, number> {
  const map = new Map<T, number>()
  for (const p of arr) {
    const v = key(p)
    if (v != null) map.set(v, (map.get(v) || 0) + 1)
  }
  return map
}

export const useCatalogStore = defineStore('catalog', {
  state: () => ({
    catalog: [] as Plant[],
    filters: null as Filters | null,
    isLoaded: false,
    dataVersion: 0,
    activeFilters: {
      genus: [],
      species: '',
      cultivar: '',
      form: '',
      color: '',
      hardiness: null,
      region: '',
      isRussian: false,
      inStock: false,
      ageRange: '',
      search: '',
      sort: 'date_desc',
    } as ActiveFilters,
    visible: 24,
    /** Last catalog URL with filters — for "back to catalog" from plant page */
    lastCatalogUrl: '/catalog' as string,
  }),

  getters: {
    filteredPlants(state): Plant[] {
      let plants = applyFilters([...state.catalog], state.activeFilters)

      switch (state.activeFilters.sort) {
        case 'name_asc':
          plants.sort((a, b) => a.latin_full.localeCompare(b.latin_full)); break
        case 'name_desc':
          plants.sort((a, b) => b.latin_full.localeCompare(a.latin_full)); break
        case 'price_asc':
          plants.sort((a, b) => (a.price ?? 999999) - (b.price ?? 999999)); break
        case 'price_desc':
          plants.sort((a, b) => (b.price ?? 0) - (a.price ?? 0)); break
      }
      return plants
    },

    filteredCount(): number { return this.filteredPlants.length },
    visiblePlants(): Plant[] { return this.filteredPlants.slice(0, this.visible) },
    hasMore(): boolean { return this.visible < this.filteredPlants.length },

    // Dynamic counts: for each filter dimension, count using all OTHER active filters
    dynamicCounts(state) {
      const f = state.activeFilters
      const all = state.catalog

      // Base set with all filters applied (for counting remaining options)
      const forColor = applyFilters([...all], f, 'color')
      const forForm = applyFilters([...all], f, 'form')
      const forHardiness = applyFilters([...all], f, 'hardiness')
      const forRegion = applyFilters([...all], f, 'region')
      const forGenus = applyFilters([...all], f, 'genus')
      const forSpecies = applyFilters([...all], f, 'species')
      const forAge = applyFilters([...all], f, 'ageRange')
      const forRussian = applyFilters([...all], f, 'isRussian')
      const forNew = applyFilters([...all], f, 'onlyNew')
      const forInStock = applyFilters([...all], f, 'inStock')

      return {
        genusCounts: countBy(forGenus, p => p.genus),
        speciesCounts: countBy(forSpecies, p => p.species),
        colorCounts: countBy(forColor, p => p.color),
        formCounts: countBy(forForm, p => p.form),
        hardinessCounts: countBy(forHardiness, p => p.hardiness_zone),
        regionCounts: countBy(forRegion, p => p.region_normalized),
        russianCount: forRussian.filter(p => p.is_russian_enriched).length,
        newCount: forNew.filter(p => p.is_new).length,
        inStockCount: forInStock.filter(p => p.status === 'in_stock').length,
        ageCounts: {
          '1-3': forAge.filter(p => p.age_min != null && p.age_min >= 1 && (p.age_max ?? p.age_min) <= 3).length,
          '4-7': forAge.filter(p => p.age_min != null && p.age_min >= 4 && (p.age_max ?? p.age_min) <= 7).length,
          '8-12': forAge.filter(p => p.age_min != null && p.age_min >= 8 && (p.age_max ?? p.age_min) <= 12).length,
          '13+': forAge.filter(p => p.age_min != null && p.age_min >= 13).length,
        } as Record<string, number>,
      }
    },

    availableSpecies(state): FilterOption[] {
      if (!state.filters || state.activeFilters.genus.length !== 1) return []
      const genus = state.activeFilters.genus[0]
      return state.filters.species[genus] || []
    },
  },

  actions: {
    async loadCatalog(force = false) {
      // Fuse.js lives outside Pinia state — re-create on client after SSR hydration
      if (this.isLoaded && !force && !fuseInstance && this.catalog.length > 0) {
        fuseInstance = new Fuse(this.catalog, {
          keys: [
            { name: 'latin_full', weight: 1 },
            { name: 'cultivar', weight: 0.8 },
            { name: 'name_ru', weight: 0.7 },
            { name: 'species_ru', weight: 0.6 },
            { name: 'genus_ru', weight: 0.5 },
            { name: 'garden_display', weight: 0.3 },
            { name: 'region_normalized', weight: 0.2 },
          ],
          threshold: 0.3, distance: 120, minMatchCharLength: 2,
        })
      }
      // Check if data changed on server (lightweight ~100 bytes request, never cached)
      if (this.isLoaded && !force) {
        try {
          const { version } = await $fetch<{ version: number }>(`/api/data-version?_=${Date.now()}`)
          if (version !== this.dataVersion) force = true
          else return
        } catch { return }
      }

      // Cache-bust parameter to bypass browser Cache-Control on force reload
      const cacheBust = force ? `?_t=${Date.now()}` : ''

      // Fetch via server API — reads fresh files from disk, no restart needed
      const [catalogData, filtersData, pricesData, conditionsData] = await Promise.all([
        $fetch<any[]>(`/api/catalog${cacheBust}`),
        $fetch<any>(`/api/filters${cacheBust}`),
        $fetch<any>(`/api/prices${cacheBust}`),
        $fetch<any>(`/api/conditions${cacheBust}`),
      ])

      this.catalog = catalogData.map((p: Plant) => {
        const priceInfo = pricesData.items[String(p.id)]
        const speciesConditions = conditionsData.species?.[p.species_full] ?? {}
        const overrideConditions = conditionsData.overrides?.[String(p.id)] ?? {}
        const merged = { ...speciesConditions, ...overrideConditions }
        return {
          ...p,
          price: priceInfo?.price ?? null,
          old_price: priceInfo?.old_price ?? null,
          status: priceInfo?.status ?? pricesData.default_status ?? 'by_request',
          price_note: priceInfo?.note ?? '',
          conditions: Object.keys(merged).length > 0 ? merged : undefined,
        }
      })
      this.filters = filtersData

      fuseInstance = new Fuse(this.catalog, {
        keys: [
          { name: 'latin_full', weight: 1 },
          { name: 'cultivar', weight: 0.8 },
          { name: 'name_ru', weight: 0.7 },
          { name: 'species_ru', weight: 0.6 },
          { name: 'genus_ru', weight: 0.5 },
          { name: 'garden_display', weight: 0.3 },
          { name: 'region_normalized', weight: 0.2 },
        ],
        threshold: 0.3, distance: 120, minMatchCharLength: 2,
      })
      this.isLoaded = true

      // Remember version to detect server-side changes
      try {
        const { version } = await $fetch<{ version: number }>('/api/data-version')
        this.dataVersion = version
      } catch {}
    },

    setFilter<K extends keyof ActiveFilters>(key: K, value: ActiveFilters[K]) {
      this.activeFilters[key] = value
      this.visible = 24
    },

    clearFilters() {
      this.activeFilters = {
        genus: [], species: '', cultivar: '', form: '', color: '', hardiness: null,
        region: '', garden: '', isRussian: false, onlyNew: false, inStock: false, ageRange: '',
        search: '', sort: 'date_desc',
      }
      this.visible = 24
    },

    showMore() { this.visible += 24 },

    getPlantById(id: number): Plant | undefined {
      return this.catalog.find(p => p.id === id)
    },

    getRelatedPlants(plant: Plant, limit = 8): Plant[] {
      return this.catalog
        .filter(p => p.id !== plant.id && p.genus === plant.genus && p.species === plant.species)
        .slice(0, limit)
    },

    /** All plants of the same cultivar across different gardens */
    getSameCultivarPlants(plant: Plant): Plant[] {
      if (!plant.cultivar) return []
      return this.catalog
        .filter(p => p.id !== plant.id && p.cultivar === plant.cultivar && p.species_full === plant.species_full)
    },
  },
})
