<script setup lang="ts">
import { useCatalogStore } from '~/stores/catalog'

const catalog = useCatalogStore()
onMounted(() => { if (!catalog.isLoaded) catalog.loadCatalog() })

useHead({
  title: 'Карта садов — Территория Хвойных',
  link: [{ rel: 'stylesheet', href: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css' }],
})

// Geocoded coordinates (fetched from cache)
const geocodes = ref<Record<string, [number, number]>>({})
const geocodesLoaded = ref(false)

onMounted(async () => {
  try {
    const data = await $fetch<Record<string, [number, number]>>('/api/geocodes')
    geocodes.value = data || {}
  } catch {}
  geocodesLoaded.value = true
})

// Normalize district spelling to match geocodes cache keys
const DISTRICT_NORM: Record<string, string> = {
  'Сергиево Посадский район': 'Сергиево-Посадский район',
  'Сергиево-Посадский р-н': 'Сергиево-Посадский район',
  'Сергиево- Посадский район': 'Сергиево-Посадский район',
  'Сергиево_Посадский район': 'Сергиево-Посадский район',
  'Сергиево - Посадский район': 'Сергиево-Посадский район',
  'Лотошинский р-н': 'Лотошинский район',
  'г. Миасс': 'г.Миасс',
  'г. Пятигорск': 'г.Пятигорск',
  'г. Иркутск': 'г.Иркутск',
  'г. Ростов-на-Дону': 'г.Ростов-на-Дону',
  'Ростов-на-Дону': 'г.Ростов-на-Дону',
  'г. Черноголовка': 'Черноголовка',
  'г. Химки': 'Химкинский район',
  'Чеховский  район': 'Чеховский район',
  'Чеховский раон': 'Чеховский район',
  'г. Чайковский': 'Чайковский',
  'г. Щёлково': 'Щёлковский район',
  'г. Покров': 'г.Покров',
  'г. Дорогобуж': 'г.Дорогобуж',
}

function resolveCoords(region: string, district: string): [number, number] | null {
  const geo = geocodes.value
  const nd = DISTRICT_NORM[district] || district
  // Try region+district first (most precise)
  if (nd) {
    const key = `${region}|${nd}`
    if (geo[key]) return geo[key]
  }
  // Fallback to region only
  return geo[region] || null
}

// Build garden data from catalog
interface GardenPin {
  name: string
  region: string
  district: string
  count: number
  coords: [number, number]
  genera: string[]
}

const gardens = computed<GardenPin[]>(() => {
  if (!catalog.isLoaded || !geocodesLoaded.value) return []
  const map = new Map<string, { region: string; district: string; count: number; genera: Set<string>; displayName: string }>()
  for (const p of catalog.catalog) {
    const g = p.garden_display
    if (!g) continue
    const region = p.region_normalized || ''
    const district = p.region_district || ''
    // "Частные сады" — split by region+district, each becomes separate pin
    const isPrivate = g === 'Частные сады' || g === 'Частный сад'
    const key = isPrivate ? `Частный сад|${region}|${district}` : g
    if (!map.has(key)) map.set(key, { region, district, count: 0, genera: new Set(), displayName: isPrivate ? 'Частный сад' : g })
    const entry = map.get(key)!
    entry.count++
    if (p.genus_ru) entry.genera.add(p.genus_ru)
  }
  const pins: GardenPin[] = []
  for (const [key, data] of map) {
    const coords = resolveCoords(data.region, data.district)
    if (!coords) continue
    const jitter = (s: string) => { let h = 0; for (const c of s) h = ((h << 5) - h + c.charCodeAt(0)) | 0; return (h % 100) / 500 }
    pins.push({
      name: data.displayName || key,
      region: data.region,
      district: data.district,
      count: data.count,
      coords: [coords[0] + jitter(key), coords[1] + jitter(key + 'x')],
      genera: [...data.genera].slice(0, 5),
    })
  }
  return pins
})

// Search
const searchQuery = ref('')
const searchFocused = ref(false)
const searchRef = ref<HTMLElement>()

const searchResults = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q || q.length < 2) return []
  return gardens.value
    .filter(g => {
      const loc = g.district ? `${g.district} ${g.region}` : g.region
      return g.name.toLowerCase().includes(q) || loc.toLowerCase().includes(q)
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
})

function selectGarden(g: GardenPin) {
  searchQuery.value = ''
  // Don't set searchFocused=false — input stays focused, dropdown hides because query is empty
  const marker = markerMap.get(g)
  if (marker && leafletMap) {
    leafletMap.flyTo(g.coords, 9, { duration: 0.8 })
    setTimeout(() => marker.openPopup(), 850)
  }
}

// Close dropdown on outside click
onMounted(() => {
  document.addEventListener('click', (e) => {
    if (searchRef.value && !searchRef.value.contains(e.target as Node)) {
      searchFocused.value = false
    }
  })
})

// Init map
const mapRef = ref<HTMLElement>()
let leafletMap: any = null
const markerMap = new Map<GardenPin, any>()

async function initMap() {
  if (!mapRef.value || leafletMap) return
  const L = (window as any).L
  if (!L) return

  leafletMap = L.map(mapRef.value, {
    center: [58, 65],
    zoom: 4,
    minZoom: 3,
    maxZoom: 12,
    zoomControl: true,
    attributionControl: false,
    worldCopyJump: false,
    maxBounds: [[-10, -30], [85, 200]],
    maxBoundsViscosity: 0.8,
  })

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 12,
    noWrap: true,
  }).addTo(leafletMap)

  addMarkers()
}

