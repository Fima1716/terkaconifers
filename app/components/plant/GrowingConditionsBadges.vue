<script setup lang="ts">
interface Props {
  conditions: {
    light?: string
    moisture?: string
    wind?: string
    winter?: string
    soil?: string[]
  }
  compact?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  compact: false,
})

interface BadgeInfo {
  icon: string
  label: string
  bg: string
  color: string
}

const lightMap: Record<string, BadgeInfo> = {
  full_sun: {
    icon: 'sun',
    label: 'Полное солнце',
    bg: '#FFF8E1',
    color: '#F57F17',
  },
  partial_shade: {
    icon: 'half-sun',
    label: 'Полутень',
    bg: '#E8F5E9',
    color: '#2E7D32',
  },
  shade: {
    icon: 'cloud',
    label: 'Тень',
    bg: '#E3F2FD',
    color: '#1565C0',
  },
}

const moistureMap: Record<string, BadgeInfo> = {
  loves_water: {
    icon: 'drops',
    label: 'Влаголюбивое',
    bg: '#E3F2FD',
    color: '#1565C0',
  },
  moderate: {
    icon: 'drop',
    label: 'Умеренный полив',
    bg: '#E8F5E9',
    color: '#2E7D32',
  },
  drought_tolerant: {
    icon: 'drop-slash',
    label: 'Засухоустойчивое',
    bg: '#FFF8E1',
    color: '#F57F17',
  },
}

const windMap: Record<string, BadgeInfo> = {
  wind_resistant: {
    icon: 'wind',
    label: 'Ветроустойчивое',
    bg: '#E8EAF6',
    color: '#283593',
  },
  needs_shelter: {
    icon: 'shelter',
    label: 'Нужен затишек',
    bg: '#FCE4EC',
    color: '#C62828',
  },
}

const winterMap: Record<string, BadgeInfo> = {
  needs_cover: {
    icon: 'snowflake',
    label: 'Укрытие на зиму',
    bg: '#FCE4EC',
    color: '#C62828',
  },
  hardy: {
    icon: 'shield',
    label: 'Зимует без укрытия',
    bg: '#E8F5E9',
    color: '#2E7D32',
  },
}

const soilMap: Record<string, BadgeInfo> = {
  any: {
    icon: 'soil',
    label: 'Любая почва',
    bg: '#EFEBE9',
    color: '#4E342E',
  },
  acidic: {
    icon: 'soil',
    label: 'Кислая почва',
    bg: '#F3E5F5',
    color: '#6A1B9A',
  },
  alkaline: {
    icon: 'soil',
    label: 'Щелочная почва',
    bg: '#E8EAF6',
    color: '#283593',
  },
  well_drained: {
    icon: 'soil',
    label: 'Дренированная',
    bg: '#FFF8E1',
    color: '#F57F17',
  },
}

const badges = computed<BadgeInfo[]>(() => {
  const result: BadgeInfo[] = []
  const c = props.conditions
  if (!c) return result

  if (c.light && lightMap[c.light]) result.push(lightMap[c.light])
  if (c.moisture && moistureMap[c.moisture]) result.push(moistureMap[c.moisture])
  if (c.wind && windMap[c.wind]) result.push(windMap[c.wind])
  if (c.winter && winterMap[c.winter]) result.push(winterMap[c.winter])
  if (c.soil && Array.isArray(c.soil)) {
    for (const s of c.soil) {
      if (soilMap[s]) result.push(soilMap[s])
    }
  }

  return result
})
</script>

