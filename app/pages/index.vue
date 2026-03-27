<script setup lang="ts">
import { useCatalogStore } from '~/stores/catalog'

const catalog = useCatalogStore()
onMounted(() => { if (!catalog.isLoaded) catalog.loadCatalog() })

// New arrivals (is_new flag from sync bot), fallback to latest entries
const newArrivals = computed(() => {
  const newOnes = catalog.catalog.filter(p => p.is_new && p.thumbs.length > 0)
  if (newOnes.length > 0) return newOnes.slice(0, 12)
  // Fallback: show latest by date
  return catalog.catalog.filter(p => p.thumbs.length > 0).slice(0, 12)
})

const hasNewArrivals = computed(() => catalog.catalog.some(p => p.is_new))

useHead({
  title: 'Территория Хвойных — каталог хвойных растений России',
})

useSeoMeta({
  description: `Территория Хвойных — крупнейший каталог хвойных растений России. ${catalog.catalog.length}+ сортов елей, сосен, пихт, туй и можжевельников с фото из частных садов и питомников.`,
  ogTitle: 'Территория Хвойных — каталог хвойных растений',
  ogDescription: `${catalog.catalog.length}+ сортов хвойных с фото из частных садов по всей России`,
  ogType: 'website',
})
</script>

<template>
  <div>
    <HeroBanner />
    <PromoBanner />
    <LastUpdated />
    <PopularCategories />
    <GardensPreview />
    <HomeCatalog />

    <!-- New arrivals -->
    <section class="featured container">
      <h2 class="section-title">
        {{ hasNewArrivals ? 'Недавно добавленные' : 'Новые поступления' }}
        <span v-if="hasNewArrivals" class="new-badge">NEW</span>
      </h2>
      <PlantGrid :plants="newArrivals" />
      <div class="more-wrap">
        <NuxtLink to="/catalog" class="btn-more">
          Смотреть весь каталог
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </NuxtLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.featured {
  padding: 32px 16px 48px;
}

.section-title {
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.new-badge {
  font-size: 10px;
  font-weight: 800;
  background: #ff6d00;
  color: #fff;
  padding: 3px 8px;
  border-radius: 6px;
  letter-spacing: 0.5px;
}

.more-wrap {
  text-align: center;
  margin-top: 28px;
}

.btn-more {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 32px;
  background: var(--primary);
  color: #fff;
  border-radius: var(--radius);
  font-weight: 600;
  font-size: 15px;
}

@media (min-width: 768px) {
  .featured { padding: 48px 24px 64px; }
  .section-title { font-size: 26px; }
}
</style>
