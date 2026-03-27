<script setup lang="ts">
import { useCatalogStore } from '~/stores/catalog'
import { useAuthStore } from '~/stores/auth'

const route = useRoute()
const catalog = useCatalogStore()
const auth = useAuthStore()

onMounted(() => {
  if (!catalog.isLoaded) catalog.loadCatalog()
  auth.fetchMe()
})

const gardenName = computed(() => decodeURIComponent(String(route.params.id)))

// Set garden filter in store so CatalogFilters works within this garden's context
watch(gardenName, (name) => {
  catalog.clearFilters()
  catalog.setFilter('garden', name)
}, { immediate: true })

onUnmounted(() => {
  catalog.setFilter('garden', '')
})

// All plants in this garden (for stats, unfiltered)
const gardenPlants = computed(() => {
  if (!catalog.isLoaded) return []
  return catalog.catalog.filter(p => p.garden_display === gardenName.value)
})

const stats = computed(() => {
  const plants = gardenPlants.value
  const genera = new Set(plants.map(p => p.genus_ru).filter(Boolean))
  const regions = new Set(plants.map(p => p.region_normalized).filter(Boolean))
  return {
    total: plants.length,
    genera: genera.size,
    generaList: [...genera].slice(0, 5),
    region: [...regions][0] || '',
    photos: plants.reduce((s, p) => s + (p.photos?.length || 0), 0),
  }
})

// Garden profile data
const gardenProfile = ref<any>(null)
const buyButtonsEnabled = ref(false)
onMounted(async () => {
  try {
    const data = await $fetch<any>('/api/gardens')
    gardenProfile.value = data.gardens?.[gardenName.value] || null
    buyButtonsEnabled.value = !!data.showBuyButtonsGarden
  } catch {}
})

const canEdit = computed(() => auth.canEditGarden(gardenName.value))

// Edit mode
const editing = ref(false)
const editForm = reactive({
  description: '',
  contacts: '',
  visible: true,
  buyLink: '',
})

function startEdit() {
  editForm.description = gardenProfile.value?.description || ''
  editForm.contacts = gardenProfile.value?.contacts || ''
  editForm.visible = gardenProfile.value?.visible !== false
  editForm.buyLink = gardenProfile.value?.buyLink || ''
  editing.value = true
}

const buyLink = computed(() => gardenProfile.value?.buyLink || '')

async function saveProfile() {
  try {
    await $fetch('/api/admin/gardens', {
      method: 'PUT',
      body: { gardenId: gardenName.value, profile: { ...editForm } },
    })
    gardenProfile.value = { ...gardenProfile.value, ...editForm }
    editing.value = false
  } catch {}
}

// Sort options
const sortOptions = [
  { value: 'date_desc', label: 'По дате (новые)' },
  { value: 'name_asc', label: 'По названию (А → Я)' },
  { value: 'name_desc', label: 'По названию (Я → А)' },
  { value: 'price_asc', label: 'По цене (дешевле)' },
  { value: 'price_desc', label: 'По цене (дороже)' },
]

// Check if any sub-filters are active (besides garden)
const hasActiveSubFilters = computed(() => {
  const f = catalog.activeFilters
  return f.genus.length > 0 || f.species || f.color || f.search || f.inStock || f.isRussian || f.ageRange || f.onlyNew || f.cultivar
})

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

// Generate unique hue from garden name for cover gradient
const coverHue = computed(() => {
  let hash = 0
  for (const ch of gardenName.value) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0
  return Math.abs(hash) % 360
})

useHead({
  title: computed(() => `${gardenName.value} — Территория Хвойных`),
})
</script>

