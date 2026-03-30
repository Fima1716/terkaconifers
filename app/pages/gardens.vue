<script setup lang="ts">
import { useCatalogStore, type Plant } from '~/stores/catalog'


const catalog = useCatalogStore()
onMounted(() => { if (!catalog.isLoaded) catalog.loadCatalog() })

// Fetch garden profiles (descriptions, contacts, etc.)
const gardenProfiles = ref<Record<string, any>>({})
onMounted(async () => {
  try {
    const data = await $fetch<any>('/api/gardens')
    gardenProfiles.value = data.gardens || {}
  } catch {}
})

const search = ref('')
const sortBy = ref<'count' | 'name'>('count')

interface GardenInfo {
  display: string
  type_ru: string
  count: number
  regions: Set<string>
  genera: Set<string>
  photoCount: number
  coverThumb: string
}

const gardens = computed(() => {
  const map = new Map<string, GardenInfo>()
  for (const p of catalog.catalog) {
    if (!p.garden_display) continue
    const existing = map.get(p.garden_display)
    if (existing) {
      existing.count++
      if (p.region_normalized) existing.regions.add(p.region_normalized)
      if (p.genus_ru) existing.genera.add(p.genus_ru)
      existing.photoCount += p.photos?.length || 0
      if (!existing.coverThumb && p.thumbs?.[0]) existing.coverThumb = p.thumbs[0]
    } else {
      const regions = new Set<string>()
      if (p.region_normalized) regions.add(p.region_normalized)
      const genera = new Set<string>()
      if (p.genus_ru) genera.add(p.genus_ru)
      map.set(p.garden_display, {
        display: p.garden_display,
        type_ru: p.garden_type_ru,
        count: 1,
        regions,
        genera,
        photoCount: p.photos?.length || 0,
        coverThumb: p.thumbs?.[0] || '',
      })
    }
  }

  let list = [...map.values()]

  // Sort
  if (sortBy.value === 'count') {
    list.sort((a, b) => b.count - a.count)
  } else {
    list.sort((a, b) => a.display.localeCompare(b.display, 'ru'))
  }

  // Filter by search
  if (search.value) {
    const q = search.value.toLowerCase()
    list = list.filter(g => g.display.toLowerCase().includes(q))
  }

  return list
})

function pluralize(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return many
  if (last > 1 && last < 5) return few
  if (last === 1) return one
  return many
}

useHead({ title: 'Сады и коллекции — Территория Хвойных' })
</script>

