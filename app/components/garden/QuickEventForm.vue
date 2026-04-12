<script setup lang="ts">
import { useGardenStore, EVENT_LABELS, EVENT_COLORS } from '~/stores/garden'
import type { EventType, GardenEvent } from '~/stores/garden'

const props = defineProps<{ plantId: string }>()
const garden = useGardenStore()

const activeType = ref<EventType | null>(null)
const saving = ref(false)
const today = new Date().toISOString().slice(0, 10)

const form = ref({
  date: today,
  text: '',
  height: null as number | null,
  width: null as number | null,
  trunkDiameter: null as number | null,
  product: '',
  dosage: '',
  problemType: 'disease',
  severity: 'medium' as 'low' | 'medium' | 'high',
})

function resetForm() {
  form.value = { date: today, text: '', height: null, width: null, trunkDiameter: null, product: '', dosage: '', problemType: 'disease', severity: 'medium' }
}

const eventTypes: EventType[] = ['watering', 'measurement', 'fertilizing', 'pruning', 'treatment', 'problem', 'note']

function selectType(t: EventType) {
  if (activeType.value === t) { activeType.value = null; return }
  activeType.value = t
  resetForm()
}

// Quick one-tap events (watering, pruning)
const quickTypes: EventType[] = ['watering', 'pruning']

async function quickSave(type: EventType) {
  saving.value = true
  try {
    await garden.addEvent({ plantId: props.plantId, type, date: today, text: '' })
  } finally { saving.value = false }
}

async function submitEvent() {
  if (!activeType.value) return
  saving.value = true
  try {
    const data: Partial<GardenEvent> = {
      plantId: props.plantId,
      type: activeType.value,
      date: form.value.date,
      text: form.value.text || undefined,
    }
    if (activeType.value === 'measurement') {
      if (form.value.height) data.height = form.value.height
      if (form.value.width) data.width = form.value.width
      if (form.value.trunkDiameter) data.trunkDiameter = form.value.trunkDiameter
    }
    if (activeType.value === 'fertilizing' || activeType.value === 'treatment') {
      data.product = form.value.product || undefined
      data.dosage = form.value.dosage || undefined
    }
    if (activeType.value === 'problem') {
      data.problemType = form.value.problemType
      data.severity = form.value.severity
    }
    await garden.addEvent(data)
    activeType.value = null
    resetForm()
  } finally { saving.value = false }
}

const problemTypes = [
  { value: 'disease', label: 'Болезнь' },
  { value: 'pest', label: 'Вредитель' },
  { value: 'frost', label: 'Мороз' },
  { value: 'other', label: 'Другое' },
]
const severities = [
  { value: 'low', label: 'Слабо', color: '#ff9800' },
  { value: 'medium', label: 'Средне', color: '#e65100' },
  { value: 'high', label: 'Сильно', color: '#c62828' },
]
</script>