<template>
  <div class="garden-page">
    <!-- Cover Photo Hero -->
    <div
      class="cover-hero"
      :style="{ background: `linear-gradient(135deg, hsl(${coverHue}, 30%, 24%) 0%, hsl(${(coverHue + 40) % 360}, 25%, 18%) 100%)` }"
    >
      <div class="cover-trees" />
      <div class="cover-overlay" />

      <div class="cover-content container">
        <BreadCrumbs
          class="cover-breadcrumbs"
          :items="[{ label: 'Главная', to: '/' }, { label: 'Сады', to: '/gardens' }, { label: gardenName }]"
        />

        <div class="cover-bottom">
          <div class="cover-meta">
            <div class="cover-title-row">
              <h1>{{ gardenName }}</h1>
              <span class="type-badge">
                {{ gardenProfile?.type === 'nursery' ? 'Питомник' : 'Частный сад' }}
              </span>
            </div>
            <p v-if="stats.region" class="cover-region">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
              {{ stats.region }}
            </p>
          </div>

          <div class="cover-stats">
            <div class="cover-stat">
              <span class="cover-stat-num">{{ stats.total }}</span>
              <span class="cover-stat-label">растений</span>
            </div>
            <div class="cover-stat-divider" />
            <div class="cover-stat">
              <span class="cover-stat-num">{{ stats.genera }}</span>
              <span class="cover-stat-label">родов</span>
            </div>
            <div class="cover-stat-divider" />
            <div class="cover-stat">
              <span class="cover-stat-num">{{ stats.photos }}</span>
              <span class="cover-stat-label">фото</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Profile Info Card (only if has content) -->
    <div class="container" v-if="gardenProfile?.description || buyLink || stats.generaList.length || canEdit">
      <div class="profile-card">
        <div class="profile-card-body">
          <p v-if="gardenProfile?.description" class="profile-desc">{{ gardenProfile.description }}</p>
          <p v-if="gardenProfile?.contacts && buyLink" class="profile-contacts">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.362 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
            {{ gardenProfile.contacts }}
          </p>

          <div v-if="buyLink && buyButtonsEnabled" class="profile-buylink">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
            <a :href="buyLink" target="_blank" rel="noopener">Купить растения этого сада</a>
          </div>

          <div v-if="stats.generaList.length" class="profile-genera">
            <span v-for="g in stats.generaList" :key="g" class="genus-chip">{{ g }}</span>
          </div>

          <button v-if="canEdit" class="btn-edit-garden" @click="startEdit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            Настроить сад
          </button>
        </div>
      </div>

      <!-- Edit form -->
      <div v-if="editing" class="edit-section">
        <h3 class="edit-title">Настройки сада</h3>
        <div class="field">
          <label>Описание</label>
          <textarea v-model="editForm.description" rows="4" placeholder="Расскажите о вашем саде..."></textarea>
        </div>
        <div class="field">
          <label>Контакты</label>
          <input v-model="editForm.contacts" type="text" placeholder="Telegram, email, etc.">
        </div>
        <div class="field">
          <label>Ссылка «Купить» (появится на всех растениях сада)</label>
          <input v-model="editForm.buyLink" type="text" placeholder="https://example.ru">
        </div>
        <div class="edit-actions">
          <button class="btn-save" @click="saveProfile">Сохранить</button>
          <button class="btn-cancel" @click="editing = false">Отмена</button>
        </div>
      </div>

      <div v-if="gardenName.includes('Русинов')" class="garden-promo">
        <PromoBanner page="garden-rusinov" />
      </div>

      <!-- Plants section with filters -->
      <section class="garden-plants">
        <div class="section-header">
          <h2>Растения сада</h2>
          <span class="section-count">{{ stats.total }}</span>
        </div>

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

            <!-- Active filter tags (excluding garden since it's the page context) -->
            <div v-if="hasActiveSubFilters" class="active-tags">
              <span v-if="catalog.activeFilters.inStock" class="tag tag-stock" @click="catalog.setFilter('inStock', false)">
                В наличии ✕
              </span>
              <span v-if="catalog.activeFilters.onlyNew" class="tag" @click="catalog.setFilter('onlyNew', false)">
                Новинки ✕
              </span>
              <span v-if="catalog.activeFilters.cultivar" class="tag" @click="catalog.setFilter('cultivar', '')">
                {{ catalog.activeFilters.cultivar.includes('||') ? catalog.activeFilters.cultivar.split('||')[1] + " '" + catalog.activeFilters.cultivar.split('||')[0] + "'" : catalog.activeFilters.cultivar }} ✕
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
              <span v-if="catalog.activeFilters.isRussian" class="tag" @click="catalog.setFilter('isRussian', false)">
                Российские сорта ✕
              </span>
              <span v-if="catalog.activeFilters.ageRange" class="tag" @click="catalog.setFilter('ageRange', '')">
                Возраст: {{ catalog.activeFilters.ageRange }} ✕
              </span>
            </div>

            <!-- Skeleton grid while loading -->
            <div v-if="!catalog.isLoaded" class="plant-grid skeleton-grid">
              <div v-for="i in 10" :key="i" class="skeleton-card">
                <div class="skeleton-img skeleton-shimmer" />
                <div class="skeleton-body">
                  <div class="skeleton-line skeleton-shimmer" style="width:80%" />
                  <div class="skeleton-line skeleton-shimmer" style="width:60%" />
                </div>
              </div>
            </div>

            <!-- Grid -->
            <PlantGrid v-else-if="catalog.visiblePlants.length > 0" :plants="catalog.visiblePlants" :eager-count="5" :garden-context="gardenName" />

            <div v-else class="empty-state">
              <div class="empty-state-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              </div>
              <p>Ничего не найдено</p>
              <button class="btn-reset" @click="catalog.clearFilters(); catalog.setFilter('garden', gardenName)">Сбросить фильтры</button>
            </div>

            <!-- Infinite scroll sentinel + fallback button -->
            <div v-if="catalog.hasMore" class="load-more">
              <span class="shown-count">
                Показано {{ catalog.visiblePlants.length }} из {{ catalog.filteredCount }}
              </span>
              <div class="load-more-progress">
                <div class="load-more-bar" :style="{ width: Math.round(catalog.visiblePlants.length / catalog.filteredCount * 100) + '%' }" />
              </div>
              <div ref="sentinel" class="scroll-sentinel" />
              <div v-if="isLoadingMore" class="loading-spinner">
                <svg class="spinner-icon" viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="10" fill="none" stroke="var(--gp-primary)" stroke-width="2" stroke-dasharray="50" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" dur="0.8s" from="0 12 12" to="360 12 12" repeatCount="indefinite"/></circle></svg>
              </div>
              <button v-else class="btn-load" @click="catalog.showMore()">
                Показать ещё
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* === CSS Variables === */
.garden-page {
  --gp-primary: #1a5632;
  --gp-primary-light: #2d8b4e;
  --gp-bg: #ffffff;
  --gp-bg-alt: #f7f8fa;
  --gp-text: #1a1a2e;
  --gp-text-secondary: #4a5568;
  --gp-text-muted: #8896a6;
  --gp-border: #e2e8f0;
  --gp-border-light: #edf2f7;
  --gp-radius: 12px;
  --gp-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.06);
  --gp-shadow-lg: 0 4px 24px rgba(0,0,0,0.10);

  padding-bottom: 64px;
}

