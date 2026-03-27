<script setup lang="ts">
import { useCatalogStore, type Plant } from '~/stores/catalog'

const catalog = useCatalogStore()
onMounted(() => { if (!catalog.isLoaded) catalog.loadCatalog() })

const selectedGenus = ref('')
const selectedCultivar = ref('')
const visible = ref(12)

// Search
const searchQuery = ref('')
const searchFocused = ref(false)

// Bottom sheet
const sheetOpen = ref(false)
const sheetSearch = ref('')

const POPULAR_COUNT = 8

const plantsWithPhotos = computed(() => catalog.catalog.filter(p => p.thumbs.length > 0))

const genera = computed(() => {
  const counts = new Map<string, number>()
  for (const p of plantsWithPhotos.value) {
    counts.set(p.genus, (counts.get(p.genus) || 0) + 1)
  }
  return (catalog.filters?.genera ?? [])
    .map(g => ({ ...g, count: counts.get(g.value) || 0 }))
    .filter(g => g.count > 0)
})

const cultivarTags = computed(() => {
  let plants = plantsWithPhotos.value
  if (selectedGenus.value) {
    plants = plants.filter(p => p.genus === selectedGenus.value)
  }
  const map = new Map<string, { label: string; key: string; count: number; cultivar: string }>()
  for (const p of plants) {
    if (!p.cultivar) continue
    const key = `${p.species_full}||${p.cultivar}`
    const existing = map.get(key)
    if (existing) {
      existing.count++
    } else {
      map.set(key, {
        label: `${p.species_full} '${p.cultivar}'`,
        key,
        count: 1,
        cultivar: p.cultivar,
      })
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
})

const popularTags = computed(() => cultivarTags.value.slice(0, POPULAR_COUNT))

// Inline search suggestions
const searchSuggestions = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (q.length < 2) return []
  return cultivarTags.value
    .filter(cv => cv.label.toLowerCase().includes(q) || cv.cultivar.toLowerCase().includes(q))
    .slice(0, 8)
})

// Sheet filtered list
const sheetList = computed(() => {
  const q = sheetSearch.value.trim().toLowerCase()
  if (!q) return cultivarTags.value
  return cultivarTags.value
    .filter(cv => cv.label.toLowerCase().includes(q) || cv.cultivar.toLowerCase().includes(q))
})

function matchesCultivar(p: Plant) {
  if (!selectedCultivar.value) return true
  return `${p.species_full}||${p.cultivar}` === selectedCultivar.value
}

const displayPlants = computed(() => {
  let plants = plantsWithPhotos.value
  if (selectedGenus.value) plants = plants.filter(p => p.genus === selectedGenus.value)
  if (selectedCultivar.value) plants = plants.filter(matchesCultivar)
  return plants.slice(0, visible.value)
})

const totalCount = computed(() => {
  let plants = plantsWithPhotos.value
  if (selectedGenus.value) plants = plants.filter(p => p.genus === selectedGenus.value)
  if (selectedCultivar.value) plants = plants.filter(matchesCultivar)
  return plants.length
})

const selectedCultivarLabel = computed(() => {
  if (!selectedCultivar.value) return ''
  const tag = cultivarTags.value.find(cv => cv.key === selectedCultivar.value)
  return tag?.label ?? ''
})

function selectGenus(genus: string) {
  selectedGenus.value = selectedGenus.value === genus ? '' : genus
  selectedCultivar.value = ''
  visible.value = 12
  searchQuery.value = ''
}

function selectCultivar(key: string) {
  selectedCultivar.value = selectedCultivar.value === key ? '' : key
  visible.value = 12
  searchQuery.value = ''
  searchFocused.value = false
  sheetOpen.value = false
  sheetSearch.value = ''
}

function clearCultivar() {
  selectedCultivar.value = ''
  visible.value = 12
}

function clearAll() {
  selectedGenus.value = ''
  selectedCultivar.value = ''
  visible.value = 12
}

function openSheet() {
  sheetOpen.value = true
  sheetSearch.value = ''
  document.body.style.overflow = 'hidden'
}

function closeSheet() {
  sheetOpen.value = false
  sheetSearch.value = ''
  document.body.style.overflow = ''
}