<template>
  <div class="gardens-page">
    <div class="gardens-container">
      <BreadCrumbs :items="[{ label: 'Главная', to: '/' }, { label: 'Сады и коллекции' }]" />

      <!-- Header -->
      <header class="page-header">
        <div class="header-text">
          <h1>Сады и коллекции</h1>
          <p class="page-subtitle">
            {{ gardens.length }} {{ pluralize(gardens.length, 'сад', 'сада', 'садов') }}
            и питомников со всей России
          </p>
        </div>
        <NuxtLink to="/map" class="btn-map">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
          Карта
        </NuxtLink>
      </header>

      <!-- Search & Sort toolbar -->
      <div class="toolbar">
        <div class="search-wrap">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            v-model="search"
            type="text"
            class="search-input"
            placeholder="Найти сад или коллекционера..."
          >
          <button v-if="search" class="search-clear" @click="search = ''">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div class="sort-pills">
          <button
            class="sort-pill"
            :class="{ active: sortBy === 'count' }"
            @click="sortBy = 'count'"
          >
            По количеству
          </button>
          <button
            class="sort-pill"
            :class="{ active: sortBy === 'name' }"
            @click="sortBy = 'name'"
          >
            По алфавиту
          </button>
        </div>
      </div>

      <!-- Skeleton loading state -->
      <div v-if="!catalog.isLoaded" class="gardens-grid">
        <div v-for="i in 6" :key="i" class="garden-card skeleton-card">
          <div class="card-cover skeleton-shimmer" />
          <div class="card-body">
            <div class="skeleton-line skeleton-shimmer" style="width: 65%; height: 20px;" />
            <div class="skeleton-line skeleton-shimmer" style="width: 40%; height: 14px; margin-top: 10px;" />
            <div class="skeleton-stats">
              <div class="skeleton-line skeleton-shimmer" style="width: 60px; height: 36px; border-radius: 8px;" />
              <div class="skeleton-line skeleton-shimmer" style="width: 60px; height: 36px; border-radius: 8px;" />
              <div class="skeleton-line skeleton-shimmer" style="width: 60px; height: 36px; border-radius: 8px;" />
            </div>
            <div class="skeleton-chips">
              <div class="skeleton-line skeleton-shimmer" style="width: 72px; height: 26px; border-radius: 20px;" />
              <div class="skeleton-line skeleton-shimmer" style="width: 56px; height: 26px; border-radius: 20px;" />
              <div class="skeleton-line skeleton-shimmer" style="width: 64px; height: 26px; border-radius: 20px;" />
            </div>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-else-if="gardens.length === 0" class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        <p class="empty-title">Ничего не найдено</p>
        <p class="empty-hint">Попробуйте изменить запрос</p>
        <button class="btn-reset" @click="search = ''">Сбросить поиск</button>
      </div>

      <!-- Garden cards grid -->
      <div v-else class="gardens-grid">
        <NuxtLink
          v-for="g in gardens"
          :key="g.display"
          :to="`/garden/${encodeURIComponent(g.display)}`"
          class="garden-card"
        >
          <!-- Cover area -->
          <div class="card-cover" :style="{ background: `linear-gradient(135deg, hsl(${Math.abs([...g.display].reduce((h,c) => ((h<<5)-h+c.charCodeAt(0))|0, 0)) % 360}, 30%, 28%) 0%, hsl(${(Math.abs([...g.display].reduce((h,c) => ((h<<5)-h+c.charCodeAt(0))|0, 0)) + 40) % 360}, 25%, 20%) 100%)` }">
            <div class="cover-trees" />
            <div class="cover-gradient" />

            <!-- Type badge with glassmorphism -->
            <span class="type-badge" :class="g.type_ru === 'Питомник' ? 'badge-nursery' : 'badge-private'">
              <svg v-if="g.type_ru === 'Питомник'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11">
                <path d="M12 2L7 8h3l-4 6h3l-5 8h16l-5-8h3l-4-6h3z" />
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              {{ g.type_ru }}
            </span>
          </div>

          <!-- Card body -->
          <div class="card-body">
            <h2 class="garden-name">{{ g.display }}</h2>

            <p v-if="g.regions.size" class="garden-region">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
              </svg>
              {{ [...g.regions].slice(0, 2).join(', ') }}
            </p>

            <!-- Stats row -->
            <div class="stats-row">
              <div class="stat-item">
                <span class="stat-number">{{ g.count }}</span>
                <span class="stat-label">{{ pluralize(g.count, 'растение', 'растения', 'растений') }}</span>
              </div>
              <div class="stat-divider" />
              <div class="stat-item">
                <span class="stat-number">{{ g.genera.size }}</span>
                <span class="stat-label">{{ pluralize(g.genera.size, 'род', 'рода', 'родов') }}</span>
              </div>
              <div v-if="g.photoCount > 0" class="stat-divider" />
              <div v-if="g.photoCount > 0" class="stat-item">
                <span class="stat-number">{{ g.photoCount }}</span>
                <span class="stat-label">фото</span>
              </div>
            </div>

            <!-- Genera chips -->
            <div v-if="g.genera.size > 0" class="genera-chips">
              <span v-for="genus in [...g.genera].slice(0, 3)" :key="genus" class="genus-chip">
                {{ genus }}
              </span>
              <span v-if="g.genera.size > 3" class="genus-chip chip-more">
                +{{ g.genera.size - 3 }}
              </span>
            </div>

            <!-- Description snippet -->
            <p
              v-if="gardenProfiles[g.display]?.description"
              class="garden-description"
            >
              {{ gardenProfiles[g.display].description }}
            </p>
          </div>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Page layout ── */