/* === Cover Hero === */
.cover-hero {
  position: relative;
  height: 200px;
  background: var(--gp-primary);
  overflow: hidden;
}

.cover-trees {
  position: absolute;
  inset: 0;
  z-index: 1;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='70' viewBox='0 0 60 70'%3E%3Cpath d='M30 8l-12 18h7l-9 16h7l-10 18h34l-10-18h7l-9-16h7L30 8z' fill='%23fff' opacity='0.07'/%3E%3Crect x='27' y='60' width='6' height='8' rx='1' fill='%23fff' opacity='0.05'/%3E%3C/svg%3E");
  background-size: 60px 70px;
}

.cover-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to top,
    rgba(0, 0, 0, 0.45) 0%,
    rgba(0, 0, 0, 0.1) 50%,
    transparent 100%
  );
  z-index: 2;
}

.cover-content {
  position: relative;
  z-index: 3;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding-top: 12px;
  padding-bottom: 20px;
}

.cover-breadcrumbs :deep(a),
.cover-breadcrumbs :deep(span) {
  color: rgba(255, 255, 255, 0.75) !important;
  font-size: 13px;
}
.cover-breadcrumbs :deep(a:hover) {
  color: #fff !important;
}

.cover-bottom {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
}

.cover-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

h1 {
  font-size: 26px;
  font-weight: 800;
  color: #fff;
  margin: 0;
  line-height: 1.2;
  text-shadow: 0 2px 8px rgba(0,0,0,0.3);
}

.type-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #fff;
  background: rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 20px;
  white-space: nowrap;
}

.cover-region {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.85);
  margin-top: 6px;
}
.cover-region svg {
  opacity: 0.7;
  flex-shrink: 0;
}

.cover-stats {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
}

.cover-stat {
  text-align: center;
}

.cover-stat-num {
  display: block;
  font-size: 22px;
  font-weight: 800;
  color: #fff;
  line-height: 1.2;
}

.cover-stat-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.7);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.cover-stat-divider {
  width: 1px;
  height: 32px;
  background: rgba(255, 255, 255, 0.2);
}