<template>
  <div v-if="badges.length" class="growing-badges" :class="{ compact }">
    <span
      v-for="(badge, i) in badges"
      :key="i"
      class="gc-badge"
      :style="{ background: badge.bg, color: badge.color }"
      :title="compact ? badge.label : undefined"
    >
      <!-- Sun icon -->
      <svg v-if="badge.icon === 'sun'" :width="compact ? 12 : 14" :height="compact ? 12 : 14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="3" fill="currentColor" />
        <line x1="7" y1="0.5" x2="7" y2="2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
        <line x1="7" y1="11.5" x2="7" y2="13.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
        <line x1="0.5" y1="7" x2="2.5" y2="7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
        <line x1="11.5" y1="7" x2="13.5" y2="7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
        <line x1="2.4" y1="2.4" x2="3.8" y2="3.8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
        <line x1="10.2" y1="10.2" x2="11.6" y2="11.6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
        <line x1="2.4" y1="11.6" x2="3.8" y2="10.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
        <line x1="10.2" y1="3.8" x2="11.6" y2="2.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
      </svg>

      <!-- Half-sun icon -->
      <svg v-else-if="badge.icon === 'half-sun'" :width="compact ? 12 : 14" :height="compact ? 12 : 14" viewBox="0 0 14 14" fill="none">
        <clipPath id="half-clip">
          <rect x="0" y="0" width="7" height="14" />
        </clipPath>
        <circle cx="7" cy="7" r="3" stroke="currentColor" stroke-width="1.2" />
        <circle cx="7" cy="7" r="3" fill="currentColor" clip-path="url(#half-clip)" />
        <line x1="7" y1="0.5" x2="7" y2="2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
        <line x1="7" y1="11.5" x2="7" y2="13.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
        <line x1="0.5" y1="7" x2="2.5" y2="7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
        <line x1="11.5" y1="7" x2="13.5" y2="7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
        <line x1="2.4" y1="2.4" x2="3.8" y2="3.8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
        <line x1="10.2" y1="10.2" x2="11.6" y2="11.6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
      </svg>

      <!-- Cloud icon -->
      <svg v-else-if="badge.icon === 'cloud'" :width="compact ? 12 : 14" :height="compact ? 12 : 14" viewBox="0 0 14 14" fill="none">
        <path d="M3.5 10.5h7a2.5 2.5 0 000-5 2.5 2.5 0 00-.5.05A3.5 3.5 0 003 7a2.5 2.5 0 00.5 3.5z" fill="currentColor" opacity="0.9" />
      </svg>

      <!-- 3 drops icon -->
      <svg v-else-if="badge.icon === 'drops'" :width="compact ? 12 : 14" :height="compact ? 12 : 14" viewBox="0 0 14 14" fill="none">
        <path d="M3 9.5c0 1.1.9 2 2 2s2-.9 2-2S5 5 5 5 3 8.4 3 9.5z" fill="currentColor" opacity="0.7" />
        <path d="M7 7c0 1.1.9 2 2 2s2-.9 2-2-2-4.5-2-4.5S7 5.9 7 7z" fill="currentColor" opacity="0.85" />
        <path d="M5 12c0 .8.7 1.5 1.5 1.5S8 12.8 8 12s-1.5-3-1.5-3S5 11.2 5 12z" fill="currentColor" opacity="0.6" />
      </svg>

      <!-- 1 drop icon -->
      <svg v-else-if="badge.icon === 'drop'" :width="compact ? 12 : 14" :height="compact ? 12 : 14" viewBox="0 0 14 14" fill="none">
        <path d="M7 1.5S3.5 6.5 3.5 9a3.5 3.5 0 007 0C10.5 6.5 7 1.5 7 1.5z" fill="currentColor" />
      </svg>

      <!-- Drop with slash icon -->
      <svg v-else-if="badge.icon === 'drop-slash'" :width="compact ? 12 : 14" :height="compact ? 12 : 14" viewBox="0 0 14 14" fill="none">
        <path d="M7 1.5S3.5 6.5 3.5 9a3.5 3.5 0 007 0C10.5 6.5 7 1.5 7 1.5z" fill="currentColor" opacity="0.4" />
        <line x1="2.5" y1="12" x2="11.5" y2="2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
      </svg>

      <!-- Wind icon -->
      <svg v-else-if="badge.icon === 'wind'" :width="compact ? 12 : 14" :height="compact ? 12 : 14" viewBox="0 0 14 14" fill="none">
        <path d="M1 5h8.5a1.5 1.5 0 10-1.5-1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M1 8h10.5a1.5 1.5 0 11-1.5 1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M2.5 11h5a1.5 1.5 0 11-1.5 1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>

      <!-- Shelter icon -->
      <svg v-else-if="badge.icon === 'shelter'" :width="compact ? 12 : 14" :height="compact ? 12 : 14" viewBox="0 0 14 14" fill="none">
        <path d="M2 7l5-4.5L12 7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
        <rect x="3.5" y="7" width="7" height="5" rx="0.5" fill="currentColor" opacity="0.3" />
        <rect x="5.5" y="9" width="3" height="3" rx="0.3" fill="currentColor" opacity="0.5" />
      </svg>

      <!-- Snowflake icon -->
      <svg v-else-if="badge.icon === 'snowflake'" :width="compact ? 12 : 14" :height="compact ? 12 : 14" viewBox="0 0 14 14" fill="none">
        <line x1="7" y1="1" x2="7" y2="13" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
        <line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
        <line x1="2.8" y1="2.8" x2="11.2" y2="11.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
        <line x1="11.2" y1="2.8" x2="2.8" y2="11.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
        <line x1="7" y1="1" x2="5.5" y2="2.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" />
        <line x1="7" y1="1" x2="8.5" y2="2.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" />
        <line x1="7" y1="13" x2="5.5" y2="11.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" />
        <line x1="7" y1="13" x2="8.5" y2="11.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" />
      </svg>

      <!-- Shield-check icon -->
      <svg v-else-if="badge.icon === 'shield'" :width="compact ? 12 : 14" :height="compact ? 12 : 14" viewBox="0 0 14 14" fill="none">
        <path d="M7 1L2 3.5v3.5c0 3.2 2.1 5.6 5 6.5 2.9-.9 5-3.3 5-6.5V3.5L7 1z" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="1" stroke-linejoin="round" />
        <polyline points="4.5,7.2 6.2,9 9.5,5.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" fill="none" />
      </svg>

      <!-- Soil icon (for all soil types) -->
      <svg v-else-if="badge.icon === 'soil'" :width="compact ? 12 : 14" :height="compact ? 12 : 14" viewBox="0 0 14 14" fill="none">
        <ellipse cx="7" cy="10" rx="5.5" ry="2" fill="currentColor" opacity="0.3" />
        <path d="M7 2.5c-1 0-2 1-2 2.2 0 1.5 2 3.3 2 3.3s2-1.8 2-3.3c0-1.2-1-2.2-2-2.2z" fill="currentColor" opacity="0.7" />
        <line x1="7" y1="8" x2="7" y2="11" stroke="currentColor" stroke-width="1" stroke-linecap="round" />
      </svg>

      <span v-if="!compact" class="gc-label">{{ badge.label }}</span>
    </span>
  </div>
</template>

<style scoped>
.growing-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.gc-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  transition: opacity 0.15s;
}

.gc-badge:hover {
  opacity: 0.85;
}

.gc-badge svg {
  flex-shrink: 0;
}

.gc-label {
  padding-top: 1px;
}

/* Compact mode: icon-only circles */
.compact .gc-badge {
  width: 20px;
  height: 20px;
  padding: 0;
  border-radius: 50%;
  justify-content: center;
  cursor: default;
}
</style>