<template>
  <div class="quick-events">
    <div class="qe-buttons">
      <button
        v-for="t in eventTypes"
        :key="t"
        class="qe-btn"
        :class="{ active: activeType === t }"
        :style="activeType === t ? { background: EVENT_COLORS[t], color: '#fff', borderColor: EVENT_COLORS[t] } : {}"
        @click="selectType(t)"
      >
        {{ EVENT_LABELS[t] }}
      </button>
    </div>

    <!-- Quick tap actions (watering adds immediately) -->
    <Transition name="slide-form">
      <div v-if="activeType === 'watering'" class="qe-form qe-quick">
        <p>Записать полив за сегодня?</p>
        <div class="qe-form-row">
          <button class="btn-save" :disabled="saving" @click="quickSave('watering')">Да, полил</button>
          <button class="btn-cancel" @click="activeType = null">Отмена</button>
        </div>
      </div>
    </Transition>

    <!-- Measurement form -->
    <Transition name="slide-form">
      <div v-if="activeType === 'measurement'" class="qe-form">
        <div class="qe-form-row">
          <div class="qe-field">
            <label>Высота (см)</label>
            <input v-model.number="form.height" type="number" placeholder="120" step="0.1">
          </div>
          <div class="qe-field">
            <label>Ширина (см)</label>
            <input v-model.number="form.width" type="number" placeholder="80" step="0.1">
          </div>
          <div class="qe-field">
            <label>Ствол (мм)</label>
            <input v-model.number="form.trunkDiameter" type="number" placeholder="45">
          </div>
        </div>
        <div class="qe-form-row">
          <div class="qe-field">
            <label>Дата</label>
            <input v-model="form.date" type="date">
          </div>
          <div class="qe-field" style="flex:2">
            <label>Заметка</label>
            <input v-model="form.text" type="text" placeholder="Необязательно">
          </div>
        </div>
        <div class="qe-form-actions">
          <button class="btn-save" :disabled="saving || (!form.height && !form.width && !form.trunkDiameter)" @click="submitEvent">Сохранить замер</button>
          <button class="btn-cancel" @click="activeType = null">Отмена</button>
        </div>
      </div>
    </Transition>

    <!-- Fertilizing / Treatment form -->
    <Transition name="slide-form">
      <div v-if="activeType === 'fertilizing' || activeType === 'treatment'" class="qe-form">
        <div class="qe-form-row">
          <div class="qe-field" style="flex:2">
            <label>Препарат</label>
            <input v-model="form.product" type="text" :placeholder="activeType === 'fertilizing' ? 'Кемира Люкс' : 'Фитоспорин'">
          </div>
          <div class="qe-field">
            <label>Дозировка</label>
            <input v-model="form.dosage" type="text" placeholder="5 г/л">
          </div>
        </div>
        <div class="qe-form-row">
          <div class="qe-field">
            <label>Дата</label>
            <input v-model="form.date" type="date">
          </div>
          <div class="qe-field" style="flex:2">
            <label>Заметка</label>
            <input v-model="form.text" type="text" placeholder="Необязательно">
          </div>
        </div>
        <div class="qe-form-actions">
          <button class="btn-save" :disabled="saving" @click="submitEvent">Сохранить</button>
          <button class="btn-cancel" @click="activeType = null">Отмена</button>
        </div>
      </div>
    </Transition>

    <!-- Problem form -->
    <Transition name="slide-form">
      <div v-if="activeType === 'problem'" class="qe-form">
        <div class="qe-form-row">
          <div class="qe-field">
            <label>Тип проблемы</label>
            <div class="chip-row">
              <button v-for="pt in problemTypes" :key="pt.value" class="chip" :class="{ active: form.problemType === pt.value }" @click="form.problemType = pt.value">{{ pt.label }}</button>
            </div>
          </div>
        </div>
        <div class="qe-form-row">
          <div class="qe-field">
            <label>Серьёзность</label>
            <div class="chip-row">
              <button v-for="sv in severities" :key="sv.value" class="chip" :class="{ active: form.severity === sv.value }" :style="form.severity === sv.value ? { background: sv.color, color: '#fff', borderColor: sv.color } : {}" @click="form.severity = sv.value as any">{{ sv.label }}</button>
            </div>
          </div>
        </div>
        <div class="qe-form-row">
          <div class="qe-field">
            <label>Дата</label>
            <input v-model="form.date" type="date">
          </div>
          <div class="qe-field" style="flex:2">
            <label>Описание</label>
            <input v-model="form.text" type="text" placeholder="Что заметили...">
          </div>
        </div>
        <div class="qe-form-actions">
          <button class="btn-save" :disabled="saving" @click="submitEvent">Сохранить</button>
          <button class="btn-cancel" @click="activeType = null">Отмена</button>
        </div>
      </div>
    </Transition>

    <!-- Pruning quick -->
    <Transition name="slide-form">
      <div v-if="activeType === 'pruning'" class="qe-form">
        <div class="qe-form-row">
          <div class="qe-field">
            <label>Дата</label>
            <input v-model="form.date" type="date">
          </div>
          <div class="qe-field" style="flex:2">
            <label>Заметка</label>
            <input v-model="form.text" type="text" placeholder="Что обрезали...">
          </div>
        </div>
        <div class="qe-form-actions">
          <button class="btn-save" :disabled="saving" @click="submitEvent">Сохранить</button>
          <button class="btn-cancel" @click="activeType = null">Отмена</button>
        </div>
      </div>
    </Transition>

    <!-- Note form -->
    <Transition name="slide-form">
      <div v-if="activeType === 'note'" class="qe-form">
        <div class="qe-form-row">
          <div class="qe-field">
            <label>Дата</label>
            <input v-model="form.date" type="date">
          </div>
        </div>
        <div class="qe-field">
          <label>Текст заметки</label>
          <textarea v-model="form.text" rows="3" placeholder="Свободный текст..." />
        </div>
        <div class="qe-form-actions">
          <button class="btn-save" :disabled="saving || !form.text.trim()" @click="submitEvent">Сохранить</button>
          <button class="btn-cancel" @click="activeType = null">Отмена</button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.quick-events { margin-bottom: 20px; }

