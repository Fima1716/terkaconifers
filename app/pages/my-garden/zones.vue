<script setup lang="ts">
import { useGardenStore, LIGHT_LABELS, MOISTURE_LABELS } from '~/stores/garden'
import type { GardenZone } from '~/stores/garden'
import { useAuthStore } from '~/stores/auth'
import { useCatalogStore } from '~/stores/catalog'
import { thumbWebpUrl } from '~/utils/photoUrl'

definePageMeta({ middleware: 'admin' })
useHead({ title: 'Зоны сада — Мой Сад' })

const garden = useGardenStore()
const catalog = useCatalogStore()
const auth = useAuthStore()

onMounted(async () => {
  await auth.fetchMe()
  if (!catalog.isLoaded) catalog.loadCatalog()
  garden.load()
})

// Add/edit form
const showForm = ref(false)
const editingId = ref<string | null>(null)
const form = ref({ name: '', description: '', light: '' as string, moisture: '' as string, soil: '' })
const saving = ref(false)

function openAdd() {
  editingId.value = null
  form.value = { name: '', description: '', light: '', moisture: '', soil: '' }
  showForm.value = true
}

function openEdit(z: GardenZone) {
  editingId.value = z.id
  form.value = { name: z.name, description: z.description, light: z.light || '', moisture: z.moisture || '', soil: z.soil || '' }
  showForm.value = true
}

async function saveZone() {
  if (!form.value.name.trim()) return
  saving.value = true
  try {
    const data: any = { name: form.value.name, description: form.value.description, soil: form.value.soil || undefined }
    if (form.value.light) data.light = form.value.light
    if (form.value.moisture) data.moisture = form.value.moisture
    if (editingId.value) {
      await garden.updateZone(editingId.value, data)
    } else {
      await garden.addZone(data)
    }
    showForm.value = false
  } finally { saving.value = false }
}

async function deleteZone(id: string) {
  if (!confirm('Удалить зону?')) return
  await garden.removeZone(id)
}

function zonePlants(zoneName: string) {
  return garden.plantsByZone(zoneName)
}

function plantThumb(plant: any) {
  if (plant.catalogId && catalog.isLoaded) {
    const cp = catalog.getPlantById(plant.catalogId)
    if (cp?.thumbs[0]) return thumbWebpUrl(cp.thumbs[0])
  }
  return null
}

const lights = [
  { value: 'sun', label: 'Солнце' },
  { value: 'partial', label: 'Полутень' },
  { value: 'shade', label: 'Тень' },
]
const moistures = [
  { value: 'dry', label: 'Сухо' },
  { value: 'moderate', label: 'Умеренно' },
  { value: 'wet', label: 'Влажно' },
]
</script>

<template>
  <div class="zones-page container">
    <BreadCrumbs :items="[{ label: 'Главная', to: '/' }, { label: 'Мой Сад', to: '/my-garden' }, { label: 'Зоны сада' }]" />

    <div class="zones-header">
      <h1 class="page-title">Зоны сада</h1>
      <button class="btn-add" @click="openAdd">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Добавить
      </button>
    </div>

    <div v-if="garden.loading" class="loading">Загрузка...</div>

    <div v-else-if="garden.zones.length === 0 && !showForm" class="empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48" style="color: var(--border); margin-bottom: 16px;">
        <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="21"/>
      </svg>
      <p>Зоны помогают организовать ваш участок</p>
      <p class="empty-hint">Создайте зоны вроде «Альпинарий», «Южная клумба», «У забора»</p>
      <button class="btn-primary" @click="openAdd">Создать первую зону</button>
    </div>

    <!-- Zone cards -->
    <div v-else class="zones-grid">
      <div v-for="z in garden.zones" :key="z.id" class="zone-card">
        <div class="zc-header">
          <h3 class="zc-name">{{ z.name }}</h3>
          <div class="zc-actions">
            <button @click="openEdit(z)" title="Редактировать">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button @click="deleteZone(z.id)" title="Удалить">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        <div v-if="z.description" class="zc-desc">{{ z.description }}</div>
        <div class="zc-tags">
          <span v-if="z.light" class="zc-tag">{{ LIGHT_LABELS[z.light] || z.light }}</span>
          <span v-if="z.moisture" class="zc-tag">{{ MOISTURE_LABELS[z.moisture] || z.moisture }}</span>
          <span v-if="z.soil" class="zc-tag">{{ z.soil }}</span>
        </div>
        <!-- Plants in this zone -->
        <div v-if="zonePlants(z.name).length > 0" class="zc-plants">
          <div class="zc-plants-label">{{ zonePlants(z.name).length }} растений</div>
          <div class="zc-plant-avatars">
            <NuxtLink
              v-for="p in zonePlants(z.name).slice(0, 6)"
              :key="p.id"
              :to="`/my-garden/plant/${p.id}`"
              class="zc-avatar"
              :title="p.nickname || p.manualName"
            >
              <img v-if="plantThumb(p)" :src="plantThumb(p)!" alt="">
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><path d="M12 2L7 8h3l-4 6h3l-5 8h16l-5-8h3l-4-6h3z"/></svg>
            </NuxtLink>
            <span v-if="zonePlants(z.name).length > 6" class="zc-more">+{{ zonePlants(z.name).length - 6 }}</span>
          </div>
        </div>
        <div v-else class="zc-no-plants">Нет привязанных растений</div>
      </div>
    </div>

    <!-- Add/edit form modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showForm" class="modal-overlay" @click.self="showForm = false">
          <div class="modal">
            <div class="modal-header">
              <h2>{{ editingId ? 'Редактировать зону' : 'Новая зона' }}</h2>
              <button class="modal-close" @click="showForm = false">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div class="modal-body">
              <div class="fg"><label>Название *</label><input v-model="form.name" type="text" placeholder="Альпинарий"></div>
              <div class="fg"><label>Описание</label><input v-model="form.description" type="text" placeholder="Полутень, кислая почва"></div>
              <div class="fg">
                <label>Освещение</label>
                <div class="chip-row">
                  <button v-for="l in lights" :key="l.value" class="chip" :class="{ active: form.light === l.value }" @click="form.light = form.light === l.value ? '' : l.value">{{ l.label }}</button>
                </div>
              </div>
              <div class="fg">
                <label>Влажность</label>
                <div class="chip-row">
                  <button v-for="m in moistures" :key="m.value" class="chip" :class="{ active: form.moisture === m.value }" @click="form.moisture = form.moisture === m.value ? '' : m.value">{{ m.label }}</button>
                </div>
              </div>
              <div class="fg"><label>Почва</label><input v-model="form.soil" type="text" placeholder="Кислая, суглинок..."></div>
              <button class="btn-primary btn-full" :disabled="!form.name.trim() || saving" @click="saveZone">
                {{ editingId ? 'Сохранить' : 'Создать зону' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.zones-page { padding: 24px 16px 60px; }
.zones-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.page-title { font-size: 26px; font-weight: 700; }

.btn-add {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 10px 20px; background: var(--primary); color: #fff;
  border: none; border-radius: 10px; font-size: 14px; font-weight: 600;
  cursor: pointer; transition: opacity 0.15s;
}
.btn-add:hover { opacity: 0.85; }

.loading { text-align: center; padding: 40px; color: var(--text-muted); }
.empty { text-align: center; padding: 60px 0; color: var(--text-muted); }
.empty p { font-size: 16px; color: var(--text); }
.empty-hint { font-size: 13px; color: var(--text-muted); margin-top: 4px; margin-bottom: 20px; }

.btn-primary {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 12px 28px; background: var(--primary); color: #fff;
  border: none; border-radius: 10px; font-size: 14px; font-weight: 600;
  cursor: pointer; transition: opacity 0.15s;
}
.btn-primary:hover { opacity: 0.85; }
.btn-primary:disabled { opacity: 0.5; }
.btn-full { width: 100%; margin-top: 12px; }

/* Zone grid */
.zones-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
@media (min-width: 768px) { .zones-grid { grid-template-columns: repeat(2, 1fr); } }
@media (min-width: 1024px) { .zones-grid { grid-template-columns: repeat(3, 1fr); } }

.zone-card {
  background: var(--bg); border: 1.5px solid var(--border);
  border-radius: 14px; padding: 16px;
  transition: box-shadow 0.2s;
}
.zone-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.06); }

