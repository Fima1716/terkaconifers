<script setup lang="ts">
import { useGardenStore, STATUS_LABELS, STATUS_COLORS } from '~/stores/garden'
import type { PlantStatus, GardenPlant } from '~/stores/garden'
import { useCatalogStore } from '~/stores/catalog'
import { useAuthStore } from '~/stores/auth'
import { thumbHiresUrl } from '~/utils/photoUrl'

definePageMeta({ middleware: 'admin' })

const route = useRoute()
const router = useRouter()
const garden = useGardenStore()
const catalog = useCatalogStore()
const auth = useAuthStore()

const plantId = computed(() => route.params.id as string)

onMounted(async () => {
  await auth.fetchMe()
  if (!catalog.isLoaded) catalog.loadCatalog()
  await garden.load()
  garden.loadEvents(plantId.value)
})

const plant = computed(() => garden.getPlant(plantId.value))
const catalogPlant = computed(() => {
  if (!plant.value?.catalogId || !catalog.isLoaded) return null
  return catalog.getPlantById(plant.value.catalogId)
})
const displayName = computed(() => {
  if (!plant.value) return ''
  if (plant.value.catalogId && catalogPlant.value) return catalogPlant.value.latin_full
  return plant.value.manualName || 'Без названия'
})
const events = computed(() => garden.getPlantEvents(plantId.value))

useHead({ title: computed(() => `${plant.value?.nickname || displayName.value} — Мой Сад`) })

// Edit form
const editing = ref(false)
const form = ref<Partial<GardenPlant>>({})

function startEdit() {
  if (!plant.value) return
  form.value = {
    nickname: plant.value.nickname,
    status: plant.value.status,
    zone: plant.value.zone,
    plantedAt: plant.value.plantedAt,
    source: plant.value.source,
    pricePaid: plant.value.pricePaid,
    notes: plant.value.notes,
  }
  editing.value = true
}

async function saveEdit() {
  if (!plant.value) return
  await garden.updatePlant(plant.value.id, form.value)
  editing.value = false
}

const confirmDelete = ref(false)
async function doDelete() {
  if (!plant.value) return
  await garden.removePlant(plant.value.id)
  router.replace('/my-garden')
}

const statuses: PlantStatus[] = ['growing', 'sleeping', 'sick', 'dead']
</script>

