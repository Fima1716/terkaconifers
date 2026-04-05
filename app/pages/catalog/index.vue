<script setup lang="ts">
import { useCatalogStore } from '~/stores/catalog'

const catalog = useCatalogStore()
const route = useRoute()
const router = useRouter()

// Non-blocking: page renders instantly, data loads in background
onMounted(() => { if (!catalog.isLoaded) catalog.loadCatalog() })


// Infinite scroll
const sentinel = ref<HTMLElement>()
const isLoadingMore = ref(false)
let observer: IntersectionObserver | null = null
let cooldown = false

function onIntersect(entries: IntersectionObserverEntry[]) {
  if (!entries[0]?.isIntersecting || !catalog.hasMore || isLoadingMore.value || cooldown) return
  isLoadingMore.value = true
  cooldown = true
  catalog.showMore()
  // Wait for DOM to settle before allowing next trigger
  setTimeout(() => { isLoadingMore.value = false }, 300)
  setTimeout(() => { cooldown = false }, 800)
}

onMounted(() => {
  observer = new IntersectionObserver(onIntersect, { rootMargin: '100px' })
  if (sentinel.value) observer.observe(sentinel.value)
})

watch(() => sentinel.value, (el) => {
  if (el && observer) observer.observe(el)
})

onUnmounted(() => { observer?.disconnect() })

// --- Bidirectional sync: URL query ↔ store filters ---
let updatingFromUrl = false
let updatingFromStore = false

// URL → store (on page load and browser back/forward)
watch(() => route.query, (q) => {
  if (updatingFromStore) return
  updatingFromUrl = true
  catalog.clearFilters()
  if (q.genus) catalog.setFilter('genus', String(q.genus).split(','))
  if (q.species) catalog.setFilter('species', String(q.species))
  if (q.cultivar) catalog.setFilter('cultivar', decodeURIComponent(String(q.cultivar)))
  if (q.form) catalog.setFilter('form', String(q.form))
  if (q.color) catalog.setFilter('color', String(q.color))
  if (q.hardiness) catalog.setFilter('hardiness', Number(q.hardiness))
  if (q.region) catalog.setFilter('region', decodeURIComponent(String(q.region)))
  if (q.garden) catalog.setFilter('garden', decodeURIComponent(String(q.garden)))
  if (q.russian === '1') catalog.setFilter('isRussian', true)
  if (q.new === '1') catalog.setFilter('onlyNew', true)
  if (q.stock === '1') catalog.setFilter('inStock', true)
  if (q.age) catalog.setFilter('ageRange', String(q.age))
  if (q.q) catalog.setFilter('search', decodeURIComponent(String(q.q)))
  if (q.sort && q.sort !== 'date_desc') catalog.setFilter('sort', String(q.sort) as any)
  nextTick(() => { updatingFromUrl = false })
}, { immediate: true })

// Store → URL (when user changes filters via sidebar/tags)
watch(() => catalog.activeFilters, (f) => {
  if (updatingFromUrl) return
  updatingFromStore = true
  const q: Record<string, string> = {}
  if (f.genus.length) q.genus = f.genus.join(',')
  if (f.species) q.species = f.species
  if (f.cultivar) q.cultivar = f.cultivar
  if (f.form) q.form = f.form
  if (f.color) q.color = f.color
  if (f.hardiness !== null) q.hardiness = String(f.hardiness)
  if (f.region) q.region = f.region
  if (f.garden) q.garden = f.garden
  if (f.isRussian) q.russian = '1'
  if (f.onlyNew) q.new = '1'
  if (f.inStock) q.stock = '1'
  if (f.ageRange) q.age = f.ageRange
  if (f.search) q.q = f.search
  if (f.sort && f.sort !== 'date_desc') q.sort = f.sort
  router.replace({ query: q })
  nextTick(() => { updatingFromStore = false })
}, { deep: true })

// Remember current catalog URL for "back to catalog" from plant pages
watch(() => route.fullPath, (path) => {
  catalog.lastCatalogUrl = path
}, { immediate: true })