.zc-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.zc-name { font-size: 16px; font-weight: 700; color: var(--text); }
.zc-actions { display: flex; gap: 4px; }
.zc-actions button { width: 28px; height: 28px; border-radius: 6px; background: none; border: none; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
.zc-actions button:hover { background: var(--bg-alt); color: var(--text); }

.zc-desc { font-size: 13px; color: var(--text-secondary); margin-bottom: 8px; }
.zc-tags { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 10px; }
.zc-tag { font-size: 10px; font-weight: 600; padding: 3px 8px; border-radius: 6px; background: #e8f5e9; color: #2e7d32; }

.zc-plants-label { font-size: 11px; font-weight: 600; color: var(--text-muted); margin-bottom: 6px; }
.zc-plant-avatars { display: flex; gap: 4px; align-items: center; }
.zc-avatar {
  width: 32px; height: 32px; border-radius: 8px; overflow: hidden;
  background: var(--bg-alt); display: flex; align-items: center; justify-content: center;
  color: var(--border); flex-shrink: 0;
}
.zc-avatar img { width: 100%; height: 100%; object-fit: cover; }
.zc-more { font-size: 11px; color: var(--text-muted); font-weight: 600; }
.zc-no-plants { font-size: 12px; color: var(--text-muted); font-style: italic; }

/* Modal */
.modal-overlay {
  position: fixed; inset: 0; z-index: 500;
  background: rgba(0,0,0,0.5);
  display: flex; align-items: flex-end; justify-content: center;
}
@media (min-width: 768px) { .modal-overlay { align-items: center; padding: 24px; } }
.modal { background: var(--bg); width: 100%; max-width: 480px; border-radius: 20px 20px 0 0; max-height: 90dvh; overflow-y: auto; }
@media (min-width: 768px) { .modal { border-radius: 20px; } }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 20px 12px; }
.modal-header h2 { font-size: 18px; font-weight: 700; }
.modal-close { background: none; border: none; color: var(--text-muted); cursor: pointer; }
.modal-body { padding: 0 20px 20px; }

.fg { margin-bottom: 14px; }
.fg label { display: block; font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 4px; }
.fg input { width: 100%; padding: 10px 14px; background: var(--bg-alt); border: 1.5px solid var(--border); border-radius: 8px; font-size: 14px; color: var(--text); outline: none; transition: border-color 0.15s; }
.fg input:focus { border-color: var(--primary); }

.chip-row { display: flex; gap: 6px; }
.chip { padding: 6px 14px; border-radius: 20px; border: 1.5px solid var(--border); background: var(--bg-alt); font-size: 13px; font-weight: 600; color: var(--text-secondary); cursor: pointer; transition: all 0.15s; }
.chip.active { background: var(--primary); color: #fff; border-color: var(--primary); }

.modal-enter-active { transition: opacity 0.2s; }
.modal-enter-active .modal { transition: transform 0.25s ease; }
.modal-leave-active { transition: opacity 0.15s; }
.modal-enter-from { opacity: 0; }
.modal-enter-from .modal { transform: translateY(20px); }
.modal-leave-to { opacity: 0; }
</style>
