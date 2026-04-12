<script setup lang="ts">
import { useGardenStore, SCHEDULE_LABELS } from '~/stores/garden'
import type { CareSchedule, ScheduleType } from '~/stores/garden'

const props = defineProps<{ plantId: string }>()
const garden = useGardenStore()

const schedules = computed(() => garden.getPlantSchedules(props.plantId))
const showAdd = ref(false)
const saving = ref(false)

const newSchedule = ref({
  type: 'watering' as ScheduleType,
  name: '',
  intervalDays: 3,
  notes: '',
})

const scheduleTypes: ScheduleType[] = ['watering', 'fertilizing', 'pruning', 'treatment', 'measurement', 'custom']

async function addSchedule() {
  if (!newSchedule.value.intervalDays) return
  saving.value = true
  try {
    await garden.addSchedule({
      plantId: props.plantId,
      type: newSchedule.value.type,
      name: newSchedule.value.name || SCHEDULE_LABELS[newSchedule.value.type],
      intervalDays: newSchedule.value.intervalDays,
      notes: newSchedule.value.notes,
      active: true,
      lastDone: null,
    })
    showAdd.value = false
    newSchedule.value = { type: 'watering', name: '', intervalDays: 3, notes: '' }
  } finally { saving.value = false }
}

async function markDone(id: string) {
  await garden.markDone(id)
}

async function toggleActive(s: CareSchedule) {
  await garden.updateSchedule(s.id, { active: !s.active })
}

async function deleteSchedule(id: string) {
  if (!confirm('Удалить расписание?')) return
  await garden.removeSchedule(id)
}

function isDue(s: CareSchedule): boolean {
  if (!s.nextDue || !s.active) return false
  return s.nextDue <= new Date().toISOString().slice(0, 10)
}

function dueLabel(s: CareSchedule): string {
  if (!s.nextDue) return ''
  const today = new Date().toISOString().slice(0, 10)
  if (s.nextDue < today) {
    const days = Math.floor((Date.now() - new Date(s.nextDue).getTime()) / 86400000)
    return `Просрочено на ${days} дн.`
  }
  if (s.nextDue === today) return 'Сегодня!'
  const days = Math.floor((new Date(s.nextDue).getTime() - Date.now()) / 86400000) + 1
  return `через ${days} дн.`
}

function intervalLabel(days: number): string {
  if (days === 1) return 'каждый день'
  if (days === 7) return 'раз в неделю'
  if (days === 14) return 'раз в 2 недели'
  if (days === 30) return 'раз в месяц'
  return `каждые ${days} дн.`
}
</script>

<template>
  <div class="schedules">
    <div class="sch-header">
      <span class="sch-title">Расписание ухода</span>
      <button class="sch-add-btn" @click="showAdd = !showAdd">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
    </div>

    <!-- Schedule items -->
    <div v-if="schedules.length === 0 && !showAdd" class="sch-empty">
      Нет расписаний. Добавьте напоминание об уходе.
    </div>

    <div v-for="s in schedules" :key="s.id" class="sch-item" :class="{ overdue: isDue(s), inactive: !s.active }">
      <div class="sch-item-left">
        <button v-if="s.active" class="sch-done-btn" :class="{ due: isDue(s) }" @click="markDone(s.id)" title="Сделано">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg>
        </button>
        <div v-else class="sch-paused">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        </div>
      </div>
      <div class="sch-item-body">
        <div class="sch-item-name">{{ s.name }}</div>
        <div class="sch-item-meta">
          <span>{{ intervalLabel(s.intervalDays) }}</span>
          <span v-if="s.active && s.nextDue" class="sch-due" :class="{ 'sch-due-urgent': isDue(s) }">{{ dueLabel(s) }}</span>
        </div>
      </div>
      <div class="sch-item-actions">
        <button @click="toggleActive(s)" :title="s.active ? 'Приостановить' : 'Возобновить'">
          <svg v-if="s.active" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </button>
        <button @click="deleteSchedule(s.id)" title="Удалить">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>

    <!-- Add form -->
    <Transition name="slide-form">
      <div v-if="showAdd" class="sch-form">
        <div class="sch-form-types">
          <button v-for="t in scheduleTypes" :key="t" class="chip" :class="{ active: newSchedule.type === t }" @click="newSchedule.type = t">{{ SCHEDULE_LABELS[t] }}</button>
        </div>
        <div class="sch-form-row">
          <div class="sch-field" style="flex:2">
            <label>Название</label>
            <input v-model="newSchedule.name" type="text" :placeholder="SCHEDULE_LABELS[newSchedule.type]">
          </div>
          <div class="sch-field">
            <label>Каждые (дней)</label>
            <input v-model.number="newSchedule.intervalDays" type="number" min="1" placeholder="3">
          </div>
        </div>
        <div class="sch-field">
          <label>Заметка</label>
          <input v-model="newSchedule.notes" type="text" placeholder="Необязательно">
        </div>
        <div class="sch-form-actions">
          <button class="btn-save" :disabled="saving || !newSchedule.intervalDays" @click="addSchedule">Добавить</button>
          <button class="btn-cancel" @click="showAdd = false">Отмена</button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.schedules { }