const sortOptions = [
  { value: 'date_desc', label: 'По дате (новые)' },
  { value: 'name_asc', label: 'По названию (А → Я)' },
  { value: 'name_desc', label: 'По названию (Я → А)' },
  { value: 'price_asc', label: 'По цене (дешевле)' },
  { value: 'price_desc', label: 'По цене (дороже)' },
]

useHead({
  title: 'Каталог хвойных растений — Территория Хвойных',
})

useSeoMeta({
  description: computed(() =>
    `Каталог из ${catalog.filteredCount} сортов хвойных растений с фото. Ели, сосны, пихты, туи, можжевельники из частных садов по всей России. Фильтры по роду, виду, цвету, региону.`
  ),
})
</script>

<template>
  <div class="catalog-page container">
    <BreadCrumbs :items="[{ label: 'Главная', to: '/' }, { label: 'Каталог' }]" />

    <PromoBanner page="catalog" />

    <h1 class="page-title">
      Каталог хвойных
      <span class="title-count">{{ catalog.filteredCount }} сортов</span>
    </h1>

    <div class="catalog-layout">
      <!-- Sidebar filters -->
      <div class="catalog-sidebar">
        <CatalogFilters />
      </div>

      <!-- Main content -->
      <div class="catalog-main">
        <!-- Sort bar -->
        <div class="sort-bar">
          <span class="result-count">
            Найдено: <strong>{{ catalog.filteredCount }}</strong>
          </span>
          <CustomSelect
            :model-value="catalog.activeFilters.sort"
            :options="sortOptions"
            @update:model-value="catalog.setFilter('sort', $event as any)"
          />
        </div>

        <!-- Active filter tags -->
        <div v-if="catalog.activeFilters.genus.length || catalog.activeFilters.color || catalog.activeFilters.search || catalog.activeFilters.inStock || catalog.activeFilters.garden || catalog.activeFilters.cultivar" class="active-tags">
          <span v-if="catalog.activeFilters.inStock" class="tag tag-stock" @click="catalog.setFilter('inStock', false)">
            В наличии ✕
          </span>
          <span v-if="catalog.activeFilters.cultivar" class="tag" @click="catalog.setFilter('cultivar', '')">
            {{ catalog.activeFilters.cultivar.includes('||') ? catalog.activeFilters.cultivar.split('||')[1] + " '" + catalog.activeFilters.cultivar.split('||')[0] + "'" : catalog.activeFilters.cultivar }} ✕
          </span>
          <span v-if="catalog.activeFilters.garden" class="tag" @click="catalog.setFilter('garden', '')">
            {{ catalog.activeFilters.garden }} ✕
          </span>
          <span
            v-for="g in catalog.activeFilters.genus"
            :key="g"
            class="tag"
            @click="catalog.setFilter('genus', catalog.activeFilters.genus.filter(x => x !== g))"
          >
            {{ catalog.filters?.genera.find(x => x.value === g)?.label || g }} ✕
          </span>
          <span v-if="catalog.activeFilters.color" class="tag" @click="catalog.setFilter('color', '')">
            {{ catalog.filters?.colors.find(c => c.value === catalog.activeFilters.color)?.label }} ✕
          </span>
          <span v-if="catalog.activeFilters.search" class="tag" @click="catalog.setFilter('search', '')">
            "{{ catalog.activeFilters.search }}" ✕
          </span>
        </div>

        <!-- Skeleton grid while loading -->
        <div v-if="!catalog.isLoaded" class="plant-grid skeleton-grid">
          <div v-for="i in 10" :key="i" class="skeleton-card">
            <div class="skeleton-img skeleton-shimmer" />
            <div class="skeleton-body">
              <div class="skeleton-line skeleton-shimmer" style="width:80%" />
              <div class="skeleton-line skeleton-shimmer" style="width:60%" />
              <div class="skeleton-line skeleton-shimmer" style="width:50%" />
            </div>
          </div>
        </div>

        <!-- Grid -->
        <PlantGrid v-else-if="catalog.visiblePlants.length > 0" :plants="catalog.visiblePlants" :eager-count="5" />

        <div v-else class="empty-state">
          <p>Ничего не найдено</p>
          <button class="btn-reset" @click="catalog.clearFilters()">Сбросить фильтры</button>
        </div>

        <!-- Infinite scroll sentinel + fallback button -->
        <div v-if="catalog.hasMore" class="load-more">
          <span class="shown-count">
            Показано {{ catalog.visiblePlants.length }} из {{ catalog.filteredCount }}
          </span>
          <div ref="sentinel" class="scroll-sentinel" />
          <div v-if="isLoadingMore" class="loading-spinner">
            <svg class="spinner-icon" viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="10" fill="none" stroke="var(--primary)" stroke-width="2" stroke-dasharray="50" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" dur="0.8s" from="0 12 12" to="360 12 12" repeatCount="indefinite"/></circle></svg>
          </div>
          <button v-else class="btn-load" @click="catalog.showMore()">
            Показать ещё
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.catalog-page {
  padding-top: 16px;
  padding-bottom: 48px;
}
@media (min-width: 768px) { .catalog-page { padding-top: 24px; } }