/* === Profile Info Card === */
.profile-card {
  background: linear-gradient(135deg, #f7faf8 0%, #eef5f0 100%);
  border-radius: var(--gp-radius);
  box-shadow: var(--gp-shadow);
  margin-top: -24px;
  position: relative;
  z-index: 5;
  border: 1px solid rgba(26, 86, 50, 0.1);
  overflow: hidden;
}

.profile-card::before {
  content: '';
  position: absolute;
  right: -10px;
  bottom: -10px;
  width: 160px;
  height: 160px;
  opacity: 0.06;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 120' fill='%231a5632'%3E%3Cpath d='M50 5L30 35h10L25 60h10L20 85h10L18 105h64L70 85h10L65 60h10L60 35h10L50 5z'/%3E%3Crect x='44' y='105' width='12' height='15' rx='2'/%3E%3C/svg%3E") no-repeat center;
  background-size: contain;
  pointer-events: none;
}

.profile-card-body {
  position: relative;
  padding: 24px 28px;
}

.profile-desc {
  font-size: 15px;
  color: var(--gp-text);
  line-height: 1.7;
  margin: 0 0 16px;
}

.profile-contacts {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--gp-text-secondary);
  margin: 0 0 12px;
}
.profile-contacts svg {
  color: var(--gp-primary);
  flex-shrink: 0;
}

.profile-buylink {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  margin-bottom: 16px;
}
.profile-buylink svg {
  color: var(--gp-primary);
  flex-shrink: 0;
}
.profile-buylink a {
  color: var(--gp-primary);
  text-decoration: none;
  font-weight: 500;
}
.profile-buylink a:hover {
  text-decoration: underline;
}

.profile-genera {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.genus-chip {
  font-size: 12px;
  font-weight: 500;
  padding: 5px 14px;
  background: linear-gradient(135deg, rgba(26, 86, 50, 0.06), rgba(26, 86, 50, 0.12));
  border: 1px solid rgba(26, 86, 50, 0.15);
  border-radius: 20px;
  color: var(--gp-primary);
  transition: all 0.2s;
}
.genus-chip:hover {
  background: linear-gradient(135deg, rgba(26, 86, 50, 0.12), rgba(26, 86, 50, 0.2));
}

.btn-edit-garden {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 22px;
  background: transparent;
  border: 1.5px solid var(--gp-primary);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--gp-primary);
  cursor: pointer;
  transition: all 0.2s;
}
.btn-edit-garden:hover {
  background: var(--gp-primary);
  color: #fff;
}

/* === Edit Section === */
.edit-section {
  background: var(--gp-bg);
  border: 1px solid var(--gp-border);
  border-radius: var(--gp-radius);
  padding: 28px;
  margin-top: 20px;
  margin-bottom: 8px;
  box-shadow: var(--gp-shadow);
}

.edit-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--gp-text);
  margin: 0 0 20px;
}

.field {
  margin-bottom: 16px;
}

.field label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--gp-text-secondary);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.field input,
.field textarea {
  width: 100%;
  padding: 11px 14px;
  border: 1.5px solid var(--gp-border);
  border-radius: 8px;
  font-size: 14px;
  background: var(--gp-bg-alt);
  color: var(--gp-text);
  box-sizing: border-box;
  font-family: inherit;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.field input:focus,
.field textarea:focus {
  outline: none;
  border-color: var(--gp-primary);
  box-shadow: 0 0 0 3px rgba(26, 86, 50, 0.1);
}

.edit-actions {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}

.btn-save {
  padding: 11px 28px;
  background: var(--gp-primary);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-save:hover {
  background: var(--gp-primary-light);
}

.btn-cancel {
  padding: 11px 24px;
  background: var(--gp-bg);
  border: 1.5px solid var(--gp-border);
  border-radius: 8px;
  cursor: pointer;
  color: var(--gp-text-secondary);
  font-size: 14px;
  transition: all 0.2s;
}
.btn-cancel:hover {
  border-color: var(--gp-text-muted);
}

/* === Promo Banner === */
.garden-promo {
  margin-top: 20px;
  border-radius: var(--gp-radius);
  overflow: hidden;
  box-shadow: var(--gp-shadow);
}

.garden-promo :deep(.display-viewport) {
  border-radius: var(--gp-radius);
}


/* === Plants Section === */
.garden-plants {
  margin-top: 36px;
}

.section-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 2px solid var(--gp-border-light);
}

h2 {
  font-size: 22px;
  font-weight: 700;
  color: var(--gp-text);
  margin: 0;
}

.section-count {
  font-size: 15px;
  font-weight: 500;
  color: var(--gp-text-muted);
  background: var(--gp-bg-alt);
  padding: 2px 12px;
  border-radius: 20px;
}

/* Catalog layout */
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
  .catalog-layout { flex-direction: column; gap: 16px; }
  .catalog-sidebar { width: 100%; }
}

