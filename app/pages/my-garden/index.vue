<script setup lang="ts">
import { useGardenStore, STATUS_LABELS, STATUS_COLORS, SCHEDULE_LABELS } from '~/stores/garden'
import type { PlantStatus, CareSchedule } from '~/stores/garden'
import { useCatalogStore } from '~/stores/catalog'
import { useAuthStore } from '~/stores/auth'
import { thumbWebpUrl } from '~/utils/photoUrl'

definePageMeta({ middleware: 'admin' })
useHead({ title: 'Мой Сад — Территория Хвойных' })

const garden = useGardenStore()
const catalog = useCatalogStore()
const auth = useAuthStore()
const router = useRouter()

// Garden auth (code-based, no personal data)
const gardenMode = ref<'loading' | 'code' | 'admin' | 'owner'>('loading')
const gardenName = ref('')
const codeInput = ref('')
const codeError = ref('')
const codeLoading = ref(false)

async function checkGardenAccess() {
  await auth.fetchMe()
  if (auth.isSuperAdmin) {
    gardenMode.value = 'admin'
    if (!catalog.isLoaded) catalog.loadCatalog()
    garden.load()
    return
  }
  try {
    const res = await $fetch<{ mode: string; garden: string | null }>('/api/garden-me')
    if (res.mode === 'owner' && res.garden) {
      gardenName.value = res.garden
      gardenMode.value = 'owner'
      if (!catalog.isLoaded) catalog.loadCatalog()
      garden.load()
      return
    }
    if (res.mode === 'admin') {
      gardenMode.value = 'admin'
      if (!catalog.isLoaded) catalog.loadCatalog()
      garden.load()
      return
    }
  } catch {}
  gardenMode.value = 'code'
}

async function submitCode() {
  codeError.value = ''
  codeLoading.value = true
  try {
    const res = await $fetch<{ garden: string }>('/api/garden-auth', {
      method: 'POST',
      body: { code: codeInput.value.trim() },
    })
    gardenName.value = res.garden
    gardenMode.value = 'owner'
    if (!catalog.isLoaded) catalog.loadCatalog()
    garden.load()
  } catch (e: any) {
    codeError.value = e?.data?.message || 'Неверный код'
  }
  codeLoading.value = false
}

const isOwner = computed(() => gardenMode.value === 'owner')

onMounted(checkGardenAccess)

// Filters
const activeFilter = ref<PlantStatus | 'all'>('all')

const filteredPlants = computed(() => {
  if (activeFilter.value === 'all') return garden.plants
  return garden.byStatus(activeFilter.value)
})

const filters: { key: PlantStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'growing', label: 'Растут' },
  { key: 'sleeping', label: 'Спят' },
  { key: 'sick', label: 'Болеют' },
  { key: 'dead', label: 'Погибли' },
]

function filterCount(key: PlantStatus | 'all') {
  if (key === 'all') return garden.count
  return garden.byStatus(key).length
}

// Add plant modal
const showAddModal = ref(false)
const addMode = ref<'catalog' | 'manual'>('catalog')
const searchQuery = ref('')
const manualForm = ref({ manualName: '', manualSpecies: '', nickname: '', zone: '', plantedAt: '', notes: '' })

const catalogResults = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (q.length < 2 || !catalog.isLoaded) return []
  return catalog.catalog
    .filter(p => p.latin_full.toLowerCase().includes(q) || (p.species_ru && p.species_ru.toLowerCase().includes(q)) || (p.genus_ru && p.genus_ru.toLowerCase().includes(q)))
    .slice(0, 12)
})

async function addFromCatalog(plantId: number) {
  await garden.addPlant({ catalogId: plantId })
  showAddModal.value = false
  searchQuery.value = ''
}

async function addManual() {
  if (!manualForm.value.manualName.trim()) return
  await garden.addPlant({
    ...manualForm.value,
    status: 'growing',
  })
  showAddModal.value = false
  manualForm.value = { manualName: '', manualSpecies: '', nickname: '', zone: '', plantedAt: '', notes: '' }
}

