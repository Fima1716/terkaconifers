<script setup lang="ts">
import { useCatalogStore } from '~/stores/catalog'

const catalog = useCatalogStore()
const showAllGenera = ref(false)
const showAllSpecies = ref(false)
const filtersOpen = ref(false)
const regionOpen = ref(false)
const regionSearch = ref('')

const dc = computed(() => catalog.dynamicCounts)

const visibleGenera = computed(() => {
  const genera = catalog.filters?.genera ?? []
  return showAllGenera.value ? genera : genera.slice(0, 6)
})

const filteredRegions = computed(() => {
  const regions = catalog.filters?.regions ?? []
  const q = regionSearch.value.toLowerCase()
  const list = q ? regions.filter(r => r.value.toLowerCase().includes(q)) : regions
  // Use dynamic counts
  return list
    .map(r => ({ ...r, count: dc.value.regionCounts.get(r.value) || 0 }))
    .filter(r => r.count > 0)
    .slice(0, 25)
})

const dynamicSpecies = computed(() => {
  const species = catalog.availableSpecies
  return species.map(sp => ({
    ...sp,
    count: dc.value.speciesCounts.get(sp.value) || 0,
  })).filter(sp => sp.count > 0)
})

function toggleGenus(genus: string) {
  const current = [...catalog.activeFilters.genus]
  const idx = current.indexOf(genus)
  if (idx >= 0) current.splice(idx, 1)
  else current.push(genus)
  catalog.setFilter('genus', current)
  catalog.setFilter('species', '')
}

function selectRegion(value: string) {
  catalog.setFilter('region', value)
  regionOpen.value = false
  regionSearch.value = ''
}

const activeCount = computed(() => {
  let count = 0
  const f = catalog.activeFilters
  if (f.genus.length) count++
  if (f.species) count++
  if (f.color) count++
  if (f.region) count++
  if (f.isRussian) count++
  if (f.inStock) count++
  if (f.ageRange) count++
  return count
})
</script>

