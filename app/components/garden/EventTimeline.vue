<script setup lang="ts">
import { useGardenStore, EVENT_LABELS, EVENT_COLORS, EVENT_ICONS } from '~/stores/garden'
import type { GardenEvent, EventType } from '~/stores/garden'

const props = defineProps<{ plantId: string }>()
const garden = useGardenStore()

onMounted(() => garden.loadEvents(props.plantId))

const events = computed(() => garden.getPlantEvents(props.plantId))

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function eventSummary(ev: GardenEvent): string {
  switch (ev.type) {
    case 'measurement': {
      const parts: string[] = []
      if (ev.height) parts.push(`высота ${ev.height} см`)
      if (ev.width) parts.push(`ширина ${ev.width} см`)
      if (ev.trunkDiameter) parts.push(`ствол ${ev.trunkDiameter} мм`)
      return parts.join(', ') || 'Замер'
    }
    case 'fertilizing':
    case 'treatment':
      return [ev.product, ev.dosage].filter(Boolean).join(' — ') || EVENT_LABELS[ev.type]
    case 'problem': {
      const labels: Record<string, string> = { disease: 'Болезнь', pest: 'Вредитель', frost: 'Мороз', other: 'Другое' }
      const sevLabels: Record<string, string> = { low: 'слабо', medium: 'средне', high: 'сильно' }
      return [labels[ev.problemType || ''] || '', ev.severity ? sevLabels[ev.severity] : ''].filter(Boolean).join(' — ')
    }
    default:
      return ev.text || ''
  }
}

async function deleteEvent(ev: GardenEvent) {
  if (!confirm('Удалить запись?')) return
  await garden.removeEvent(props.plantId, ev.id)
}
</script>

<template>
  <div class="timeline">
    <div v-if="events.length === 0" class="timeline-empty">
      Записей пока нет. Добавьте первое событие!
    </div>
    <div v-for="ev in events" :key="ev.id" class="tl-item">
      <div class="tl-line">
        <div class="tl-dot" :style="{ background: EVENT_COLORS[ev.type] }">
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" width="12" height="12">
            <path :d="EVENT_ICONS[ev.type]" />
          </svg>
        </div>
      </div>
      <div class="tl-content">
        <div class="tl-header">
          <span class="tl-type" :style="{ color: EVENT_COLORS[ev.type] }">{{ EVENT_LABELS[ev.type] }}</span>
          <span class="tl-date">{{ formatDate(ev.date) }}</span>
          <button class="tl-delete" @click="deleteEvent(ev)" title="Удалить">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div v-if="eventSummary(ev)" class="tl-summary">{{ eventSummary(ev) }}</div>
        <div v-if="ev.text && ev.type !== 'note'" class="tl-text">{{ ev.text }}</div>
        <div v-if="ev.type === 'note' && ev.text" class="tl-note">{{ ev.text }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.timeline { position: relative; }
.timeline-empty { padding: 24px 0; text-align: center; color: var(--text-muted); font-size: 13px; }

.tl-item { display: flex; gap: 12px; position: relative; padding-bottom: 20px; }
.tl-item:last-child { padding-bottom: 0; }

.tl-line { position: relative; width: 28px; flex-shrink: 0; display: flex; justify-content: center; }
.tl-line::after {
  content: ''; position: absolute; top: 28px; bottom: -20px; left: 50%; width: 2px;
  background: var(--border-light); transform: translateX(-50%);
}
.tl-item:last-child .tl-line::after { display: none; }

.tl-dot {
  width: 28px; height: 28px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; z-index: 1;
}

.tl-content { flex: 1; min-width: 0; padding-top: 3px; }
.tl-header { display: flex; align-items: center; gap: 8px; }
.tl-type { font-size: 13px; font-weight: 700; }
.tl-date { font-size: 11px; color: var(--text-muted); }
.tl-delete { background: none; border: none; color: var(--text-muted); cursor: pointer; opacity: 0; margin-left: auto; padding: 2px; transition: opacity 0.15s, color 0.15s; }
.tl-item:hover .tl-delete { opacity: 1; }
.tl-delete:hover { color: #e53935; }

.tl-summary { font-size: 13px; color: var(--text); margin-top: 4px; line-height: 1.4; }
.tl-text { font-size: 12px; color: var(--text-secondary); margin-top: 4px; font-style: italic; }
.tl-note { font-size: 13px; color: var(--text); margin-top: 4px; line-height: 1.5; white-space: pre-wrap; }
</style>
