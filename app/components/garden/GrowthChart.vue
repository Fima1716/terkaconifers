<script setup lang="ts">
import type { GardenEvent } from '~/stores/garden'

const props = defineProps<{ events: GardenEvent[] }>()

const measurements = computed(() => {
  return props.events
    .filter(e => e.type === 'measurement' && (e.height || e.width))
    .sort((a, b) => a.date.localeCompare(b.date))
})

const hasData = computed(() => measurements.value.length >= 2)

// Chart dimensions
const W = 600
const H = 200
const PAD = { top: 20, right: 20, bottom: 30, left: 45 }
const chartW = W - PAD.left - PAD.right
const chartH = H - PAD.top - PAD.bottom

const heightData = computed(() => measurements.value.filter(m => m.height).map(m => ({ date: m.date, val: m.height! })))
const widthData = computed(() => measurements.value.filter(m => m.width).map(m => ({ date: m.date, val: m.width! })))

function buildPath(data: { date: string; val: number }[]) {
  if (data.length < 2) return { path: '', points: [] as { x: number; y: number; val: number; date: string }[] }
  const minVal = Math.min(...data.map(d => d.val)) * 0.9
  const maxVal = Math.max(...data.map(d => d.val)) * 1.1
  const rangeVal = maxVal - minVal || 1

  const firstDate = new Date(data[0].date).getTime()
  const lastDate = new Date(data[data.length - 1].date).getTime()
  const rangeDate = lastDate - firstDate || 1

  const points = data.map(d => {
    const x = PAD.left + ((new Date(d.date).getTime() - firstDate) / rangeDate) * chartW
    const y = PAD.top + chartH - ((d.val - minVal) / rangeVal) * chartH
    return { x, y, val: d.val, date: d.date }
  })

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  return { path, points, minVal, maxVal }
}

const heightChart = computed(() => buildPath(heightData.value))
const widthChart = computed(() => buildPath(widthData.value))

// Y-axis labels
function yLabels(min: number, max: number) {
  const range = max - min
  const step = Math.ceil(range / 4 / 5) * 5 || 5
  const labels = []
  for (let v = Math.floor(min / step) * step; v <= max; v += step) {
    const y = PAD.top + chartH - ((v - min) / (max - min || 1)) * chartH
    if (y >= PAD.top && y <= PAD.top + chartH) labels.push({ y, label: v })
  }
  return labels
}

// X-axis labels
function xLabels(data: { date: string }[]) {
  if (data.length < 2) return []
  const first = new Date(data[0].date).getTime()
  const last = new Date(data[data.length - 1].date).getTime()
  const range = last - first || 1
  const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
  return data.map(d => {
    const t = new Date(d.date).getTime()
    const x = PAD.left + ((t - first) / range) * chartW
    const dt = new Date(d.date)
    return { x, label: `${months[dt.getMonth()]} ${dt.getFullYear().toString().slice(2)}` }
  })
}

const activeChart = computed(() => {
  if (heightData.value.length >= 2) return heightChart.value
  return widthChart.value
})

const activeData = computed(() => heightData.value.length >= 2 ? heightData.value : widthData.value)
const activeLabel = computed(() => heightData.value.length >= 2 ? 'Высота, см' : 'Ширина, см')

const hovered = ref<number | null>(null)
</script>

<template>
  <div v-if="hasData" class="growth-chart">
    <div class="chart-header">
      <span class="chart-title">График роста</span>
      <span class="chart-label">{{ activeLabel }}</span>
    </div>
    <svg :viewBox="`0 0 ${W} ${H}`" class="chart-svg">
      <!-- Grid lines -->
      <line v-for="yl in yLabels(activeChart.minVal || 0, activeChart.maxVal || 100)" :key="yl.label"
        :x1="PAD.left" :y1="yl.y" :x2="PAD.left + chartW" :y2="yl.y"
        stroke="var(--border-light)" stroke-width="1" />
      <!-- Y labels -->
      <text v-for="yl in yLabels(activeChart.minVal || 0, activeChart.maxVal || 100)" :key="'t'+yl.label"
        :x="PAD.left - 8" :y="yl.y + 4" text-anchor="end" fill="var(--text-muted)" font-size="10">
        {{ yl.label }}
      </text>
      <!-- X labels -->
      <text v-for="(xl, i) in xLabels(activeData)" :key="'x'+i"
        :x="xl.x" :y="H - 6" text-anchor="middle" fill="var(--text-muted)" font-size="9">
        {{ xl.label }}
      </text>
      <!-- Line -->
      <path :d="activeChart.path" fill="none" stroke="#2e7d32" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      <!-- Area fill -->
      <path v-if="activeChart.points?.length"
        :d="activeChart.path + `L${activeChart.points[activeChart.points.length-1].x},${PAD.top + chartH}L${activeChart.points[0].x},${PAD.top + chartH}Z`"
        fill="rgba(46,125,50,0.08)" />
      <!-- Points -->
      <g v-for="(p, i) in activeChart.points" :key="i">
        <circle :cx="p.x" :cy="p.y" r="5" fill="#fff" stroke="#2e7d32" stroke-width="2"
          @mouseenter="hovered = i" @mouseleave="hovered = null" class="chart-point" />
        <g v-if="hovered === i">
          <rect :x="p.x - 30" :y="p.y - 28" width="60" height="22" rx="6" fill="var(--text)" />
          <text :x="p.x" :y="p.y - 14" text-anchor="middle" fill="#fff" font-size="11" font-weight="600">
            {{ p.val }} см
          </text>
        </g>
      </g>
    </svg>
    <div v-if="widthData.length >= 2 && heightData.length >= 2" class="chart-note">
      Также замерена ширина: от {{ widthData[0].val }} до {{ widthData[widthData.length-1].val }} см
    </div>
  </div>
</template>

<style scoped>
.growth-chart { background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
.chart-header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 8px; }
.chart-title { font-size: 14px; font-weight: 700; color: var(--text); }
.chart-label { font-size: 11px; color: var(--text-muted); }
.chart-svg { width: 100%; height: auto; }
.chart-point { cursor: pointer; transition: r 0.15s; }
.chart-point:hover { r: 7; }
.chart-note { font-size: 11px; color: var(--text-muted); margin-top: 8px; text-align: center; }
</style>
