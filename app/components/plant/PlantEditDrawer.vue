<script setup lang="ts">
import type { Plant } from '~/stores/catalog'

const props = defineProps<{ plant: Plant }>()
const emit = defineEmits<{ close: []; saved: [] }>()

const auth = useAuthStore()
const saving = ref(false)
const message = ref('')
const msgType = ref<'ok' | 'err'>('ok')

// Per-plant buy link (superadmin only)
const plantBuyLink = ref('')
const gardenBuyLink = ref('')
const originalPlantBuyLink = ref('')

onMounted(async () => {
  if (auth.isSuperAdmin) {
    try {
      const data = await $fetch<any>('/api/gardens')
      gardenBuyLink.value = data.gardens?.[props.plant.garden_display]?.buyLink || ''
      const link = data.plantBuyLinks?.[String(props.plant.id)] || ''
      plantBuyLink.value = link
      originalPlantBuyLink.value = link
    } catch {}
  }
})

// Form state — initialize from plant
const form = reactive({
  latin_full: props.plant.latin_full,
  name_ru: props.plant.species_ru || '',
  cultivar: props.plant.cultivar || '',
  species: props.plant.species || '',
  genus: props.plant.genus || '',
  genus_ru: props.plant.genus_ru || '',
  region: props.plant.region_normalized || '',
  age: props.plant.age_display || '',
  garden: props.plant.garden_display || '',
  is_russian: props.plant.is_russian_enriched || false,
  photos: [...props.plant.photos],
})

function showMsg(text: string, type: 'ok' | 'err' = 'ok') {
  message.value = text; msgType.value = type
  if (type === 'ok') setTimeout(() => message.value = '', 3000)
}

async function save() {
  saving.value = true
  try {
    await $fetch(`/api/admin/plant/${props.plant.id}`, {
      method: 'PUT',
      body: { ...form },
    })
    // Save per-plant buy link if changed (superadmin only)
    if (auth.isSuperAdmin && plantBuyLink.value !== originalPlantBuyLink.value) {
      await $fetch('/api/admin/plant-buylink', {
        method: 'PUT',
        body: { plantId: props.plant.id, buyLink: plantBuyLink.value },
      })
    }
    showMsg('Сохранено!')
    setTimeout(() => emit('saved'), 500)
  } catch (e: any) {
    showMsg(e?.data?.message || 'Ошибка сохранения', 'err')
  } finally {
    saving.value = false
  }
}

function removePhoto(idx: number) {
  form.photos.splice(idx, 1)
}

function movePhoto(idx: number, dir: -1 | 1) {
  const newIdx = idx + dir
  if (newIdx < 0 || newIdx >= form.photos.length) return
  const tmp = form.photos[idx]
  form.photos[idx] = form.photos[newIdx]
  form.photos[newIdx] = tmp
}

// Close on Escape
onMounted(() => {
  const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') emit('close') }
  window.addEventListener('keydown', handler)
  onUnmounted(() => window.removeEventListener('keydown', handler))
})

// Prevent body scroll
onMounted(() => {
  document.body.style.overflow = 'hidden'
  onUnmounted(() => { document.body.style.overflow = '' })
})
</script>