function onSearchBlur() {
  // Delay to allow click on suggestion
  setTimeout(() => { searchFocused.value = false }, 200)
}

function showMore() { visible.value += 12 }

const catalogLink = computed(() => {
  if (selectedCultivar.value) {
    const [speciesFull, cultivar] = selectedCultivar.value.split('||')
    return `/catalog?cultivar=${encodeURIComponent(cultivar + '||' + speciesFull)}`
  }
  if (selectedGenus.value) return `/catalog?genus=${selectedGenus.value}`
  return '/catalog'
})
</script>

<template>
  <section class="home-catalog">
    <div class="container">
      <div class="hc-header">
        <h2 class="hc-title">Каталог сортов</h2>
        <NuxtLink :to="catalogLink" class="hc-all">
          Фильтры
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M9 18l6-6-6-6"/></svg>
        </NuxtLink>
      </div>

      <!-- Genus tabs -->
      <div class="genus-scroll">
        <button
          class="genus-tab"
          :class="{ active: !selectedGenus }"
          @click="selectedGenus = ''; selectedCultivar = ''; visible = 12; searchQuery = ''"
        >Все <span class="tab-count">{{ plantsWithPhotos.length }}</span></button>
        <button
          v-for="g in genera"
          :key="g.value"
          class="genus-tab"
          :class="{ active: selectedGenus === g.value }"
          @click="selectGenus(g.value)"
        >{{ g.label }} <span class="tab-count">{{ g.count }}</span></button>
      </div>

      <!-- Search + cultivar selection -->
      <div v-if="cultivarTags.length > 0" class="cv-section">
        <!-- Search input -->
        <div class="cv-search-wrap">
          <div class="cv-search-box">
            <svg class="cv-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input
              v-model="searchQuery"
              class="cv-search-input"
              type="text"
              placeholder="Найти сорт..."
              @focus="searchFocused = true"
              @blur="onSearchBlur"
            />
            <button v-if="searchQuery" class="cv-search-clear" @click="searchQuery = ''">&times;</button>
          </div>

          <!-- Search suggestions dropdown -->
          <div v-if="searchFocused && searchSuggestions.length > 0" class="cv-suggestions">
            <button
              v-for="s in searchSuggestions"
              :key="s.key"
              class="cv-suggestion"
              @mousedown.prevent="selectCultivar(s.key)"
            >
              <span class="cv-suggestion-label">{{ s.label }}</span>
              <span class="cv-suggestion-count">{{ s.count }}</span>
            </button>
          </div>
        </div>

        <!-- Selected cultivar chip -->
        <div v-if="selectedCultivar" class="cv-selected">
          <span class="cv-selected-chip">
            {{ selectedCultivarLabel }}
            <button class="cv-selected-clear" @click="clearCultivar">&times;</button>
          </span>
        </div>

        <!-- Popular tags + "All" button -->
        <div v-else class="cv-popular">
          <span class="cv-popular-label">Популярные:</span>
          <div class="cv-popular-tags">
            <button
              v-for="cv in popularTags"
              :key="cv.key"
              class="cv-tag"
              @click="selectCultivar(cv.key)"
            >{{ cv.cultivar }}<span class="cv-count">{{ cv.count }}</span></button>
            <button class="cv-tag cv-all-btn" @click="openSheet">
              Все {{ cultivarTags.length }} сортов
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M6 9l6 6 6-6"/></svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Results info -->
      <div class="hc-info">
        <span class="hc-found">Найдено: <strong>{{ totalCount }}</strong></span>
        <span v-if="selectedCultivar" class="hc-clear" @click="clearCultivar">Сбросить</span>
        <span v-else-if="selectedGenus" class="hc-clear" @click="clearAll">Сбросить</span>
      </div>

      <!-- Plant grid -->
      <PlantGrid :plants="displayPlants" />

      <!-- Footer -->
      <div class="hc-footer">
        <button v-if="visible < totalCount" class="hc-more" @click="showMore">Показать ещё</button>
        <NuxtLink :to="catalogLink" class="hc-catalog-link">Каталог с расширенными фильтрами →</NuxtLink>
      </div>
    </div>

    <!-- Bottom sheet overlay -->
    <Teleport to="body">
      <Transition name="sheet">
        <div v-if="sheetOpen" class="sheet-overlay" @click.self="closeSheet">
          <div class="sheet-panel">
            <div class="sheet-header">
              <h3 class="sheet-title">Выберите сорт</h3>
              <button class="sheet-close" @click="closeSheet">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div class="sheet-search">
              <svg class="cv-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              <input
                v-model="sheetSearch"
                class="sheet-search-input"
                type="text"
                placeholder="Поиск по названию..."
              />
              <button v-if="sheetSearch" class="cv-search-clear" @click="sheetSearch = ''">&times;</button>
            </div>
            <div class="sheet-count">{{ sheetList.length }} сортов</div>
            <div class="sheet-list">
              <button
                v-for="cv in sheetList"
                :key="cv.key"
                class="sheet-item"
                :class="{ active: selectedCultivar === cv.key }"
                @click="selectCultivar(cv.key)"
              >
                <span class="sheet-item-label">{{ cv.label }}</span>
                <span class="sheet-item-count">{{ cv.count }}</span>
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<style scoped>
.home-catalog {
  padding: 32px 0 48px;
  border-top: 1px solid var(--border-light);
}