.gardens-page {
  min-height: 100vh;
  background: var(--bg, #ffffff);
  padding: 16px 16px 80px;
}

.gardens-container {
  max-width: 1200px;
  margin: 0 auto;
}

/* ── Header ── */
.page-header {
  margin-bottom: 28px;
  display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
}
.btn-map {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 10px 18px; background: var(--bg-alt, #f5f5f5);
  border: 1.5px solid var(--border, #e0e0e0); border-radius: 10px;
  font-size: 13px; font-weight: 600; color: var(--text, #333);
  white-space: nowrap; flex-shrink: 0; transition: all 0.15s;
}
.btn-map:hover { border-color: var(--primary); color: var(--primary); }

.header-text h1 {
  font-size: 26px;
  font-weight: 800;
  color: var(--text, #1a1a1a);
  margin: 0;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.page-subtitle {
  font-size: 14px;
  color: var(--text-muted, #999999);
  margin: 6px 0 0;
  font-weight: 400;
}

/* ── Toolbar ── */
.toolbar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 28px;
}

.search-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 16px;
  color: var(--text-muted, #999999);
  pointer-events: none;
}

.search-input {
  width: 100%;
  height: 48px;
  padding: 0 44px 0 44px;
  border: 1.5px solid var(--border, #e0e8e0);
  border-radius: 24px;
  background: var(--bg-alt, #f5f7f5);
  font-size: 15px;
  color: var(--text, #1a1a1a);
  outline: none;
  transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
  -webkit-appearance: none;
}

.search-input:focus {
  border-color: var(--primary, #1a5632);
  background: var(--bg, #ffffff);
  box-shadow: 0 0 0 3px rgba(26, 86, 50, 0.08);
}

.search-input::placeholder {
  color: var(--text-muted, #999999);
}

.search-clear {
  position: absolute;
  right: 8px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--text-muted, #999999);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
}

.search-clear:hover {
  background: var(--border-light, #f0f4f0);
  color: var(--text, #1a1a1a);
}

.sort-pills {
  display: flex;
  gap: 8px;
}

.sort-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1.5px solid var(--border, #e0e8e0);
  border-radius: 24px;
  background: var(--bg, #ffffff);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary, #666666);
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.sort-pill:hover {
  border-color: var(--primary, #1a5632);
  color: var(--primary, #1a5632);
}

.sort-pill.active {
  background: var(--primary, #1a5632);
  border-color: var(--primary, #1a5632);
  color: #fff;
}

/* ── Grid ── */
.gardens-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 20px;
}

@media (min-width: 640px) {
  .gardens-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
  }
}

@media (min-width: 1024px) {
  .gardens-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
  }
}

/* ── Garden card ── */
.garden-card {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--bg, #ffffff);
  border: 1px solid var(--border, #e0e8e0);
  border-radius: 16px;
  overflow: hidden;
  text-decoration: none;
  color: inherit;
  transition: box-shadow 0.3s ease, transform 0.3s ease, border-color 0.3s ease;
  cursor: pointer;
}

.garden-card:hover {
  box-shadow: 0 4px 16px rgba(26, 86, 50, 0.15);
  transform: translateY(-3px);
  border-color: var(--border-light, #f0f4f0);
}

.garden-card:active {
  transform: translateY(-1px);
}

/* ── Cover photo ── */
.card-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 8;
  overflow: hidden;
  background: var(--bg-alt, #f5f7f5);
  flex-shrink: 0;
}

.cover-trees {
  position: absolute;
  inset: 0;
  z-index: 1;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='50' height='58' viewBox='0 0 50 58'%3E%3Cpath d='M25 6l-10 15h6l-8 14h6l-8 15h28l-8-15h6l-8-14h6L25 6z' fill='%23fff' opacity='0.07'/%3E%3Crect x='23' y='50' width='5' height='6' rx='1' fill='%23fff' opacity='0.05'/%3E%3C/svg%3E");
  background-size: 50px 58px;
}

.cover-gradient {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 50%;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.15), transparent);
  pointer-events: none;
  z-index: 2;
}

/* ── Type badge (glassmorphism) ── */
.type-badge {
  position: absolute;
  top: 12px;
  left: 12px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 11px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.01em;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  z-index: 2;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.badge-private {
  background: rgba(255, 255, 255, 0.82);
  color: var(--primary, #1a5632);
}

.badge-nursery {
  background: rgba(26, 86, 50, 0.82);
  color: #fff;
}

/* ── Card body ── */
.card-body {
  padding: 16px 18px 18px;
  display: flex;
  flex-direction: column;
  flex-grow: 1;
}

.garden-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--text, #1a1a1a);
  margin: 0;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  transition: color 0.2s ease;
}

.garden-card:hover .garden-name {
  color: var(--primary, #1a5632);
}

/* ── Region ── */
.garden-region {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  color: var(--text-secondary, #666666);
  margin: 6px 0 0;
  line-height: 1.4;
}

.garden-region svg {
  color: var(--text-muted, #999999);
  flex-shrink: 0;
}

/* ── Stats row ── */
.stats-row {
  display: flex;
  align-items: center;
  gap: 0;
  margin-top: 14px;
  padding: 10px 0;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  gap: 1px;
}

.stat-number {
  font-size: 18px;
  font-weight: 800;
  color: var(--text, #1a1a1a);
  line-height: 1.2;
  letter-spacing: -0.02em;
}

.stat-label {
  font-size: 11px;
  color: var(--text-muted, #999999);
  font-weight: 400;
  text-transform: lowercase;
  line-height: 1.3;
}

.stat-divider {
  width: 1px;
  height: 24px;
  background: var(--border-light, #f0f4f0);
  flex-shrink: 0;
}

/* ── Genera chips ── */
.genera-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 12px;
}

.genus-chip {
  font-size: 11px;
  padding: 4px 11px;
  background: var(--bg-alt, #f5f7f5);
  border: 1px solid var(--border-light, #f0f4f0);
  border-radius: 20px;
  color: var(--text-secondary, #666666);
  white-space: nowrap;
  font-weight: 500;
  line-height: 1.4;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.garden-card:hover .genus-chip {
  border-color: var(--border, #e0e8e0);
}

.chip-more {
  background: transparent;
  border-color: var(--border, #e0e8e0);
  color: var(--text-muted, #999999);
  font-weight: 600;
}

/* ── Description ── */
.garden-description {
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-secondary, #666666);
  margin: 10px 0 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ── Empty state ── */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 80px 24px;
}

.empty-icon {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--bg-alt, #f5f7f5);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
  color: var(--text-muted, #999999);
  opacity: 0.6;
}

.empty-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--text, #1a1a1a);
  margin: 0 0 6px;
}

.empty-hint {
  font-size: 14px;
  color: var(--text-muted, #999999);
  margin: 0 0 24px;
}

.btn-reset {
  padding: 10px 28px;
  background: var(--primary, #1a5632);
  color: #fff;
  border: none;
  border-radius: 24px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.15s ease;
}

.btn-reset:hover {
  background: var(--primary-light, #2d8b4e);
}

.btn-reset:active {
  transform: scale(0.97);
}

/* ── Skeleton loading ── */
.skeleton-card {
  pointer-events: none;
}

.skeleton-card .card-cover {
  aspect-ratio: 16 / 8;
}

.skeleton-line {
  border-radius: 8px;
}

.skeleton-stats {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}

.skeleton-chips {
  display: flex;
  gap: 6px;
  margin-top: 14px;
}

.skeleton-shimmer {
  background: linear-gradient(
    90deg,
    var(--bg-alt, #f5f7f5) 25%,
    var(--border-light, #f0f4f0) 37%,
    var(--bg-alt, #f5f7f5) 63%
  );
  background-size: 400% 100%;
  animation: shimmer 1.6s ease infinite;
}

@keyframes shimmer {
  0% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

/* ── Responsive ── */
@media (min-width: 640px) {
  .toolbar {
    flex-direction: row;
    align-items: center;
  }

  .search-wrap {
    flex: 1;
  }
}

@media (min-width: 768px) {
  .gardens-page {
    padding-top: 24px;
  }

  .header-text h1 {
    font-size: 30px;
  }

  .page-subtitle {
    font-size: 15px;
  }

  .card-body {
    padding: 18px 20px 20px;
  }

  .garden-name {
    font-size: 17px;
  }
}

@media (min-width: 1024px) {
  .header-text h1 {
    font-size: 34px;
  }

  .page-subtitle {
    font-size: 16px;
    margin-top: 8px;
  }
}
</style>
