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
const gardenCoords = ref<Record<string, [number, number]>>({})
const geocodesLoaded = ref(false)

onMounted(async () => {
  try {
    const [geo, gardensData] = await Promise.all([
      $fetch<Record<string, [number, number]>>('/api/geocodes'),
      $fetch<{ gardens: Record<string, any> }>('/api/gardens'),
    ])
    geocodes.value = geo || {}
    // Extract per-garden coordinates
    const gc: Record<string, [number, number]> = {}
    for (const [name, profile] of Object.entries(gardensData?.gardens || {})) {
      if (profile.coords && Array.isArray(profile.coords) && profile.coords.length === 2) {
        gc[name] = profile.coords
      }
    }
    gardenCoords.value = gc
  } catch {}
  geocodesLoaded.value = true
})

// Resolve coordinates from raw region string (direct geocode match)
function resolveCoords(rawRegion: string): [number, number] | null {
  const geo = geocodes.value
  if (!rawRegion) return null
  // Direct match on raw region text (most precise)
  if (geo[rawRegion]) return geo[rawRegion]
  // Fallback: try trimmed version
  const trimmed = rawRegion.trim().replace(/,?\s*$/, '')
  if (geo[trimmed]) return geo[trimmed]
  return null
}

// Build garden data from catalog
interface GardenPin {
  name: string
  region: string
  district: string
  count: number
  coords: [number, number]
  genera: string[]
  hasExactCoords: boolean
}

// Deterministic hash for jitter
function hashStr(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

const gardens = computed<GardenPin[]>(() => {
  if (!catalog.isLoaded || !geocodesLoaded.value) return []
  const map = new Map<string, { rawRegion: string; region: string; district: string; count: number; genera: Set<string>; displayName: string }>()
  for (const p of catalog.catalog) {
    const g = p.garden_display
    if (!g) continue
    const rawRegion = p.region || ''
    const region = p.region_normalized || ''
    const district = p.region_district || ''
    // "Частные сады" — split by raw region, each becomes separate pin
    const isPrivate = g === 'Частные сады' || g === 'Частный сад'
    const key = isPrivate ? `Частный сад|${rawRegion}` : g
    if (!map.has(key)) map.set(key, { rawRegion, region, district, count: 0, genera: new Set(), displayName: isPrivate ? 'Частный сад' : g })
    const entry = map.get(key)!
    entry.count++
    if (p.genus_ru) entry.genera.add(p.genus_ru)
  }

  // Group pins by base coordinate to apply circular spread
  const byCoord = new Map<string, string[]>()  // "lat,lon" → [key1, key2, ...]
  const pinData = new Map<string, { data: typeof map extends Map<string, infer V> ? V : never; baseCoords: [number, number]; hasExact: boolean }>()

  for (const [key, data] of map) {
    // Check for per-garden exact coordinates first
    const exactCoords = gardenCoords.value[data.displayName]
    if (exactCoords) {
      pinData.set(key, { data, baseCoords: exactCoords, hasExact: true })
      continue
    }
    // Resolve by raw region text (geocoded directly from channel posts)
    const coords = resolveCoords(data.rawRegion)
    if (!coords) continue
    pinData.set(key, { data, baseCoords: coords, hasExact: false })
    const coordKey = `${coords[0].toFixed(4)},${coords[1].toFixed(4)}`
    if (!byCoord.has(coordKey)) byCoord.set(coordKey, [])
    byCoord.get(coordKey)!.push(key)
  }

  const pins: GardenPin[] = []
  for (const [key, info] of pinData) {
    let finalCoords: [number, number]

    if (info.hasExact) {
      finalCoords = info.baseCoords
    } else {
      const coordKey = `${info.baseCoords[0].toFixed(4)},${info.baseCoords[1].toFixed(4)}`
      const group = byCoord.get(coordKey) || [key]
      const idx = group.indexOf(key)
      const total = group.length

      if (total <= 1) {
        // Single garden at this location — slight hash-based offset
        const h = hashStr(key)
        finalCoords = [
          info.baseCoords[0] + ((h % 100) - 50) / 1000,
          info.baseCoords[1] + (((h >> 8) % 100) - 50) / 1000,
        ]
      } else {
        // Multiple gardens — spread in a circle (radius ~0.08° ≈ 8km)
        const angle = (2 * Math.PI * idx) / total + hashStr(key) * 0.01
        const radius = 0.06 + (total > 5 ? 0.03 : 0)
        finalCoords = [
          info.baseCoords[0] + Math.cos(angle) * radius,
          info.baseCoords[1] + Math.sin(angle) * radius * 1.5, // lon correction for latitude
        ]
      }
    }

    pins.push({
      name: info.data.displayName || key,
      region: info.data.region,
      district: info.data.district,
      count: info.data.count,
      coords: finalCoords,
      genera: [...info.data.genera].slice(0, 5),
      hasExactCoords: info.hasExact,
    })
  }
  return pins
})

// Unique named gardens count (excluding private garden splits)
const gardenCount = computed(() => {
  if (!catalog.isLoaded) return 0
  const names = new Set<string>()
  for (const p of catalog.catalog) {
    if (p.garden_display) names.add(p.garden_display)
  }
  return names.size
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

// Tree SVG icon for markers
function treeSvg(size: number, fill: string): string {
  return `<svg viewBox="0 0 20 28" width="${size}" height="${Math.round(size * 1.4)}" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 1 L5.5 9 L7.5 9 L3.5 16 L6.5 16 L1.5 24 L8.5 24 L8.5 27 L11.5 27 L11.5 24 L18.5 24 L13.5 16 L16.5 16 L12.5 9 L14.5 9 Z" fill="${fill}" stroke="#fff" stroke-width="0.8" stroke-linejoin="round"/>
  </svg>`
}

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

  for (const g of gardens.value) {
    const isBig = g.count > 50
    const size = isBig ? 20 : 14
    const fill = isBig ? '#2e7d32' : '#1a5632'
    const icon = L.divIcon({
      className: 'tree-marker',
      html: treeSvg(size, fill),
      iconSize: [size, Math.round(size * 1.4)],
      iconAnchor: [size / 2, Math.round(size * 1.4)],
      popupAnchor: [0, -Math.round(size * 1.4) + 4],
    })

    const marker = L.marker(g.coords, { icon }).addTo(leafletMap)
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
          <p class="map-subtitle">{{ gardenCount }} садов по всей России</p>
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
/* Global styles for Leaflet tree markers */
.tree-marker {
  background: none !important;
  border: none !important;
  box-shadow: none !important;
  display: flex;
  align-items: center;
  justify-content: center;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
  transition: transform 0.15s ease;
}
.tree-marker:hover {
  transform: scale(1.3);
  filter: drop-shadow(0 3px 6px rgba(0,0,0,0.4));
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