<template>
  <Teleport to="body">
    <div class="drawer-overlay" @click="emit('close')">
      <div class="drawer" @click.stop>
        <!-- Header -->
        <div class="drawer-header">
          <h3>Редактирование</h3>
          <button class="drawer-close" @click="emit('close')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <!-- Body -->
        <div class="drawer-body">
          <div v-if="message" class="msg" :class="msgType">{{ message }}</div>

          <div class="field">
            <label>Латинское название</label>
            <input v-model="form.latin_full" type="text">
          </div>

          <div class="field-row">
            <div class="field">
              <label>Род (лат.)</label>
              <input v-model="form.genus" type="text">
            </div>
            <div class="field">
              <label>Род (рус.)</label>
              <input v-model="form.genus_ru" type="text">
            </div>
          </div>

          <div class="field-row">
            <div class="field">
              <label>Вид</label>
              <input v-model="form.species" type="text">
            </div>
            <div class="field">
              <label>Сорт</label>
              <input v-model="form.cultivar" type="text">
            </div>
          </div>

          <div class="field">
            <label>Русское название</label>
            <input v-model="form.name_ru" type="text">
          </div>

          <div class="field">
            <label>Регион</label>
            <input v-model="form.region" type="text">
          </div>

          <div class="field-row">
            <div class="field">
              <label>Возраст</label>
              <input v-model="form.age" type="text" placeholder="напр. 10 лет">
            </div>
            <div class="field">
              <label>Сад</label>
              <input v-model="form.garden" type="text">
            </div>
          </div>

          <div class="field toggle-field">
            <label>
              <input v-model="form.is_russian" type="checkbox">
              Российский сорт
            </label>
          </div>

          <!-- Buy link (superadmin only) -->
          <div v-if="auth.isSuperAdmin" class="field">
            <label>Ссылка «Купить»</label>
            <input v-model="plantBuyLink" type="text" :placeholder="gardenBuyLink || 'https://...'">
            <span v-if="gardenBuyLink && !plantBuyLink" class="field-hint">
              От сада: {{ gardenBuyLink }}
            </span>
          </div>

          <!-- Photos -->
          <div class="field">
            <label>Фото ({{ form.photos.length }})</label>
            <div class="photos-list">
              <div v-for="(photo, i) in form.photos" :key="photo" class="photo-item">
                <img :src="photo.startsWith('http') ? photo : `/${photo.replace('.jpg', '_thumb.jpg')}`" :alt="`Фото ${i+1}`" class="photo-thumb">
                <div class="photo-actions">
                  <button v-if="i > 0" @click="movePhoto(i, -1)" class="photo-btn" title="Вверх">&#8593;</button>
                  <button v-if="i < form.photos.length - 1" @click="movePhoto(i, 1)" class="photo-btn" title="Вниз">&#8595;</button>
                  <button @click="removePhoto(i)" class="photo-btn photo-delete" title="Удалить">&#10005;</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="drawer-footer">
          <button class="btn-cancel" @click="emit('close')">Отмена</button>
          <button class="btn-save" @click="save" :disabled="saving">
            {{ saving ? 'Сохранение...' : 'Сохранить' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  justify-content: flex-end;
}

/* Mobile: bottom sheet */
@media (max-width: 767px) {
  .drawer-overlay {
    align-items: flex-end;
    justify-content: stretch;
  }
}

.drawer {
  background: var(--bg);
  width: 420px;
  max-width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.12);
  animation: drawer-slide-in 0.25s ease-out;
}

@keyframes drawer-slide-in {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}

/* Mobile: bottom sheet style */
@media (max-width: 767px) {
  .drawer {
    width: 100%;
    height: 92vh;
    border-radius: 16px 16px 0 0;
    animation: drawer-slide-up 0.25s ease-out;
  }
  @keyframes drawer-slide-up {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.drawer-header h3 {
  font-size: 17px;
  font-weight: 700;
}

.drawer-close {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: var(--bg-alt);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-secondary);
}

.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  -webkit-overflow-scrolling: touch;
}

.field {
  margin-bottom: 14px;
}

.field label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.field input[type="text"] {
  width: 100%;
  height: 42px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 14px;
  color: var(--text);
  background: var(--bg);
  box-sizing: border-box;
  outline: none;
  transition: border-color 0.15s;
}

.field input[type="text"]:focus {
  border-color: var(--primary);
}

.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.toggle-field label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  cursor: pointer;
}

.toggle-field input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: var(--primary);
}

.field-hint {
  display: block;
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
}

.msg { padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 12px; }
.msg.ok { background: #e8f5e9; color: #2e7d32; }
.msg.err { background: #fce4ec; color: #c62828; }

/* Photos */
.photos-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.photo-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px;
  background: var(--bg-alt);
  border-radius: 8px;
}

.photo-thumb {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 6px;
}

.photo-actions {
  display: flex;
  gap: 4px;
  margin-left: auto;
}

.photo-btn {
  width: 32px;
  height: 32px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
}

.photo-delete {
  color: #e57373;
  border-color: #e57373;
}

.drawer-footer {
  display: flex;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

.btn-cancel {
  flex: 1;
  height: 46px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  color: var(--text-secondary);
}

.btn-save {
  flex: 2;
  height: 46px;
  border: none;
  border-radius: 12px;
  background: var(--primary);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-save:hover { background: var(--primary-dark); }
.btn-save:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