function getCatalogPlant(catalogId: number | null) {
  if (!catalogId || !catalog.isLoaded) return null
  return catalog.getPlantById(catalogId)
}

function plantDisplayName(plant: any) {
  if (plant.catalogId) {
    const cp = getCatalogPlant(plant.catalogId)
    return cp?.latin_full || `Каталог #${plant.catalogId}`
  }
  return plant.manualName || 'Без названия'
}

function plantThumb(plant: any) {
  if (plant.catalogId) {
    const cp = getCatalogPlant(plant.catalogId)
    if (cp?.thumbs[0]) return thumbWebpUrl(cp.thumbs[0])
  }
  return null
}

function plantSpecies(plant: any) {
  if (plant.catalogId) {
    const cp = getCatalogPlant(plant.catalogId)
    return cp?.species_ru || ''
  }
  return plant.manualSpecies || ''
}

// Tasks from schedules
const todayStr = computed(() => new Date().toISOString().slice(0, 10))

const overdueTasks = computed(() =>
  garden.schedules.filter(s => s.active && s.nextDue && s.nextDue < todayStr.value)
)
const todayTasks = computed(() =>
  garden.schedules.filter(s => s.active && s.nextDue === todayStr.value)
)
const upcomingTasks = computed(() => {
  const in3 = new Date()
  in3.setDate(in3.getDate() + 3)
  const in3str = in3.toISOString().slice(0, 10)
  return garden.schedules.filter(s => s.active && s.nextDue && s.nextDue > todayStr.value && s.nextDue <= in3str)
})

const hasTasks = computed(() => overdueTasks.value.length + todayTasks.value.length + upcomingTasks.value.length > 0)

function taskPlantName(s: CareSchedule) {
  const p = garden.getPlant(s.plantId)
  if (!p) return ''
  if (p.nickname) return p.nickname
  if (p.catalogId) {
    const cp = getCatalogPlant(p.catalogId)
    return cp?.latin_full || ''
  }
  return p.manualName || ''
}

async function markDone(id: string) {
  await garden.markDone(id)
}
</script>