<template>
  <div class="filters-wrapper">
    <!-- Mobile toggle -->
    <button class="filters-toggle" @click="filtersOpen = !filtersOpen">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
        <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>
        <circle cx="8" cy="6" r="2" fill="currentColor"/><circle cx="16" cy="12" r="2" fill="currentColor"/><circle cx="10" cy="18" r="2" fill="currentColor"/>
      </svg>
      Фильтры
      <span v-if="activeCount" class="filter-count-badge">{{ activeCount }}</span>
    </button>

    <!-- Mobile overlay -->
    <Transition name="fade">
      <div v-if="filtersOpen" class="filters-overlay" @click="filtersOpen = false" />
    </Transition>

    <aside class="filters" :class="{ open: filtersOpen }">
      <!-- Mobile close button -->
      <div class="filters-mobile-head">
        <h3>Фильтры</h3>
        <button class="filters-close" @click="filtersOpen = false">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <!-- Clear all -->
      <button v-if="activeCount > 0" class="clear-all" @click="catalog.clearFilters()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
        Сбросить все фильтры
      </button>

      <!-- ★ Quick toggles -->
      <div class="fg fg-highlight">
        <label v-if="dc.newCount > 0" class="stock-toggle" :class="{ active: catalog.activeFilters.onlyNew }">
          <span class="st-switch">
            <input type="checkbox" :checked="catalog.activeFilters.onlyNew" @change="catalog.setFilter('onlyNew', !catalog.activeFilters.onlyNew)">
            <span class="st-track st-track-orange" />
          </span>
          <span class="st-label">Новинки</span>
          <span class="fg-count" style="color: #ff6d00; font-weight: 700;">{{ dc.newCount }}</span>
        </label>
        <label class="stock-toggle" :class="{ active: catalog.activeFilters.inStock }">
          <span class="st-switch">
            <input type="checkbox" :checked="catalog.activeFilters.inStock" @change="catalog.setFilter('inStock', !catalog.activeFilters.inStock)">
            <span class="st-track" />
          </span>
          <span class="st-label">В наличии</span>
          <span class="fg-count fg-count-green">{{ dc.inStockCount }}</span>
        </label>
      </div>

      <!-- Genus -->
      <div class="fg">
        <h4 class="fg-title">Род растения</h4>
        <div class="fg-list">
          <label
            v-for="g in visibleGenera"
            :key="g.value"
            class="fg-check"
            :class="{ selected: catalog.activeFilters.genus.includes(g.value), dimmed: (dc.genusCounts.get(g.value) || 0) === 0 }"
          >
            <input type="checkbox" :checked="catalog.activeFilters.genus.includes(g.value)" @change="toggleGenus(g.value)">
            <span class="fg-check-box">
              <svg v-if="catalog.activeFilters.genus.includes(g.value)" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" width="12" height="12"><path d="M20 6L9 17l-5-5"/></svg>
            </span>
            <span class="fg-check-label">{{ g.label }}</span>
            <span class="fg-count">{{ dc.genusCounts.get(g.value) || 0 }}</span>
          </label>
        </div>
        <button v-if="(catalog.filters?.genera.length ?? 0) > 6" class="fg-more" @click="showAllGenera = !showAllGenera">
          {{ showAllGenera ? 'Свернуть' : `Ещё ${(catalog.filters?.genera.length ?? 0) - 6}` }}
        </button>
      </div>

      <!-- Species -->
      <div v-if="dynamicSpecies.length > 0" class="fg">
        <h4 class="fg-title">Вид</h4>
        <div class="fg-list">
          <label
            v-for="sp in (showAllSpecies ? dynamicSpecies : dynamicSpecies.slice(0, 8))"
            :key="sp.value"
            class="fg-radio fg-radio-species"
            :class="{ selected: catalog.activeFilters.species === sp.value }"
          >
            <input type="radio" name="species" :value="sp.value" :checked="catalog.activeFilters.species === sp.value" @change="catalog.setFilter('species', sp.value)">
            <span class="fg-radio-dot" />
            <span class="fg-species-info">
              <span class="fg-species-latin">{{ sp.latin }}</span>
              <span class="fg-species-ru">{{ sp.label }}</span>
            </span>
            <span class="fg-count">{{ sp.count }}</span>
          </label>
          <label v-if="catalog.activeFilters.species" class="fg-radio" @click="catalog.setFilter('species', '')">
            <span class="fg-radio-dot" />
            <span class="fg-check-label fg-reset">Все виды</span>
          </label>
        </div>
        <button v-if="dynamicSpecies.length > 8" class="fg-more" @click="showAllSpecies = !showAllSpecies">
          {{ showAllSpecies ? 'Свернуть' : `Ещё ${dynamicSpecies.length - 8}` }}
        </button>
      </div>

      <!-- Color — temporarily hidden by request -->
      <div v-if="false" class="fg">
        <h4 class="fg-title">Цвет хвои</h4>
        <div class="color-grid">
          <button
            v-for="c in catalog.filters.colors"
            :key="c.value"
            class="color-btn"
            :class="{ active: catalog.activeFilters.color === c.value, dimmed: (dc.colorCounts.get(c.value) || 0) === 0 }"
            @click="catalog.setFilter('color', catalog.activeFilters.color === c.value ? '' : c.value)"
          >
            <span class="color-swatch" :style="c.swatch ? { background: c.swatch } : { background: 'conic-gradient(#6BA4C9, #D4A843, #2D8B4E, #CC4444, #6BA4C9)' }" />
            <span class="color-label">{{ c.label }}</span>
            <span class="fg-count">{{ dc.colorCounts.get(c.value) || 0 }}</span>
          </button>
        </div>
      </div>

      <!-- Region -->
      <div v-if="catalog.filters?.regions?.length" class="fg">
        <h4 class="fg-title">Регион</h4>
        <div class="custom-select" :class="{ open: regionOpen }">
          <button class="cs-trigger" @click="regionOpen = !regionOpen">
            <span v-if="catalog.activeFilters.region" class="cs-value">{{ catalog.activeFilters.region }}</span>
            <span v-else class="cs-placeholder">Все регионы</span>
            <svg class="cs-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          <div v-if="regionOpen" class="cs-dropdown">
            <input v-model="regionSearch" type="text" class="cs-search" placeholder="Поиск региона..." @click.stop>
            <div class="cs-options">
              <button class="cs-option" :class="{ active: !catalog.activeFilters.region }" @click="selectRegion('')">Все регионы</button>
              <button
                v-for="r in filteredRegions"
                :key="r.value"
                class="cs-option"
                :class="{ active: catalog.activeFilters.region === r.value }"
                @click="selectRegion(r.value)"
              >
                {{ r.value }} <span class="fg-count">{{ r.count }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Russian varieties -->
      <div class="fg">
        <label class="stock-toggle" :class="{ active: catalog.activeFilters.isRussian }">
          <span class="st-switch">
            <input type="checkbox" :checked="catalog.activeFilters.isRussian" @change="catalog.setFilter('isRussian', !catalog.activeFilters.isRussian)">
            <span class="st-track" />
          </span>
          <span class="st-label">Российские сорта</span>
          <span class="fg-count">{{ dc.russianCount }}</span>
        </label>
      </div>

      <!-- Age (dynamic counts) -->
      <div v-if="catalog.filters?.ageRanges?.length" class="fg">
        <h4 class="fg-title">Возраст</h4>
        <div class="chip-grid">
          <button
            v-for="a in catalog.filters.ageRanges"
            :key="a.value"
            class="chip"
            :class="{ active: catalog.activeFilters.ageRange === a.value, dimmed: (dc.ageCounts[a.value] || 0) === 0 }"
            @click="catalog.setFilter('ageRange', catalog.activeFilters.ageRange === a.value ? '' : a.value)"
          >
            {{ a.label }}
            <span class="chip-count">{{ dc.ageCounts[a.value] || 0 }}</span>
          </button>
        </div>
      </div>

      <!-- Mobile: show results button -->
      <div class="filters-mobile-foot">
        <button class="btn-show-results" @click="filtersOpen = false">
          Показать {{ catalog.filteredCount }} результатов
        </button>
      </div>
    </aside>
  </div>
</template>

<style scoped>
/* ── Mobile toggle ──────────────── */
.filters-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  min-height: 48px;
  background: var(--bg);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  width: 100%;
  transition: border-color 0.15s;
}
.filters-toggle:hover { border-color: var(--primary); }

