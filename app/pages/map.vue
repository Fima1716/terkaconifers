<script setup lang="ts">
import { useCatalogStore } from '~/stores/catalog'

const catalog = useCatalogStore()
onMounted(() => { if (!catalog.isLoaded) catalog.loadCatalog() })

useHead({
  title: 'Карта садов — Территория Хвойных',
  link: [{ rel: 'stylesheet', href: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css' }],
})

// Region → coordinates
const COORDS: Record<string, [number, number]> = {
  'Московская область': [55.75, 37.62],
  'г.Москва': [55.76, 37.64],
  'Пермский край': [58.01, 56.25],
  'Омская область': [54.99, 73.37],
  'Свердловская область': [56.84, 60.60],
  'Иркутская область': [52.29, 104.28],
  'Томская область': [56.50, 84.97],
  'Ленинградская область': [59.93, 30.32],
  'Республика Татарстан': [55.80, 49.11],
  'Псковская область': [57.82, 28.33],
  'Ростовская область': [47.24, 39.72],
  'Республика Марий Эл': [56.63, 47.89],
  'Белгородская область': [50.60, 36.59],
  'Краснодарский край': [45.04, 38.98],
  'Калининградская область': [54.71, 20.51],
  'Нижегородская область': [56.33, 44.00],
  'Новосибирская область': [55.03, 82.92],
  'Красноярский край': [56.01, 92.87],
  'Приморский край': [43.12, 131.88],
  'Тульская область': [54.19, 37.62],
  'Челябинская область': [55.16, 61.40],
  'Владимирская область': [56.13, 40.42],
  'Ярославская область': [57.63, 39.87],
  'Тверская область': [56.86, 35.90],
  'Курская область': [51.73, 36.19],
  'Воронежская область': [51.67, 39.21],
  'Волгоградская область': [48.71, 44.51],
  'Ставропольский край': [45.04, 43.97],
  'Республика Адыгея': [44.61, 40.10],
  'Беларусь': [53.90, 27.57],
  'ДНР': [48.00, 37.80],
  'Уфа': [54.74, 55.97],
  'Урал': [56.84, 60.60],
}

// Build garden data from catalog
interface GardenPin {
  name: string
  region: string
  count: number
  coords: [number, number]
  genera: string[]
}

const gardens = computed<GardenPin[]>(() => {
  if (!catalog.isLoaded) return []
  const map = new Map<string, { region: string; count: number; genera: Set<string> }>()
  for (const p of catalog.catalog) {
    const g = p.garden_display
    if (!g || g === 'Частные сады' || g === 'Частный сад') continue
    if (!map.has(g)) map.set(g, { region: p.region_normalized || '', count: 0, genera: new Set() })
    const entry = map.get(g)!
    entry.count++
    if (p.genus_ru) entry.genera.add(p.genus_ru)
  }
  const pins: GardenPin[] = []
  for (const [name, data] of map) {
    const coords = COORDS[data.region]
    if (!coords) continue
    // Jitter to separate overlapping pins
    const jitter = (s: string) => { let h = 0; for (const c of s) h = ((h << 5) - h + c.charCodeAt(0)) | 0; return (h % 100) / 500 }
    pins.push({
      name,
      region: data.region,
      count: data.count,
      coords: [coords[0] + jitter(name), coords[1] + jitter(name + 'x')],
      genera: [...data.genera].slice(0, 5),
    })
  }
  return pins
})

// Init map
const mapRef = ref<HTMLElement>()
let leafletMap: any = null

async function initMap() {
  if (!mapRef.value || leafletMap) return
  const L = (window as any).L
  if (!L) return

  leafletMap = L.map(mapRef.value, {
    center: [56, 60],
    zoom: 4,
    zoomControl: true,
    attributionControl: false,
  })

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 12,
  }).addTo(leafletMap)

  // Custom green marker
  const icon = L.divIcon({
    className: 'garden-marker',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -10],
  })

  const bigIcon = L.divIcon({
    className: 'garden-marker garden-marker-big',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -12],
  })

  for (const g of gardens.value) {
    const marker = L.marker(g.coords, { icon: g.count > 50 ? bigIcon : icon }).addTo(leafletMap)
    marker.bindPopup(`
      <div style="min-width:180px">
        <strong style="font-size:14px">${g.name}</strong><br>
        <span style="font-size:12px;color:#666">${g.region}</span><br>
        <span style="font-size:13px;font-weight:600;color:#1a5632">${g.count} растений</span><br>
        <span style="font-size:11px;color:#999">${g.genera.join(', ')}</span><br>
        <a href="/garden/${encodeURIComponent(g.name)}" style="font-size:12px;color:#1a5632;font-weight:600;margin-top:6px;display:inline-block">Открыть сад →</a>
      </div>
    `, { closeButton: false })
  }
}

// Load Leaflet JS dynamically
onMounted(() => {
  if ((window as any).L) { nextTick(initMap); return }
  const script = document.createElement('script')
  script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
  script.onload = () => nextTick(initMap)
  document.head.appendChild(script)
})

watch(gardens, () => {
  if (gardens.value.length && (window as any).L) initMap()
})
</script>

<template>
  <div class="map-page">
    <div class="map-header container">
      <BreadCrumbs :items="[{ label: 'Главная', to: '/' }, { label: 'Карта садов' }]" />
      <h1>Карта садов</h1>
      <p class="map-subtitle">{{ gardens.length }} садов по всей России</p>
    </div>
    <div ref="mapRef" class="map-container" />
  </div>
</template>

<style>
/* Global styles for Leaflet markers */
.garden-marker {
  background: #1a5632;
  border: 2.5px solid #fff;
  border-radius: 50%;
  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
}
.garden-marker-big {
  background: #2e7d32;
  border-width: 3px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.35);
}
.leaflet-popup-content-wrapper {
  border-radius: 12px !important;
  box-shadow: 0 4px 16px rgba(0,0,0,0.12) !important;
}
.leaflet-popup-tip { display: none; }
</style>

<style scoped>
.map-page { display: flex; flex-direction: column; height: calc(100dvh - var(--header-h)); }
.map-header { padding: 16px 16px 12px; flex-shrink: 0; }
.map-header h1 { font-size: 24px; font-weight: 700; margin-bottom: 2px; }
.map-subtitle { font-size: 13px; color: var(--text-muted); }
.map-container { flex: 1; min-height: 400px; }

@media (min-width: 768px) {
  .map-header { padding: 20px 24px 14px; }
  .map-header h1 { font-size: 28px; }
}
</style>