<template>
  <div class="garden-page container">
    <BreadCrumbs :items="[{ label: 'Главная', to: '/' }, { label: 'Мой Сад' }]" />

    <!-- Code entry (not authenticated) -->
    <div v-if="gardenMode === 'code'" class="code-entry">
      <h1 class="page-title">Мой Сад</h1>
      <div class="code-box">
        <p class="code-desc">Введите 6-значный код, полученный от бота «Леший» в MAX</p>
        <div class="code-form">
          <input
            v-model="codeInput"
            type="text"
            inputmode="numeric"
            maxlength="6"
            placeholder="000000"
            class="code-input"
            @keyup.enter="submitCode"
          >
          <button class="code-btn" :disabled="codeInput.length !== 6 || codeLoading" @click="submitCode">
            {{ codeLoading ? 'Проверка...' : 'Войти' }}
          </button>
        </div>
        <p v-if="codeError" class="code-error">{{ codeError }}</p>
        <p class="code-hint">Напишите боту «мой сад» чтобы получить код</p>
      </div>
    </div>

    <!-- Loading auth -->
    <div v-else-if="gardenMode === 'loading'" class="loading-state">Загрузка...</div>

    <!-- Authenticated garden -->
    <template v-else>

    <!-- Header -->
    <div class="garden-header">
      <h1 class="page-title">{{ isOwner ? gardenName : 'Мой Сад' }}</h1>
      <div class="header-actions">
        <NuxtLink to="/my-garden/zones" class="btn-zones">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
          Зоны
        </NuxtLink>
        <button v-if="!isOwner" class="btn-add" @click="showAddModal = true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Добавить
      </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="garden.loading" class="loading-state">Загрузка...</div>

    <!-- Empty state -->
    <div v-else-if="garden.loaded && garden.count === 0" class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="56" height="56" style="color: var(--border);">
        <path d="M12 2L7 8h3l-4 6h3l-5 8h16l-5-8h3l-4-6h3z"/>
      </svg>
      <p class="empty-title">В вашем саду пока пусто</p>
      <p class="empty-hint">Добавьте растения из каталога или вручную</p>
      <div class="empty-actions">
        <button class="btn-primary" @click="showAddModal = true">Добавить растение</button>
        <NuxtLink to="/catalog" class="btn-secondary">Перейти в каталог</NuxtLink>
      </div>
    </div>

    <!-- Garden content -->
    <template v-else-if="garden.loaded">
      <!-- Stats -->
      <div class="stats-bar">
        <div class="stat">
          <span class="stat-num">{{ garden.count }}</span>
          <span class="stat-label">растений</span>
        </div>
        <div v-if="garden.growingCount > 0" class="stat">
          <span class="stat-num" style="color: #2e7d32;">{{ garden.growingCount }}</span>
          <span class="stat-label">растут</span>
        </div>
        <div v-if="garden.sleepingCount > 0" class="stat">
          <span class="stat-num" style="color: #5c6bc0;">{{ garden.sleepingCount }}</span>
          <span class="stat-label">спят</span>
        </div>
        <div v-if="garden.sickCount > 0" class="stat">
          <span class="stat-num" style="color: #e65100;">{{ garden.sickCount }}</span>
          <span class="stat-label">болеют</span>
        </div>
      </div>

      <!-- Tasks section -->
      <div v-if="hasTasks" class="tasks-section">
        <h2 class="tasks-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          Задачи
        </h2>
        <!-- Overdue -->
        <div v-for="t in overdueTasks" :key="t.id" class="task-item task-overdue">
          <button class="task-check" @click="markDone(t.id)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>
          </button>
          <div class="task-body">
            <span class="task-name">{{ t.name }}</span>
            <span class="task-plant">{{ taskPlantName(t) }}</span>
          </div>
          <span class="task-badge task-badge-overdue">Просрочено</span>
        </div>
        <!-- Today -->
        <div v-for="t in todayTasks" :key="t.id" class="task-item task-today">
          <button class="task-check task-check-today" @click="markDone(t.id)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>
          </button>
          <div class="task-body">
            <span class="task-name">{{ t.name }}</span>
            <span class="task-plant">{{ taskPlantName(t) }}</span>
          </div>
          <span class="task-badge task-badge-today">Сегодня</span>
        </div>
        <!-- Upcoming -->
        <div v-for="t in upcomingTasks" :key="t.id" class="task-item">
          <div class="task-check task-check-upcoming" />
          <div class="task-body">
            <span class="task-name">{{ t.name }}</span>
            <span class="task-plant">{{ taskPlantName(t) }}</span>
          </div>
          <span class="task-badge">{{ t.nextDue }}</span>
        </div>
      </div>

      <!-- Filter tabs -->
      <div class="filter-tabs">
        <button
          v-for="f in filters"
          :key="f.key"
          class="filter-tab"
          :class="{ active: activeFilter === f.key }"
          @click="activeFilter = f.key"
        >
          {{ f.label }}
          <span v-if="filterCount(f.key) > 0" class="filter-count">{{ filterCount(f.key) }}</span>
        </button>
      </div>

      <!-- Plant grid -->
      <div v-if="filteredPlants.length > 0" class="garden-grid">
        <NuxtLink
          v-for="plant in filteredPlants"
          :key="plant.id"
          :to="`/my-garden/plant/${plant.id}`"
          class="garden-card"
        >
          <div class="gc-img">
            <img v-if="plantThumb(plant)" :src="plantThumb(plant)!" alt="" loading="lazy">
            <div v-else class="gc-img-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="28" height="28"><path d="M12 2L7 8h3l-4 6h3l-5 8h16l-5-8h3l-4-6h3z"/></svg>
            </div>
            <span class="gc-status" :style="{ background: STATUS_COLORS[plant.status] }">
              {{ STATUS_LABELS[plant.status] }}
            </span>
          </div>
          <div class="gc-body">
            <div v-if="plant.nickname" class="gc-nickname">{{ plant.nickname }}</div>
            <div class="gc-name">{{ plantDisplayName(plant) }}</div>
            <div v-if="plantSpecies(plant)" class="gc-species">{{ plantSpecies(plant) }}</div>
            <div v-if="plant.zone" class="gc-zone">{{ plant.zone }}</div>
          </div>
        </NuxtLink>
      </div>

      <div v-else class="no-results">
        Нет растений с таким статусом
      </div>
    </template>

    <!-- FAB for mobile -->
    <button v-if="!isOwner && garden.loaded && garden.count > 0" class="fab" @click="showAddModal = true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="24" height="24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </button>

    <!-- Add plant modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
          <div class="modal">
            <div class="modal-header">
              <h2>Добавить растение</h2>
              <button class="modal-close" @click="showAddModal = false">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <!-- Mode tabs -->
            <div class="mode-tabs">
              <button :class="{ active: addMode === 'catalog' }" @click="addMode = 'catalog'">Из каталога</button>
              <button :class="{ active: addMode === 'manual' }" @click="addMode = 'manual'">Вручную</button>
            </div>

            <!-- Catalog search -->
            <div v-if="addMode === 'catalog'" class="modal-body">
              <input
                v-model="searchQuery"
                type="text"
                class="search-field"
                placeholder="Найти растение в каталоге..."
                autocomplete="off"
              >
              <div v-if="catalogResults.length > 0" class="catalog-results">
                <button
                  v-for="p in catalogResults"
                  :key="p.id"
                  class="catalog-result"
                  :class="{ added: garden.hasCatalogPlant(p.id) }"
                  :disabled="garden.hasCatalogPlant(p.id)"
                  @click="addFromCatalog(p.id)"
                >
                  <img v-if="p.thumbs[0]" :src="thumbWebpUrl(p.thumbs[0])" class="cr-img" alt="">
                  <div v-else class="cr-img cr-img-empty" />
                  <div class="cr-info">
                    <span class="cr-name">{{ p.latin_full }}</span>
                    <span class="cr-species">{{ p.species_ru }}</span>
                  </div>
                  <span v-if="garden.hasCatalogPlant(p.id)" class="cr-added-badge">Добавлено</span>
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" class="cr-add-icon"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>
              </div>
              <div v-else-if="searchQuery.trim().length >= 2" class="search-empty">
                Ничего не найдено
              </div>
              <div v-else class="search-hint">
                Введите название растения
              </div>
            </div>

            <!-- Manual form -->
            <div v-if="addMode === 'manual'" class="modal-body">
              <div class="form-group">
                <label>Название *</label>
                <input v-model="manualForm.manualName" type="text" placeholder="Picea pungens 'Glauca'">
              </div>
              <div class="form-group">
                <label>Вид (русское название)</label>
                <input v-model="manualForm.manualSpecies" type="text" placeholder="Ель колючая">
              </div>
              <div class="form-group">
                <label>Прозвище</label>
                <input v-model="manualForm.nickname" type="text" placeholder="Голубая у крыльца">
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Зона</label>
                  <input v-model="manualForm.zone" type="text" placeholder="Южная клумба" :list="garden.zones.length > 0 ? 'zone-list' : undefined">
                  <datalist v-if="garden.zones.length > 0" id="zone-list">
                    <option v-for="z in garden.zones" :key="z" :value="z" />
                  </datalist>
                </div>
                <div class="form-group">
                  <label>Дата посадки</label>
                  <input v-model="manualForm.plantedAt" type="date">
                </div>
              </div>
              <div class="form-group">
                <label>Заметки</label>
                <textarea v-model="manualForm.notes" rows="2" placeholder="Любые заметки..." />
              </div>
              <button class="btn-primary btn-full" :disabled="!manualForm.manualName.trim()" @click="addManual">
                Добавить в сад
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    </template><!-- v-else (authenticated) -->
  </div>