.filter-count-badge {
  background: var(--primary); color: #fff;
  font-size: 11px; font-weight: 700;
  min-width: 20px; height: 20px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  margin-left: auto;
}

@media (min-width: 1024px) { .filters-toggle { display: none; } }

/* ── Mobile overlay ─────────────── */
.filters-overlay {
  display: none;
}
@media (max-width: 1023px) {
  .filters-overlay {
    display: block; position: fixed; inset: 0; z-index: 150;
    background: rgba(0, 0, 0, 0.4);
  }
}

/* ── Sidebar / Mobile drawer ────── */
.filters {
  display: none;
  flex-direction: column;
  gap: 0;
  padding: 12px 0;
}

@media (max-width: 1023px) {
  .filters {
    position: fixed; top: 0; right: 0; bottom: 0;
    width: 100%; max-width: 400px;
    z-index: 200; background: #fff;
    box-shadow: -4px 0 24px rgba(0,0,0,0.15);
    padding: 0;
    transform: translateX(100%);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .filters.open {
    display: flex;
    transform: translateX(0);
  }
}

@media (min-width: 1024px) {
  .filters { display: flex; padding: 0; }
}

/* Mobile drawer header */
.filters-mobile-head {
  display: none;
}
@media (max-width: 1023px) {
  .filters-mobile-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px; border-bottom: 1px solid var(--border-light);
    position: sticky; top: 0; background: #fff; z-index: 5;
  }
  .filters-mobile-head h3 { font-size: 18px; font-weight: 700; }
  .filters-close {
    width: 40px; height: 40px; border-radius: 50%;
    background: var(--bg-alt); border: none; color: var(--text);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
  }
  .fg { padding: 14px 20px; }
  .fg-title { padding-left: 0; }
  .chip-grid { padding: 0; }
  .fg-list { padding: 0; }
  .clear-all { padding: 8px 20px; }
  .fg-highlight { margin: 0 12px; padding: 12px 8px; }
}

