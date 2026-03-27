<script setup lang="ts">
import { useCatalogStore } from '~/stores/catalog'

const catalog = useCatalogStore()
onMounted(() => { if (!catalog.isLoaded) catalog.loadCatalog() })

const stats = computed(() => {
  const totalPhotos = catalog.catalog.reduce((s, p) => s + p.photos.length, 0)
  const uniqueGenera = new Set(catalog.catalog.map(p => p.genus).filter(Boolean))
  return [
    { value: catalog.catalog.length, label: 'сортов' },
    { value: uniqueGenera.size, label: 'родов' },
    { value: totalPhotos, label: 'фотографий' },
  ]
})
</script>

<template>
  <section class="stats">
    <div class="container">
      <div class="stats-grid">
        <div v-for="stat in stats" :key="stat.label" class="stat">
          <span class="stat-value">{{ stat.value.toLocaleString('ru-RU') }}</span>
          <span class="stat-label">{{ stat.label }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.stats {
  padding: 32px 0;
  background: var(--bg-alt);
}

.stats-grid {
  display: flex;
  justify-content: center;
  gap: 48px;
}

.stat {
  text-align: center;
}

.stat-value {
  display: block;
  font-size: 28px;
  font-weight: 800;
  color: var(--primary);
}

.stat-label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 2px;
}

@media (min-width: 768px) {
  .stats-grid { gap: 80px; }
  .stat-value { font-size: 36px; }
  .stat-label { font-size: 14px; }
}
</style>