</template>

<style scoped>
.garden-page { padding: 24px 16px 100px; }

/* Code entry */
.code-entry { text-align: center; padding: 60px 20px; }
.code-box { max-width: 400px; margin: 40px auto 0; padding: 32px; background: var(--bg-alt); border-radius: 16px; }
.code-desc { font-size: 15px; color: var(--text-secondary); margin-bottom: 20px; }
.code-form { display: flex; gap: 8px; }
.code-input {
  flex: 1; padding: 12px 16px; font-size: 24px; font-weight: 700; text-align: center;
  letter-spacing: 8px; border: 2px solid var(--border); border-radius: 12px;
  background: var(--bg); color: var(--text); outline: none;
}
.code-input:focus { border-color: var(--primary); }
.code-btn {
  padding: 12px 24px; font-size: 15px; font-weight: 600; color: #fff;
  background: var(--primary); border: none; border-radius: 12px; cursor: pointer;
}
.code-btn:disabled { opacity: 0.5; cursor: default; }
.code-error { color: #e53935; font-size: 13px; margin-top: 12px; }
.code-hint { font-size: 12px; color: var(--text-muted); margin-top: 16px; }

.garden-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.page-title { font-size: 26px; font-weight: 700; }
.header-actions { display: flex; gap: 8px; align-items: center; }

.btn-zones {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 10px 16px; background: var(--bg-alt);
  border: 1.5px solid var(--border); border-radius: 10px;
  font-size: 13px; font-weight: 600; color: var(--text); transition: border-color 0.15s;
}
.btn-zones:hover { border-color: var(--primary); color: var(--primary); }

.btn-add {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 10px 20px;
  background: var(--primary); color: #fff;
  border: none; border-radius: 10px;
  font-size: 14px; font-weight: 600; cursor: pointer;
  transition: opacity 0.15s;
}
.btn-add:hover { opacity: 0.85; }

/* Stats */
.stats-bar {
  display: flex; gap: 20px; padding: 16px 20px;
  background: var(--bg-alt); border-radius: 12px;
  margin-bottom: 16px;
}
.stat { display: flex; flex-direction: column; align-items: center; }
.stat-num { font-size: 22px; font-weight: 700; color: var(--text); line-height: 1.2; }
.stat-label { font-size: 11px; color: var(--text-muted); }

/* Filter tabs */
.filter-tabs { display: flex; gap: 6px; margin-bottom: 20px; overflow-x: auto; -webkit-overflow-scrolling: touch; }
.filter-tab {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 8px 14px; white-space: nowrap;
  background: var(--bg-alt); border: 1.5px solid var(--border);
  border-radius: 20px; font-size: 13px; font-weight: 500;
  color: var(--text-secondary); cursor: pointer;
  transition: all 0.15s;
}
.filter-tab.active { background: var(--primary); color: #fff; border-color: var(--primary); }
.filter-count { font-size: 11px; font-weight: 700; opacity: 0.7; }

/* Garden grid */
.garden-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}
@media (min-width: 768px) { .garden-grid { grid-template-columns: repeat(3, 1fr); gap: 16px; } }
@media (min-width: 1024px) { .garden-grid { grid-template-columns: repeat(4, 1fr); } }

.garden-card {
  background: var(--bg); border: 1px solid var(--border);
  border-radius: var(--radius); overflow: hidden;
  transition: box-shadow 0.2s;
  -webkit-tap-highlight-color: transparent;
}
@media (min-width: 1024px) { .garden-card:hover { box-shadow: var(--shadow-card-hover); } }

.gc-img { position: relative; aspect-ratio: 0.85; overflow: hidden; background: var(--bg-alt); }
.gc-img img { width: 100%; height: 100%; object-fit: cover; }
.gc-img-empty { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--border); }

