<script setup lang="ts">
import { useCatalogStore } from '~/stores/catalog'

const catalog = useCatalogStore()
onMounted(() => { if (!catalog.isLoaded) catalog.loadCatalog() })

const topGenera = computed(() => {
  // Compute counts from actual (consent-filtered) catalog, not pre-built filters
  const counts = new Map<string, number>()
  for (const p of catalog.catalog) {
    if (p.genus) counts.set(p.genus, (counts.get(p.genus) || 0) + 1)
  }
  return (catalog.filters?.genera ?? [])
    .map(g => ({ ...g, count: counts.get(g.value) || 0 }))
    .filter(g => g.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
})
</script>

<template>
  <section class="categories">
    <div class="container">
      <h2 class="section-title">Популярные категории</h2>
      <div class="grid">
        <NuxtLink
          v-for="genus in topGenera"
          :key="genus.value"
          :to="`/catalog?genus=${genus.value}`"
          class="category-card"
        >
          <div class="card-img-wrap">
            <img
              v-if="genus.cover_thumb"
              :src="photoUrl(genus.cover_thumb)"
              :alt="genus.label"
              loading="lazy"
            >
          </div>
          <div class="card-body">
            <h3 class="card-title">{{ genus.label }}</h3>
            <span class="card-count">{{ genus.count }} сортов</span>
          </div>
        </NuxtLink>
      </div>
    </div>
  </section>
</template>

<style scoped>
.categories {
  padding: 48px 0;
}

.section-title {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 24px;
  color: var(--text);
}

@media (min-width: 768px) {
  .section-title { font-size: 28px; }
  .categories { padding: 64px 0; }
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

@media (min-width: 640px) {
  .grid { grid-template-columns: repeat(3, 1fr); gap: 16px; }
}

@media (min-width: 1024px) {
  .grid { grid-template-columns: repeat(6, 1fr); gap: 20px; }
}

.category-card {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  transition: box-shadow 0.2s;
}

@media (min-width: 1024px) {
  .category-card:hover { box-shadow: var(--shadow-card-hover); }
}

.card-img-wrap {
  aspect-ratio: 1;
  overflow: hidden;
  background: var(--bg-alt);
}

.card-img-wrap img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.card-body {
  padding: 12px;
  text-align: center;
}

.card-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.card-count {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
  display: block;
}

@media (min-width: 768px) {
  .card-body { padding: 14px; }
  .card-title { font-size: 16px; }
  .card-count { font-size: 13px; }
}
</style>
