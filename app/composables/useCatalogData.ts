import type { Plant, Filters } from '~/stores/catalog'

export async function useCatalogData() {
  const { data: catalog } = await useAsyncData('catalog', () =>
    $fetch<Plant[]>('/data/catalog-enriched.json')
  )

  const { data: filters } = await useAsyncData('filters', () =>
    $fetch<Filters>('/data/filters-enriched.json')
  )

  const { data: prices } = await useAsyncData('prices', () =>
    $fetch<any>('/data/prices.json').catch(() => ({ items: {} }))
  )

  return { catalog, filters, prices }
}