.gc-status {
  position: absolute; top: 6px; left: 6px;
  padding: 2px 8px; border-radius: 6px;
  font-size: 10px; font-weight: 700; color: #fff;
  text-transform: uppercase; letter-spacing: 0.3px;
}

.gc-body { padding: 10px 12px 12px; }
.gc-nickname { font-size: 11px; font-weight: 600; color: var(--primary); margin-bottom: 2px; }
.gc-name { font-size: 13px; font-weight: 600; color: var(--text); line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.gc-species { font-size: 11px; color: var(--text-secondary); font-style: italic; margin-top: 2px; }
.gc-zone { font-size: 10px; color: var(--text-muted); margin-top: 4px; }

/* FAB */
.fab {
  position: fixed; bottom: calc(70px + env(safe-area-inset-bottom, 0px)); right: 16px;
  width: 56px; height: 56px; border-radius: 50%;
  background: var(--primary); color: #fff;
  border: none; box-shadow: 0 4px 16px rgba(26, 86, 50, 0.35);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; z-index: 50;
  transition: transform 0.15s, box-shadow 0.15s;
}
.fab:hover { transform: scale(1.05); box-shadow: 0 6px 20px rgba(26, 86, 50, 0.45); }
@media (min-width: 1024px) { .fab { bottom: 24px; right: 24px; } }

/* Empty state */
.empty-state { text-align: center; padding: 60px 0; }
.empty-title { font-size: 18px; font-weight: 600; color: var(--text); margin-top: 16px; }
.empty-hint { font-size: 13px; color: var(--text-muted); margin-top: 4px; }
.empty-actions { display: flex; gap: 12px; justify-content: center; margin-top: 24px; }

.loading-state { text-align: center; padding: 40px; color: var(--text-muted); }
.no-results { text-align: center; padding: 40px; color: var(--text-muted); font-size: 14px; }

/* Tasks */
.tasks-section {
  background: var(--bg); border: 1.5px solid var(--border);
  border-radius: 14px; padding: 16px; margin-bottom: 16px;
}
.tasks-title { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 700; color: var(--text); margin-bottom: 12px; }
.tasks-title svg { color: var(--primary); }

.task-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 0; border-bottom: 1px solid var(--border-light);
}
.task-item:last-child { border-bottom: none; }