/* Sort bar */
.sort-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--gp-border-light);
}

.result-count {
  font-size: 13px;
  color: var(--gp-text-secondary);
}
.result-count strong {
  color: var(--gp-text);
  font-weight: 600;
}

/* Active tags */
.active-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 18px;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 7px 14px;
  background: var(--gp-bg-alt);
  border: 1px solid var(--gp-border);
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  color: var(--gp-text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.tag:hover {
  background: #e53e3e;
  color: #fff;
  border-color: #e53e3e;
}

/* Empty state */
.empty-state {
  text-align: center;
  padding: 64px 16px;
  color: var(--gp-text-muted);
}

.empty-state-icon {
  margin-bottom: 16px;
  opacity: 0.35;
}

.empty-state p {
  font-size: 16px;
  margin-bottom: 16px;
}

.btn-reset {
  padding: 10px 24px;
  background: var(--gp-primary);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-reset:hover {
  background: var(--gp-primary-light);
}

/* Load more */
.load-more {
  text-align: center;
  padding: 36px 0;
}

.shown-count {
  display: block;
  font-size: 13px;
  color: var(--gp-text-muted);
  margin-bottom: 10px;
}

.load-more-progress {
  width: 200px;
  height: 3px;
  background: var(--gp-border-light);
  border-radius: 2px;
  margin: 0 auto 16px;
  overflow: hidden;
}

.load-more-bar {
  height: 100%;
  background: var(--gp-primary);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.btn-load {
  padding: 13px 36px;
  min-height: 48px;
  background: var(--gp-bg);
  border: 2px solid var(--gp-primary);
  color: var(--gp-primary);
  border-radius: 10px;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-load:hover {
  background: var(--gp-primary);
  color: #fff;
}

.scroll-sentinel { height: 1px; }
.loading-spinner { display: flex; justify-content: center; padding: 8px 0; }

/* Skeleton cards */
.skeleton-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
@media (min-width: 640px) { .skeleton-grid { grid-template-columns: repeat(3, 1fr); } }
@media (min-width: 1024px) { .skeleton-grid { grid-template-columns: repeat(4, 1fr); } }
@media (min-width: 1280px) { .skeleton-grid { grid-template-columns: repeat(5, 1fr); } }
.skeleton-card { border: 1px solid var(--gp-border); border-radius: var(--gp-radius); overflow: hidden; }
.skeleton-img { aspect-ratio: 0.85; }
.skeleton-body { padding: 10px 12px 14px; display: flex; flex-direction: column; gap: 6px; }
.skeleton-line { height: 12px; border-radius: 4px; }

/* === Responsive === */
@media (min-width: 768px) {
  .cover-hero {
    height: 280px;
  }

  h1 {
    font-size: 34px;
  }

  .cover-stats {
    gap: 20px;
  }

  .cover-stat-num {
    font-size: 26px;
  }

  .cover-content {
    padding-top: 16px;
    padding-bottom: 28px;
  }

  .profile-card-body {
    padding: 28px 36px;
  }
}

@media (max-width: 599px) {
  .cover-hero {
    height: auto;
    min-height: 200px;
    padding-bottom: 0;
  }

  .cover-content {
    padding-bottom: 28px;
  }

  .cover-bottom {
    flex-direction: column;
    align-items: flex-start;
    gap: 14px;
  }

  .cover-stats {
    gap: 12px;
    align-self: stretch;
    justify-content: flex-start;
  }

  .cover-stat-num {
    font-size: 18px;
  }

  .cover-stat-label {
    font-size: 10px;
  }

  .profile-card-body {
    padding: 16px;
  }

  .profile-card::before {
    width: 100px;
    height: 100px;
    right: -8px;
    bottom: -8px;
    opacity: 0.04;
  }

  .edit-section {
    padding: 20px;
  }
}
</style>