/* Mobile drawer footer */
.filters-mobile-foot { display: none; }
@media (max-width: 1023px) {
  .filters-mobile-foot {
    display: block; position: sticky; bottom: 0;
    padding: 12px 20px; background: var(--bg);
    border-top: 1px solid var(--border-light);
    padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  }
  .btn-show-results {
    width: 100%; padding: 14px; background: var(--primary);
    color: #fff; border: none; border-radius: var(--radius-sm);
    font-size: 15px; font-weight: 700; cursor: pointer;
  }
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.clear-all {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  color: var(--danger);
  font-size: 12px;
  font-weight: 500;
  padding: 8px 0;
}

/* ── Filter group ───────────────── */
.fg { padding: 14px 8px; border-bottom: 1px solid var(--border-light); }
@media (min-width: 1024px) { .fg { padding: 14px 0; } }
.fg-highlight { background: linear-gradient(to right, rgba(26, 86, 50, 0.04), transparent); border-radius: 8px; padding: 12px 8px; margin-bottom: 4px; }

.fg-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary);
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.fg-list { display: flex; flex-direction: column; gap: 1px; }

/* Dimmed state for zero-count items */
.dimmed { opacity: 0.35; }

/* ── Checkbox ───────────────────── */
.fg-check {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 8px;
  min-height: 44px;
  border-radius: 6px;
  transition: background 0.1s;
}
.fg-check:hover { background: var(--bg-alt); }
.fg-check.selected { background: rgba(26, 86, 50, 0.06); }
.fg-check input { display: none; }