<template>
  <div class="plant-detail container">
    <BreadCrumbs :items="[
      { label: 'Главная', to: '/' },
      { label: 'Мой Сад', to: '/my-garden' },
      { label: plant?.nickname || displayName || '...' }
    ]" />

    <div v-if="!garden.loaded" class="loading">Загрузка...</div>
    <div v-else-if="!plant" class="not-found">
      <p>Растение не найдено</p>
      <NuxtLink to="/my-garden" class="btn-back">Вернуться в Мой Сад</NuxtLink>
    </div>

    <template v-else>
      <div class="detail-layout">
        <!-- Photo -->
        <div class="photo-section">
          <div v-if="catalogPlant?.thumbs[0]" class="photo-wrap">
            <img :src="thumbHiresUrl(catalogPlant.thumbs[0])" :alt="displayName" class="photo">
          </div>
          <div v-else class="photo-wrap photo-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><path d="M12 2L7 8h3l-4 6h3l-5 8h16l-5-8h3l-4-6h3z"/></svg>
          </div>
          <span class="status-badge" :style="{ background: STATUS_COLORS[plant.status] }">
            {{ STATUS_LABELS[plant.status] }}
          </span>
        </div>

        <!-- Info & CRM -->
        <div class="info-section">
          <!-- Header -->
          <div class="info-header">
            <div>
              <h1 class="plant-name">{{ displayName }}</h1>
              <div v-if="plant.nickname" class="plant-nickname">{{ plant.nickname }}</div>
              <div v-if="catalogPlant?.species_ru" class="plant-species">{{ catalogPlant.species_ru }}</div>
              <div v-else-if="plant.manualSpecies" class="plant-species">{{ plant.manualSpecies }}</div>
            </div>
            <button v-if="!editing" class="btn-edit" @click="startEdit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
          </div>

          <!-- View mode -->
          <div v-if="!editing" class="info-grid">
            <div v-if="plant.zone" class="info-item">
              <span class="info-label">Зона</span>
              <span class="info-value">{{ plant.zone }}</span>
            </div>
            <div v-if="plant.plantedAt" class="info-item">
              <span class="info-label">Посажено</span>
              <span class="info-value">{{ new Date(plant.plantedAt).toLocaleDateString('ru-RU') }}</span>
            </div>
            <div v-if="plant.source" class="info-item">
              <span class="info-label">Откуда</span>
              <span class="info-value">{{ plant.source }}</span>
            </div>
            <div v-if="plant.pricePaid" class="info-item">
              <span class="info-label">Цена</span>
              <span class="info-value">{{ plant.pricePaid.toLocaleString('ru-RU') }} р.</span>
            </div>
            <div v-if="plant.notes" class="info-item info-full">
              <span class="info-label">Заметки</span>
              <span class="info-value">{{ plant.notes }}</span>
            </div>
          </div>

          <!-- Edit mode -->
          <div v-else class="edit-form">
            <div class="ef-group">
              <label>Прозвище</label>
              <input v-model="form.nickname" type="text" placeholder="Голубая у крыльца">
            </div>
            <div class="ef-group">
              <label>Статус</label>
              <div class="status-select">
                <button v-for="s in statuses" :key="s" class="status-opt" :class="{ active: form.status === s }" :style="form.status === s ? { background: STATUS_COLORS[s], color: '#fff', borderColor: STATUS_COLORS[s] } : {}" @click="form.status = s">{{ STATUS_LABELS[s] }}</button>
              </div>
            </div>
            <div class="ef-row">
              <div class="ef-group"><label>Зона</label><input v-model="form.zone" type="text" placeholder="Южная клумба" :list="garden.zoneNames.length ? 'zl' : undefined"><datalist v-if="garden.zoneNames.length" id="zl"><option v-for="z in garden.zoneNames" :key="z" :value="z"/></datalist></div>
              <div class="ef-group"><label>Посажено</label><input v-model="form.plantedAt" type="date"></div>
            </div>
            <div class="ef-row">
              <div class="ef-group"><label>Откуда</label><input v-model="form.source" type="text" placeholder="Русинов Сад"></div>
              <div class="ef-group"><label>Цена (руб.)</label><input v-model.number="form.pricePaid" type="number" placeholder="5000"></div>
            </div>
            <div class="ef-group"><label>Заметки</label><textarea v-model="form.notes" rows="2" placeholder="Любые заметки..."/></div>
            <div class="ef-actions">
              <button class="btn-save" @click="saveEdit">Сохранить</button>
              <button class="btn-cancel" @click="editing = false">Отмена</button>
            </div>
          </div>

          <!-- Catalog link -->
          <NuxtLink v-if="catalogPlant" :to="`/plant/${catalogPlant.id}`" class="catalog-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            Открыть в каталоге
          </NuxtLink>

          <!-- ━━ CRM Section ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->
          <div class="crm-divider" />

          <!-- Quick event buttons -->
          <h2 class="section-title">Дневник</h2>
          <QuickEventForm :plant-id="plantId" />

          <!-- Growth chart -->
          <GrowthChart :events="events" />

          <!-- Timeline -->
          <div class="timeline-section">
            <EventTimeline :plant-id="plantId" />
          </div>

          <!-- Care schedules -->
          <div class="crm-divider" />
          <CareScheduleList :plant-id="plantId" />

          <!-- Danger zone -->
          <div class="danger-zone">
            <button v-if="!confirmDelete" class="btn-delete" @click="confirmDelete = true">Удалить из сада</button>
            <div v-else class="confirm-row">
              <span>Точно удалить?</span>
              <button class="btn-yes" @click="doDelete">Да</button>
              <button class="btn-no" @click="confirmDelete = false">Нет</button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.plant-detail { padding: 24px 16px 60px; }