function addMarkers() {
  if (!leafletMap || !gardens.value.length) return
  const L = (window as any).L
  if (!L) return

  // Clear old markers
  markerMap.forEach(m => m.remove())
  markerMap.clear()

  const icon = L.divIcon({ className: 'garden-marker', iconSize: [14, 14], iconAnchor: [7, 7], popupAnchor: [0, -10] })
  const bigIcon = L.divIcon({ className: 'garden-marker garden-marker-big', iconSize: [20, 20], iconAnchor: [10, 10], popupAnchor: [0, -12] })

  for (const g of gardens.value) {
    const marker = L.marker(g.coords, { icon: g.count > 50 ? bigIcon : icon }).addTo(leafletMap)
    const location = g.district ? `${g.district}, ${g.region}` : g.region
    marker.bindPopup(`
      <div style="min-width:180px">
        <strong style="font-size:14px">${g.name}</strong><br>
        <span style="font-size:12px;color:#666">${location}</span><br>
        <span style="font-size:13px;font-weight:600;color:#1a5632">${g.count} растений</span><br>
        <span style="font-size:11px;color:#999">${g.genera.join(', ')}</span><br>
        <a href="/garden/${encodeURIComponent(g.name)}" style="font-size:12px;color:#1a5632;font-weight:600;margin-top:6px;display:inline-block">Открыть сад →</a>
      </div>
    `, { closeButton: false })
    markerMap.set(g, marker)
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
  if (gardens.value.length && (window as any).L) {
    if (!leafletMap) initMap()
    else addMarkers()
  }
})
</script>

<template>
  <div class="map-page">
    <div class="map-header container">
      <BreadCrumbs :items="[{ label: 'Главная', to: '/' }, { label: 'Карта садов' }]" />
      <div class="map-title-row">
        <div>
          <h1>Карта садов</h1>
          <p class="map-subtitle">{{ gardens.length }} садов по всей России</p>
        </div>
        <div ref="searchRef" class="map-search">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Найти сад или регион..."
            class="map-search-input"
            @focus="searchFocused = true"
          >
          <div v-if="searchFocused && searchResults.length" class="map-search-dropdown">
            <button
              v-for="g in searchResults"
              :key="g.name + g.region + g.district"
              class="map-search-item"
              @mousedown.prevent="selectGarden(g)"
            >
              <span class="map-search-name">{{ g.name }}</span>
              <span class="map-search-meta">{{ g.district ? `${g.district}, ${g.region}` : g.region }} &middot; {{ g.count }}</span>
            </button>
          </div>
        </div>
      </div>
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

.map-title-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }

.map-search { position: relative; flex-shrink: 0; }
.map-search-input {
  width: 220px;
  padding: 8px 12px;
  border: 1.5px solid var(--border, #ddd);
  border-radius: 10px;
  font-size: 13px;
  background: var(--bg, #fff);
  outline: none;
  transition: border-color 0.2s;
}
.map-search-input:focus { border-color: #1a5632; }
.map-search-input::placeholder { color: var(--text-muted, #999); }

.map-search-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  width: 300px;
  max-height: 320px;
  overflow-y: auto;
  background: var(--bg, #fff);
  border: 1px solid var(--border, #ddd);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  z-index: 1000;
  padding: 4px;
}
.map-search-item {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
  border-radius: 8px;
  transition: background 0.15s;
}
.map-search-item:hover { background: var(--bg-hover, #f5f5f5); }
.map-search-name { font-size: 13px; font-weight: 600; color: var(--text, #333); }
.map-search-meta { font-size: 11px; color: var(--text-muted, #999); margin-top: 1px; }

@media (min-width: 768px) {
  .map-header { padding: 20px 24px 14px; }
  .map-header h1 { font-size: 28px; }
  .map-search-input { width: 260px; }
}

@media (max-width: 520px) {
  .map-title-row { flex-direction: column; }
  .map-search { width: 100%; }
  .map-search-input { width: 100%; }
  .map-search-dropdown { width: 100%; right: auto; left: 0; }
}
</style>