.breadcrumbs {
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 16px;
}

.breadcrumbs a {
  color: var(--text-secondary);
  transition: color 0.15s;
}

.breadcrumbs a:hover { color: var(--primary); }

.sep {
  margin: 0 6px;
  color: var(--border);
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 16px;
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
@media (min-width: 768px) { .page-title { font-size: 26px; margin-bottom: 24px; } }

.title-count {
  font-size: 15px;
  font-weight: 400;
  color: var(--text-muted);
}

/* Layout */
.catalog-layout {
  display: flex;
  gap: 32px;
}

.catalog-sidebar {
  width: 260px;
  flex-shrink: 0;
}

.catalog-main {
  flex: 1;
  min-width: 0;
}

@media (max-width: 1023px) {
  .catalog-layout {
    flex-direction: column;
    gap: 16px;
  }
  .catalog-sidebar { width: 100%; }
}

/* Sort bar */
.sort-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-light);
}

.result-count {
  font-size: 13px;
  color: var(--text-secondary);
}

.result-count strong {
  color: var(--text);
}

/* Removed native .sort-select — using CustomSelect now */
/* Keep this block as placeholder */
.sort-select-legacy {
  height: 44px;
  padding: 0 28px 0 12;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-size: 13px;
  outline: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23999'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
}

/* Active tags */
.active-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 16px;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  background: var(--bg-alt);
  border: 1px solid var(--border);
  border-radius: 16px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.tag:hover {
  background: var(--danger);
  color: #fff;
  border-color: var(--danger);
}

/* Empty */
.empty-state {
  text-align: center;
  padding: 48px 16px;
  color: var(--text-muted);
}

.btn-reset {
  margin-top: 12px;
  padding: 8px 20px;
  background: var(--primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
}

/* Load more */
.load-more {
  text-align: center;
  padding: 32px 0;
}

.shown-count {
  display: block;
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 12px;
}

.btn-load {
  padding: 14px 32px; min-height: 48px;
  background: var(--bg);
  border: 2px solid var(--primary);
  color: var(--primary);
  border-radius: var(--radius);
  font-weight: 600;
  font-size: 14px;
  transition: all 0.15s;
}

.btn-load:hover {
  background: var(--primary);
  color: #fff;
}

.scroll-sentinel { height: 1px; }

.loading-spinner {
  display: flex;
  justify-content: center;
  padding: 8px 0;
}

/* Skeleton cards */
.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
@media (min-width: 640px) { .skeleton-grid { grid-template-columns: repeat(3, 1fr); gap: 14px; } }
@media (min-width: 1024px) { .skeleton-grid { grid-template-columns: repeat(4, 1fr); gap: 16px; } }
@media (min-width: 1280px) { .skeleton-grid { grid-template-columns: repeat(5, 1fr); } }

.skeleton-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}
.skeleton-img { aspect-ratio: 0.85; }
.skeleton-body { padding: 10px 12px 14px; display: flex; flex-direction: column; gap: 6px; }
.skeleton-line { height: 12px; border-radius: 4px; }
</style>