.hc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.hc-title { font-size: 20px; font-weight: 700; }
.hc-all {
  display: flex; align-items: center; gap: 4px;
  font-size: 13px; font-weight: 600; color: var(--primary);
}

@media (min-width: 768px) {
  .home-catalog { padding: 48px 0 64px; }
  .hc-title { font-size: 28px; }
  .hc-all { font-size: 14px; }
}

/* ── Genus tabs ── */
.genus-scroll {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  margin: 0 -16px 14px;
  padding: 0 16px 4px;
}

.genus-scroll::-webkit-scrollbar { display: none; }

@media (min-width: 1024px) {
  .genus-scroll {
    flex-wrap: wrap;
    overflow-x: visible;
    margin: 0 0 18px;
    padding: 0;
  }
}

.genus-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 14px;
  border: 1.5px solid var(--border);
  border-radius: 20px;
  background: var(--bg);
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  flex-shrink: 0;
}

.genus-tab:hover { border-color: var(--primary); color: var(--primary); }

.genus-tab.active {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

.genus-tab.active .tab-count {
  background: rgba(255,255,255,0.25);
  color: #fff;
}

.tab-count {
  font-size: 11px; font-weight: 700;
  background: var(--bg-alt); color: var(--text-muted);
  padding: 1px 6px; border-radius: 8px;
}

/* ── Cultivar section ── */
.cv-section {
  margin-bottom: 16px;
}

/* ── Search ── */
.cv-search-wrap {
  position: relative;
  margin-bottom: 12px;
}

.cv-search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
  transition: border-color 0.15s;
}

.cv-search-box:focus-within {
  border-color: var(--primary);
}

.cv-search-icon {
  flex-shrink: 0;
  color: var(--text-muted);
}

.cv-search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: var(--text);
  font-family: inherit;
}

.cv-search-input::placeholder {
  color: var(--text-muted);
}

.cv-search-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 50%;
  background: var(--bg-alt);
  color: var(--text-muted);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}

/* ── Suggestions dropdown ── */
.cv-suggestions {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  z-index: 50;
  max-height: 280px;
  overflow-y: auto;
}

.cv-suggestion {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 14px;
  border: none;
  background: transparent;
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
  text-align: left;
  transition: background 0.1s;
  font-family: inherit;
}

.cv-suggestion:hover {
  background: var(--bg-alt);
}

.cv-suggestion + .cv-suggestion {
  border-top: 1px solid var(--border-light);
}

.cv-suggestion-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cv-suggestion-count {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
  background: var(--bg-alt);
  padding: 1px 6px;
  border-radius: 6px;
  margin-left: 8px;
}

/* ── Selected cultivar ── */
.cv-selected {
  margin-bottom: 4px;
}

.cv-selected-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  background: var(--primary);
  color: #fff;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
}

.cv-selected-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: rgba(255,255,255,0.25);
  color: #fff;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
}

.cv-selected-clear:hover {
  background: rgba(255,255,255,0.4);
}

/* ── Popular tags ── */
.cv-popular-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.cv-popular-tags {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  margin: 0 -16px;
  padding: 0 16px 4px;
}