.qe-buttons { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.qe-btn {
  padding: 6px 14px; border-radius: 20px;
  border: 1.5px solid var(--border); background: var(--bg-alt);
  font-size: 12px; font-weight: 600; color: var(--text-secondary);
  cursor: pointer; transition: all 0.15s; white-space: nowrap;
}
.qe-btn:hover { border-color: var(--primary); }

.qe-form {
  background: var(--bg-alt); border: 1px solid var(--border);
  border-radius: 12px; padding: 14px; margin-top: 8px;
}
.qe-quick { text-align: center; }
.qe-quick p { font-size: 14px; color: var(--text); margin-bottom: 12px; }

.qe-form-row { display: flex; gap: 10px; margin-bottom: 10px; }
.qe-form-row:last-child { margin-bottom: 0; }
.qe-field { flex: 1; }
.qe-field label { display: block; font-size: 11px; font-weight: 600; color: var(--text-muted); margin-bottom: 3px; }
.qe-field input, .qe-field textarea {
  width: 100%; padding: 8px 10px; background: var(--bg);
  border: 1px solid var(--border); border-radius: 8px;
  font-size: 13px; color: var(--text); outline: none;
  font-family: inherit; resize: vertical;
  transition: border-color 0.15s;
}
.qe-field input:focus, .qe-field textarea:focus { border-color: var(--primary); }

.chip-row { display: flex; gap: 4px; flex-wrap: wrap; }
.chip {
  padding: 5px 12px; border-radius: 16px;
  border: 1.5px solid var(--border); background: var(--bg);
  font-size: 12px; font-weight: 600; color: var(--text-secondary);
  cursor: pointer; transition: all 0.15s;
}
.chip.active { background: var(--primary); color: #fff; border-color: var(--primary); }

.qe-form-actions { display: flex; gap: 8px; margin-top: 12px; }
.btn-save {
  padding: 8px 20px; background: var(--primary); color: #fff;
  border: none; border-radius: 8px; font-size: 13px; font-weight: 600;
  cursor: pointer; transition: opacity 0.15s;
}
.btn-save:hover { opacity: 0.85; }
.btn-save:disabled { opacity: 0.5; cursor: default; }
.btn-cancel { padding: 8px 16px; background: none; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; color: var(--text-secondary); cursor: pointer; }

.slide-form-enter-active { transition: all 0.2s ease-out; }
.slide-form-leave-active { transition: all 0.15s ease-in; }
.slide-form-enter-from { opacity: 0; max-height: 0; transform: translateY(-8px); }
.slide-form-leave-to { opacity: 0; max-height: 0; }
</style>