.loading, .not-found { text-align: center; padding: 60px 0; color: var(--text-muted); }
.btn-back { display: inline-block; margin-top: 16px; padding: 10px 24px; background: var(--primary); color: #fff; border-radius: 10px; font-weight: 600; }

.detail-layout { display: flex; flex-direction: column; gap: 24px; }
@media (min-width: 768px) { .detail-layout { flex-direction: row; } }

/* Photo */
.photo-section { position: relative; flex-shrink: 0; }
@media (min-width: 768px) { .photo-section { width: 300px; position: sticky; top: calc(var(--header-h) + 16px); align-self: flex-start; } }
@media (min-width: 1024px) { .photo-section { width: 360px; } }

.photo-wrap { border-radius: 16px; overflow: hidden; background: var(--bg-alt); aspect-ratio: 0.85; }
.photo { width: 100%; height: 100%; object-fit: cover; }
.photo-empty { display: flex; align-items: center; justify-content: center; color: var(--border); }

.status-badge {
  position: absolute; top: 12px; left: 12px;
  padding: 4px 12px; border-radius: 8px;
  font-size: 12px; font-weight: 700; color: #fff;
  text-transform: uppercase; letter-spacing: 0.3px;
}

/* Info */
.info-section { flex: 1; min-width: 0; }
.info-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 16px; }
.plant-name { font-size: 22px; font-weight: 700; line-height: 1.3; }
@media (min-width: 768px) { .plant-name { font-size: 24px; } }
.plant-nickname { font-size: 14px; font-weight: 600; color: var(--primary); margin-top: 2px; }
.plant-species { font-size: 14px; color: var(--text-secondary); font-style: italic; margin-top: 2px; }

.btn-edit {
  width: 36px; height: 36px; border-radius: 8px;
  background: var(--bg-alt); border: 1.5px solid var(--border);
  display: flex; align-items: center; justify-content: center;
  color: var(--text-muted); cursor: pointer; flex-shrink: 0;
  transition: all 0.15s;
}
.btn-edit:hover { border-color: var(--primary); color: var(--primary); }

/* Info grid */
.info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.info-item { }
.info-full { grid-column: 1 / -1; }
.info-label { display: block; font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 1px; }
.info-value { font-size: 14px; color: var(--text); }

/* Edit form */
.edit-form { }
.ef-group { margin-bottom: 12px; }
.ef-group label { display: block; font-size: 11px; font-weight: 600; color: var(--text-secondary); margin-bottom: 3px; }
.ef-group input, .ef-group textarea { width: 100%; padding: 9px 12px; background: var(--bg-alt); border: 1.5px solid var(--border); border-radius: 8px; font-size: 14px; color: var(--text); outline: none; font-family: inherit; resize: vertical; transition: border-color 0.15s; }
.ef-group input:focus, .ef-group textarea:focus { border-color: var(--primary); }
.ef-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

.status-select { display: flex; gap: 6px; flex-wrap: wrap; }
.status-opt { padding: 6px 14px; border-radius: 8px; border: 1.5px solid var(--border); background: var(--bg-alt); font-size: 13px; font-weight: 600; color: var(--text-secondary); cursor: pointer; transition: all 0.15s; }

.ef-actions { display: flex; gap: 8px; margin-top: 16px; }
.btn-save { padding: 10px 28px; background: var(--primary); color: #fff; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; transition: opacity 0.15s; }
.btn-save:hover { opacity: 0.85; }
.btn-cancel { padding: 10px 20px; background: none; border: 1.5px solid var(--border); border-radius: 10px; font-size: 14px; font-weight: 500; color: var(--text-secondary); cursor: pointer; }

.catalog-link {
  display: inline-flex; align-items: center; gap: 6px;
  margin-top: 16px; padding: 8px 16px;
  background: var(--bg-alt); border: 1px solid var(--border); border-radius: 8px;
  font-size: 12px; font-weight: 600; color: var(--primary); transition: border-color 0.15s;
}
.catalog-link:hover { border-color: var(--primary); }

/* CRM sections */
.crm-divider { height: 1px; background: var(--border-light); margin: 24px 0; }
.section-title { font-size: 16px; font-weight: 700; color: var(--text); margin-bottom: 12px; }
.timeline-section { margin-top: 16px; }

/* Danger zone */
.danger-zone { margin-top: 32px; padding-top: 20px; border-top: 1px solid var(--border-light); }
.btn-delete { background: none; border: none; color: var(--text-muted); font-size: 13px; cursor: pointer; }
.btn-delete:hover { color: #e53935; }
.confirm-row { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-secondary); }
.btn-yes { padding: 5px 12px; background: #e53935; color: #fff; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.btn-no { padding: 5px 12px; background: var(--bg-alt); border: 1px solid var(--border); border-radius: 6px; font-size: 12px; color: var(--text-secondary); cursor: pointer; }
</style>