.sch-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.sch-title { font-size: 14px; font-weight: 700; color: var(--text); }
.sch-add-btn {
  width: 28px; height: 28px; border-radius: 50%;
  background: var(--primary); color: #fff; border: none;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: opacity 0.15s;
}
.sch-add-btn:hover { opacity: 0.85; }

.sch-empty { padding: 16px 0; text-align: center; color: var(--text-muted); font-size: 13px; }

.sch-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; border-radius: 10px;
  border: 1px solid var(--border); background: var(--bg);
  margin-bottom: 6px; transition: all 0.15s;
}
.sch-item.overdue { border-color: #e53935; background: #fff5f5; }
.sch-item.inactive { opacity: 0.5; }

.sch-done-btn {
  width: 32px; height: 32px; border-radius: 50%;
  border: 2px solid var(--border); background: none;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-muted); cursor: pointer;
  transition: all 0.15s;
}
.sch-done-btn.due { border-color: var(--primary); color: var(--primary); animation: pulse 2s infinite; }
.sch-done-btn:hover { border-color: var(--primary); color: var(--primary); background: rgba(46,125,50,0.05); }

@keyframes pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(46,125,50,0.3); } 50% { box-shadow: 0 0 0 6px rgba(46,125,50,0); } }

.sch-paused { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; color: var(--text-muted); }

.sch-item-body { flex: 1; min-width: 0; }
.sch-item-name { font-size: 13px; font-weight: 600; color: var(--text); }
.sch-item-meta { display: flex; gap: 8px; font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.sch-due { font-weight: 600; }
.sch-due-urgent { color: #e53935; }

.sch-item-actions { display: flex; gap: 4px; }
.sch-item-actions button {
  width: 28px; height: 28px; border-radius: 6px;
  background: none; border: none;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-muted); cursor: pointer; transition: all 0.15s;
}
.sch-item-actions button:hover { background: var(--bg-alt); color: var(--text); }

/* Form */
.sch-form { background: var(--bg-alt); border: 1px solid var(--border); border-radius: 12px; padding: 14px; margin-top: 10px; }
.sch-form-types { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 10px; }
.chip {
  padding: 5px 12px; border-radius: 16px;
  border: 1.5px solid var(--border); background: var(--bg);
  font-size: 12px; font-weight: 600; color: var(--text-secondary);
  cursor: pointer; transition: all 0.15s;
}
.chip.active { background: var(--primary); color: #fff; border-color: var(--primary); }

.sch-form-row { display: flex; gap: 10px; margin-bottom: 10px; }
.sch-field { flex: 1; margin-bottom: 8px; }
.sch-field label { display: block; font-size: 11px; font-weight: 600; color: var(--text-muted); margin-bottom: 3px; }
.sch-field input {
  width: 100%; padding: 8px 10px; background: var(--bg);
  border: 1px solid var(--border); border-radius: 8px;
  font-size: 13px; color: var(--text); outline: none;
  transition: border-color 0.15s;
}
.sch-field input:focus { border-color: var(--primary); }

.sch-form-actions { display: flex; gap: 8px; }
.btn-save {
  padding: 8px 20px; background: var(--primary); color: #fff;
  border: none; border-radius: 8px; font-size: 13px; font-weight: 600;
  cursor: pointer; transition: opacity 0.15s;
}
.btn-save:hover { opacity: 0.85; }
.btn-save:disabled { opacity: 0.5; }
.btn-cancel { padding: 8px 16px; background: none; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; color: var(--text-secondary); cursor: pointer; }

.slide-form-enter-active { transition: all 0.2s ease-out; }
.slide-form-leave-active { transition: all 0.15s ease-in; }
.slide-form-enter-from { opacity: 0; transform: translateY(-8px); }
.slide-form-leave-to { opacity: 0; }
</style>