.fg-check-box {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1.5px solid var(--border);
  background: var(--bg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s;
}
.fg-check.selected .fg-check-box { background: var(--primary); border-color: var(--primary); }

.fg-check-label { flex: 1; font-size: 13px; color: var(--text); }
.fg-count { font-size: 11px; color: var(--text-muted); font-weight: 500; }
.fg-count-green { color: var(--primary); font-weight: 700; }

/* ── Species two-line layout ────── */
.fg-radio-species { align-items: flex-start; padding-top: 10px; padding-bottom: 10px; }
.fg-radio-species .fg-radio-dot { margin-top: 3px; }
.fg-radio-species .fg-count { margin-top: 3px; }

.fg-species-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.fg-species-latin {
  font-size: 13px;
  font-weight: 600;
  font-style: italic;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fg-species-ru {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fg-more { background: none; border: none; color: var(--primary); font-size: 12px; font-weight: 600; padding: 4px 8px; margin-top: 2px; }
.fg-reset { color: var(--primary); font-weight: 600; }

/* ── Radio ──────────────────────── */
.fg-radio {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 8px;
  min-height: 44px;
  border-radius: 6px;
  transition: background 0.1s;
}
.fg-radio:hover { background: var(--bg-alt); }
.fg-radio.selected { background: rgba(26, 86, 50, 0.06); }
.fg-radio input { display: none; }

.fg-radio-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1.5px solid var(--border);
  background: var(--bg);
  flex-shrink: 0;
  position: relative;
  transition: border-color 0.15s;
}
.fg-radio.selected .fg-radio-dot { border-color: var(--primary); }
.fg-radio.selected .fg-radio-dot::after {
  content: '';
  position: absolute;
  top: 3px; left: 3px; right: 3px; bottom: 3px;
  border-radius: 50%;
  background: var(--primary);
}

/* ── Color swatches ─────────────── */
.color-grid { display: flex; flex-direction: column; gap: 1px; }

.color-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 6px 8px;
  background: none;
  border: none;
  border-radius: 6px;
  text-align: left;
  cursor: pointer;
  transition: background 0.1s;
}
.color-btn:hover { background: var(--bg-alt); }
.color-btn.active { background: rgba(26, 86, 50, 0.06); }

.color-swatch {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid var(--bg);
  box-shadow: 0 0 0 1px var(--border);
  flex-shrink: 0;
  transition: box-shadow 0.15s;
}
.color-btn.active .color-swatch { box-shadow: 0 0 0 2px var(--primary); }

.color-label { flex: 1; font-size: 13px; color: var(--text); }

/* ── Chips ──────────────────────── */
.chip-grid { display: flex; flex-wrap: wrap; gap: 6px; }

.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: var(--bg);
  border: 1.5px solid var(--border);
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}
.chip:hover { border-color: var(--primary); color: var(--primary); }
.chip.active { background: var(--primary); border-color: var(--primary); color: #fff; }
.chip.active .chip-count { color: rgba(255, 255, 255, 0.7); }
.chip-count { font-size: 10px; color: var(--text-muted); font-weight: 600; }

/* ── Custom select ──────────────── */
.custom-select { position: relative; }

.cs-trigger {
  display: flex;
  align-items: center;
  width: 100%;
  height: 38px;
  padding: 0 32px 0 12px;
  background: var(--bg);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--text);
  text-align: left;
  cursor: pointer;
  position: relative;
  transition: border-color 0.15s;
}
.cs-trigger:hover { border-color: var(--primary-light); }
.custom-select.open .cs-trigger { border-color: var(--primary); border-radius: var(--radius-sm) var(--radius-sm) 0 0; }

.cs-placeholder { color: var(--text-muted); }
.cs-value { font-weight: 500; }

.cs-arrow {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  transition: transform 0.15s;
}
.custom-select.open .cs-arrow { transform: translateY(-50%) rotate(180deg); }

.cs-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--bg);
  border: 1.5px solid var(--primary);
  border-top: 1px solid var(--border-light);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
  z-index: 10;
  overflow: hidden;
}

.cs-search {
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-bottom: 1px solid var(--border-light);
  font-size: 13px;
  outline: none;
  background: var(--bg-alt);
}
.cs-search::placeholder { color: var(--text-muted); }

.cs-options { max-height: 200px; overflow-y: auto; }

.cs-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 12px;
  background: none;
  border: none;
  font-size: 13px;
  color: var(--text);
  text-align: left;
  cursor: pointer;
  transition: background 0.1s;
}
.cs-option:hover { background: var(--bg-alt); }
.cs-option.active { color: var(--primary); font-weight: 600; background: rgba(26, 86, 50, 0.05); }

/* ── Toggle switch (In stock / Russian) ── */
.stock-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  padding: 4px 0;
}

.st-switch {
  position: relative;
  width: 40px;
  height: 22px;
  flex-shrink: 0;
}
.st-switch input { display: none; }

.st-track {
  position: absolute;
  inset: 0;
  background: var(--border);
  border-radius: 11px;
  transition: background 0.2s;
}
.st-track::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  background: #fff;
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
  transition: transform 0.2s;
}

.stock-toggle.active .st-track { background: var(--primary); }
.stock-toggle.active .st-track-orange { background: #ff6d00; }
.stock-toggle.active .st-track::after { transform: translateX(18px); }

.st-label { flex: 1; font-size: 13px; font-weight: 600; color: var(--text); }
</style>