.cv-popular-tags::-webkit-scrollbar { display: none; }

@media (min-width: 1024px) {
  .cv-popular-tags {
    flex-wrap: wrap;
    overflow-x: visible;
    margin: 0;
    padding: 0;
  }
}

.cv-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 13px;
  border: 1.5px solid var(--border);
  border-radius: 20px;
  background: var(--bg);
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  flex-shrink: 0;
}

.cv-tag:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.cv-count {
  font-size: 11px; font-weight: 700;
  background: var(--bg-alt); color: var(--text-muted);
  padding: 1px 6px; border-radius: 8px;
}

.cv-all-btn {
  color: var(--primary);
  border-color: var(--primary);
  font-weight: 600;
  background: rgba(26, 86, 50, 0.04);
}

.cv-all-btn:hover {
  background: var(--primary);
  color: #fff;
}

/* ── Info ── */
.hc-info {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-light);
}

.hc-found { font-size: 13px; color: var(--text-secondary); }
.hc-found strong { color: var(--text); }
.hc-clear { font-size: 12px; color: var(--primary); cursor: pointer; font-weight: 500; }
.hc-clear:hover { text-decoration: underline; }

/* ── Footer ── */
.hc-footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin-top: 24px;
}

.hc-more {
  padding: 11px 28px;
  background: var(--bg);
  border: 2px solid var(--primary);
  color: var(--primary);
  border-radius: var(--radius);
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
}

.hc-more:hover { background: var(--primary); color: #fff; }

.hc-catalog-link {
  font-size: 13px; color: var(--text-muted); font-weight: 500;
}
.hc-catalog-link:hover { color: var(--primary); }

/* ── Bottom sheet ── */
.sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

@media (min-width: 768px) {
  .sheet-overlay {
    align-items: center;
  }
}

.sheet-panel {
  background: var(--bg, #fff);
  width: 100%;
  max-height: 85vh;
  border-radius: 20px 20px 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

@media (min-width: 768px) {
  .sheet-panel {
    max-width: 520px;
    max-height: 70vh;
    border-radius: 16px;
  }
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--border-light);
}

.sheet-title {
  font-size: 17px;
  font-weight: 700;
}

.sheet-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: var(--bg-alt);
  color: var(--text-secondary);
  cursor: pointer;
}

.sheet-close:hover {
  background: var(--border);
}

.sheet-search {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 20px 0;
  padding: 10px 14px;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-alt);
}

.sheet-search:focus-within {
  border-color: var(--primary);
  background: var(--bg);
}

.sheet-search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: var(--text);
  font-family: inherit;
}

.sheet-search-input::placeholder {
  color: var(--text-muted);
}

.sheet-count {
  padding: 8px 20px 4px;
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
}

.sheet-list {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 4px 0;
}

.sheet-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 12px 20px;
  border: none;
  background: transparent;
  font-size: 14px;
  color: var(--text);
  cursor: pointer;
  text-align: left;
  transition: background 0.1s;
  font-family: inherit;
}

.sheet-item:hover {
  background: var(--bg-alt);
}

.sheet-item.active {
  background: rgba(26, 86, 50, 0.08);
  color: var(--primary);
  font-weight: 600;
}

.sheet-item + .sheet-item {
  border-top: 1px solid var(--border-light);
}

.sheet-item-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sheet-item-count {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted);
  background: var(--bg-alt);
  padding: 2px 8px;
  border-radius: 8px;
  margin-left: 12px;
}

.sheet-item.active .sheet-item-count {
  background: rgba(26, 86, 50, 0.15);
  color: var(--primary);
}

/* ── Sheet transition ── */
.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.2s ease;
}
.sheet-enter-active .sheet-panel,
.sheet-leave-active .sheet-panel {
  transition: transform 0.25s ease;
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}
.sheet-enter-from .sheet-panel {
  transform: translateY(100%);
}
.sheet-leave-to .sheet-panel {
  transform: translateY(100%);
}

@media (min-width: 768px) {
  .sheet-enter-from .sheet-panel {
    transform: translateY(30px) scale(0.96);
  }
  .sheet-leave-to .sheet-panel {
    transform: translateY(30px) scale(0.96);
  }
}
</style>