.task-check {
  width: 28px; height: 28px; border-radius: 50%;
  border: 2px solid var(--border); background: none;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-muted); cursor: pointer; flex-shrink: 0;
  transition: all 0.15s;
}
.task-check:hover { border-color: var(--primary); color: var(--primary); }
.task-check-today { border-color: var(--primary); color: var(--primary); animation: pulse-task 2s infinite; }
.task-check-upcoming { width: 28px; height: 28px; border-radius: 50%; border: 2px solid var(--border-light); flex-shrink: 0; }

.task-overdue .task-check { border-color: #e53935; color: #e53935; }

@keyframes pulse-task { 0%, 100% { box-shadow: 0 0 0 0 rgba(46,125,50,0.3); } 50% { box-shadow: 0 0 0 5px rgba(46,125,50,0); } }

.task-body { flex: 1; min-width: 0; }
.task-name { display: block; font-size: 13px; font-weight: 600; color: var(--text); }
.task-plant { display: block; font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.task-badge { font-size: 10px; font-weight: 600; color: var(--text-muted); flex-shrink: 0; }
.task-badge-overdue { color: #e53935; font-weight: 700; }
.task-badge-today { color: var(--primary); font-weight: 700; }

/* Buttons */
.btn-primary {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 12px 28px; background: var(--primary); color: #fff;
  border: none; border-radius: 10px;
  font-size: 14px; font-weight: 600; cursor: pointer;
  transition: opacity 0.15s;
}
.btn-primary:hover { opacity: 0.85; }
.btn-primary:disabled { opacity: 0.5; cursor: default; }
.btn-full { width: 100%; }

.btn-secondary {
  display: inline-flex; align-items: center;
  padding: 12px 28px; background: var(--bg-alt);
  border: 1.5px solid var(--border); border-radius: 10px;
  font-size: 14px; font-weight: 600; color: var(--text);
  transition: border-color 0.15s;
}
.btn-secondary:hover { border-color: var(--primary); color: var(--primary); }

/* Modal */
.modal-overlay {
  position: fixed; inset: 0; z-index: 500;
  background: rgba(0, 0, 0, 0.5);
  display: flex; align-items: flex-end; justify-content: center;
  padding: 0;
}
@media (min-width: 768px) {
  .modal-overlay { align-items: center; padding: 24px; }
}

.modal {
  background: var(--bg); width: 100%; max-width: 520px;
  border-radius: 20px 20px 0 0;
  max-height: 90dvh; overflow-y: auto;
}
@media (min-width: 768px) {
  .modal { border-radius: 20px; }
}

.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 20px 12px;
}
.modal-header h2 { font-size: 18px; font-weight: 700; }
.modal-close { background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 4px; }

.mode-tabs { display: flex; gap: 0; padding: 0 20px 12px; }
.mode-tabs button {
  flex: 1; padding: 10px; text-align: center;
  background: var(--bg-alt); border: 1.5px solid var(--border);
  font-size: 13px; font-weight: 600; color: var(--text-secondary);
  cursor: pointer; transition: all 0.15s;
}
.mode-tabs button:first-child { border-radius: 10px 0 0 10px; }
.mode-tabs button:last-child { border-radius: 0 10px 10px 0; border-left: none; }
.mode-tabs button.active { background: var(--primary); color: #fff; border-color: var(--primary); }

.modal-body { padding: 0 20px 20px; }

/* Search */
.search-field {
  width: 100%; padding: 12px 16px;
  background: var(--bg-alt); border: 1.5px solid var(--border);
  border-radius: 10px; font-size: 14px; color: var(--text); outline: none;
  transition: border-color 0.15s;
}
.search-field:focus { border-color: var(--primary); }

.catalog-results { margin-top: 12px; display: flex; flex-direction: column; gap: 2px; }
.catalog-result {
  display: flex; align-items: center; gap: 10px;
  padding: 10px; border-radius: 10px;
  background: none; border: none; text-align: left;
  cursor: pointer; transition: background 0.1s;
}
.catalog-result:hover { background: var(--bg-alt); }
.catalog-result.added { opacity: 0.5; cursor: default; }

.cr-img { width: 44px; height: 44px; border-radius: 8px; object-fit: cover; flex-shrink: 0; }
.cr-img-empty { background: var(--bg-alt); }
.cr-info { flex: 1; min-width: 0; }
.cr-name { display: block; font-size: 13px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cr-species { display: block; font-size: 11px; color: var(--text-secondary); font-style: italic; }
.cr-add-icon { color: var(--primary); flex-shrink: 0; }
.cr-added-badge { font-size: 10px; font-weight: 600; color: var(--text-muted); flex-shrink: 0; }

.search-empty, .search-hint { padding: 24px 0; text-align: center; color: var(--text-muted); font-size: 13px; }

/* Form */
.form-group { margin-bottom: 14px; }
.form-group label { display: block; font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 4px; }
.form-group input, .form-group textarea {
  width: 100%; padding: 10px 14px;
  background: var(--bg-alt); border: 1.5px solid var(--border);
  border-radius: 8px; font-size: 14px; color: var(--text); outline: none;
  font-family: inherit; resize: vertical;
  transition: border-color 0.15s;
}
.form-group input:focus, .form-group textarea:focus { border-color: var(--primary); }

.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

/* Modal transitions */
.modal-enter-active { transition: opacity 0.2s ease; }
.modal-enter-active .modal { transition: transform 0.25s ease; }
.modal-leave-active { transition: opacity 0.15s ease; }
.modal-leave-active .modal { transition: transform 0.15s ease; }
.modal-enter-from { opacity: 0; }
.modal-enter-from .modal { transform: translateY(20px); }
.modal-leave-to { opacity: 0; }
.modal-leave-to .modal { transform: translateY(20px); }
</style>
