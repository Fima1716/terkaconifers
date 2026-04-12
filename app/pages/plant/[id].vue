<script setup lang="ts">
import { photoUrl, thumbWebpUrl } from '~/utils/photoUrl'
import { useCatalogStore } from '~/stores/catalog'
import { useFavoritesStore } from '~/stores/favorites'
import { useAuthStore } from '~/stores/auth'

const route = useRoute()
const catalog = useCatalogStore()
const favorites = useFavoritesStore()
const auth = useAuthStore()

onMounted(() => {
  if (!catalog.isLoaded) catalog.loadCatalog()
  auth.fetchMe()
})

const showEditDrawer = ref(false)
async function onPlantSaved() {
  showEditDrawer.value = false
  // Force reload catalog with cache-busting to bypass max-age=600
  catalog.$patch({ isLoaded: false })
  await catalog.loadCatalog(true)
}

// Quick MAX post editor (superadmin only)
const showMaxEditor = ref(false)
const maxText = ref('')
const maxLoading = ref(false)
const maxSaving = ref(false)
const maxResult = ref<{ ok: boolean; maxEdited: boolean; hasMid: boolean } | null>(null)

async function openMaxEditor() {
  maxLoading.value = true
  maxResult.value = null
  showMaxEditor.value = true
  try {
    const data = await $fetch<{ text: string }>(`/api/admin/max-text/${plantId.value}`)
    maxText.value = data.text
  } catch {
    maxText.value = ''
  }
  maxLoading.value = false
}

async function saveMaxText() {
  maxSaving.value = true
  maxResult.value = null
  try {
    const data = await $fetch<{ ok: boolean; maxEdited: boolean; hasMid: boolean }>(`/api/admin/max-text/${plantId.value}`, {
      method: 'PUT',
      body: { text: maxText.value },
    })
    maxResult.value = data
    if (data.ok) {
      catalog.$patch({ isLoaded: false })
      await catalog.loadCatalog(true)
      setTimeout(() => { showMaxEditor.value = false }, 1500)
    }
  } catch (e: any) {
    maxResult.value = { ok: false, maxEdited: false, hasMid: false }
  }
  maxSaving.value = false
}

const plantId = computed(() => parseInt(String(route.params.id)))
const plant = computed(() => catalog.getPlantById(plantId.value))
const relatedPlants = computed(() => plant.value ? catalog.getRelatedPlants(plant.value) : [])
const sameCultivarPlants = computed(() => plant.value ? catalog.getSameCultivarPlants(plant.value) : [])

// Garden + per-plant buy links
const gardenProfiles = ref<Record<string, any>>({})
const plantBuyLinks = ref<Record<string, string>>({})
onMounted(async () => {
  try {
    const data = await $fetch<any>('/api/gardens')
    gardenProfiles.value = data.gardens || {}
    plantBuyLinks.value = data.plantBuyLinks || {}
  } catch {}
})
const buyLink = computed(() => {
  if (!plant.value) return ''
  // Per-plant override first
  const plantLink = plantBuyLinks.value[String(plant.value.id)]
  if (plantLink) return plantLink
  // Then garden-level
  if (!plant.value.garden_display) return ''
  return gardenProfiles.value[plant.value.garden_display]?.buyLink || ''
})

const currentPhotoIdx = ref(0)
const currentPhoto = computed(() => plant.value?.photos[currentPhotoIdx.value] || '')

function prevPhoto() {
  if (!plant.value) return
  currentPhotoIdx.value = (currentPhotoIdx.value - 1 + plant.value.photos.length) % plant.value.photos.length
}

function nextPhoto() {
  if (!plant.value) return
  currentPhotoIdx.value = (currentPhotoIdx.value + 1) % plant.value.photos.length
}

// Touch swipe for gallery
const galRef = ref<HTMLElement>()
let touchStartX = 0
let touchStartY = 0

function onTouchStart(e: TouchEvent) {
  touchStartX = e.touches[0].clientX
  touchStartY = e.touches[0].clientY
}

function onTouchEnd(e: TouchEvent) {
  const dx = touchStartX - e.changedTouches[0].clientX
  const dy = Math.abs(touchStartY - e.changedTouches[0].clientY)
  if (Math.abs(dx) > 50 && dy < 100) {
    if (dx > 0) nextPhoto()
    else prevPhoto()
  }
}

useHead({
  title: computed(() => plant.value ? `${plant.value.latin_full} — Территория Хвойных` : 'Растение не найдено'),
})

const config = useRuntimeConfig()

const seoDescription = computed(() => {
  const p = plant.value
  if (!p) return ''
  const parts = [p.species_ru, p.cultivar ? `сорт '${p.cultivar}'` : ''].filter(Boolean)
  const details = [p.garden_display, p.region_normalized, p.age_display].filter(Boolean).join(', ')
  return `${parts.join(' — ')}. ${details ? details + '.' : ''} Фото из частной коллекции. Каталог хвойных растений России.`
})

useSeoMeta({
  description: seoDescription,
  ogTitle: computed(() => plant.value?.latin_full || ''),
  ogDescription: seoDescription,
  ogImage: computed(() => {
    const p = plant.value
    if (!p?.photos[0]) return ''
    return `${config.public.siteUrl}/photos/${p.photos[0].replace('photos/', '')}`
  }),
  ogType: 'website',
})

// Schema.org structured data
if (plant.value) {
  useSchemaOrg([
    defineWebPage({
      '@type': 'ItemPage',
      name: plant.value.latin_full,
      description: seoDescription.value,
    }),
    {
      '@type': 'Product',
      name: plant.value.latin_full,
      description: seoDescription.value,
      image: plant.value.photos[0] ? `${config.public.siteUrl}/photos/${plant.value.photos[0].replace('photos/', '')}` : undefined,
      category: plant.value.genus_ru,
      brand: { '@type': 'Brand', name: plant.value.garden_display || 'Территория Хвойных' },
    },
  ])
}

const galleryLoaded = ref(false)
const fullLoaded = ref(false)
const lightboxOpen = ref(false)

// Show thumb immediately (cached from catalog), swap to full-size when ready
const galleryThumb = computed(() => plant.value?.thumbs[currentPhotoIdx.value] || '')
const gallerySrc = computed(() => fullLoaded.value ? photoUrl(currentPhoto.value) : photoUrl(galleryThumb.value))

watch(currentPhoto, () => {
  galleryLoaded.value = false
  fullLoaded.value = false
  // Preload full-size in background
  if (currentPhoto.value && !currentPhoto.value.startsWith('http')) {
    const img = new Image()
    img.onload = () => { fullLoaded.value = true }
    img.src = photoUrl(currentPhoto.value)
  }
})

// Preload first full-size photo on mount
onMounted(() => {
  if (currentPhoto.value) {
    const img = new Image()
    img.onload = () => { fullLoaded.value = true }
    img.src = photoUrl(currentPhoto.value)
  }
})

function onGalleryLoad() { galleryLoaded.value = true }

function openLightbox() { lightboxOpen.value = true }
function closeLightbox() { lightboxOpen.value = false }

let lbTouchStartX = 0
function onLbTouchStart(e: TouchEvent) { lbTouchStartX = e.touches[0].clientX }
function onLbTouchEnd(e: TouchEvent) {
  const dx = lbTouchStartX - e.changedTouches[0].clientX
  if (Math.abs(dx) > 50) { dx > 0 ? nextPhoto() : prevPhoto() }
}

const shareToast = ref('')

async function sharePlant() {
  const url = window.location.href
  const title = plant.value?.latin_full || ''

  if (navigator.share) {
    try {
      await navigator.share({ title, url })
      return
    } catch {}
  }

  await navigator.clipboard.writeText(url)
  shareToast.value = 'Ссылка скопирована!'
  setTimeout(() => shareToast.value = '', 2000)
}
</script>

<template>
  <div v-if="plant" class="plant-page container">
    <!-- Back + Breadcrumbs -->
    <div class="nav-row">
      <NuxtLink :to="catalog.lastCatalogUrl" class="back-link">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><path d="M15 18l-6-6 6-6"/></svg>
        Назад в каталог
      </NuxtLink>
      <nav class="breadcrumbs">
        <NuxtLink to="/">Главная</NuxtLink>
        <span class="sep">/</span>
        <NuxtLink :to="catalog.lastCatalogUrl">Каталог</NuxtLink>
        <span class="sep">/</span>
        <NuxtLink :to="`/catalog?genus=${plant.genus}`">{{ plant.genus_ru }}</NuxtLink>
        <span class="sep">/</span>
        <span>{{ plant.cultivar || plant.latin_full }}</span>
      </nav>
    </div>

    <div class="plant-layout">
      <!-- Gallery -->
      <div class="gallery">
        <div class="gallery-main" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd" @click="openLightbox">
          <div v-if="!galleryLoaded" class="gallery-skeleton skeleton-shimmer" />
          <img
            :src="gallerySrc"
            :alt="plant.latin_full"
            draggable="false"
            decoding="async"
            width="600"
            height="800"
            :class="{ 'gallery-reveal': galleryLoaded }"
            :style="galleryLoaded ? undefined : { opacity: 0, position: 'absolute' }"
            @load="onGalleryLoad"
          >
          <button class="gal-zoom" @click.stop="openLightbox">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
          </button>
          <template v-if="plant.photos.length > 1">
            <button class="gal-nav prev" @click.stop="prevPhoto">&lsaquo;</button>
            <button class="gal-nav next" @click.stop="nextPhoto">&rsaquo;</button>
            <div class="gal-counter">{{ currentPhotoIdx + 1 }} / {{ plant.photos.length }}</div>
          </template>
        </div>
        <div v-if="plant.thumbs.length > 1" class="gallery-thumbs">
          <button
            v-for="(thumb, i) in plant.thumbs"
            :key="i"
            class="thumb"
            :class="{ active: i === currentPhotoIdx }"
            @click="currentPhotoIdx = i"
          >
            <img :src="thumbWebpUrl(thumb)" :alt="`Фото ${i + 1}`">
          </button>
        </div>
      </div>

      <!-- Info -->
      <div class="plant-info">
        <h1 class="plant-latin">{{ plant.latin_full }}</h1>
        <p v-if="plant.species_ru" class="plant-ru">
          {{ plant.species_ru }}<template v-if="plant.cultivar_ru"> '{{ plant.cultivar_ru }}'</template>
        </p>

        <!-- Tags -->
        <div class="plant-tags">
          <!-- color tag temporarily hidden -->
          <span v-if="false" class="ptag ptag-color">{{ plant.color_ru }}</span>
          <span v-if="plant.is_russian_enriched" class="ptag ptag-ru">Российский сорт</span>
        </div>

        <!-- Growing conditions -->
        <GrowingConditionsBadges
          v-if="plant.conditions && Object.keys(plant.conditions).length"
          :conditions="plant.conditions"
          class="growing-conditions-section"
        />

        <!-- Action buttons -->
        <div class="action-buttons">
        <button
          class="fav-btn-detail"
          :class="{ active: favorites.isFavorite(plant.id) }"
          @click="favorites.toggle(plant.id)"
        >
          <svg viewBox="0 0 24 24" :fill="favorites.isFavorite(plant.id) ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" width="20" height="20">
            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
          </svg>
          {{ favorites.isFavorite(plant.id) ? 'В избранном' : 'В избранное' }}
        </button>

        <!-- Share button -->
        <button class="share-btn-detail" @click="sharePlant">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
          </svg>
          Поделиться
          <Transition name="fade">
            <span v-if="shareToast" class="share-toast">{{ shareToast }}</span>
          </Transition>
        </button>

        <!-- Edit button (for admins) -->
        <button v-if="auth.canEditPlant" class="edit-btn-detail" @click="showEditDrawer = true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
          Редактировать
        </button>

        <!-- Quick MAX post editor (superadmin only) -->
        <button v-if="auth.isSuperAdmin" class="max-edit-btn" @click="openMaxEditor">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
          Пост в MAX
        </button>
        </div>

        <!-- Details table -->
        <div class="details-table">
          <div v-if="plant.genus_ru" class="detail-row">
            <span class="detail-label">Род</span>
            <span class="detail-value">{{ plant.genus_ru }} ({{ plant.genus }})</span>
          </div>
          <div v-if="plant.species" class="detail-row">
            <span class="detail-label">Вид</span>
            <span class="detail-value">{{ plant.species_ru }}</span>
          </div>
          <div v-if="plant.cultivar" class="detail-row">
            <span class="detail-label">Сорт</span>
            <span class="detail-value">
              <NuxtLink v-if="sameCultivarPlants.length > 0" :to="`/catalog?cultivar=${encodeURIComponent(plant.cultivar + '||' + plant.species_full)}`" class="cultivar-link">
                '{{ plant.cultivar }}'
                <span class="cultivar-count">{{ sameCultivarPlants.length + 1 }} в каталоге</span>
              </NuxtLink>
              <template v-else>'{{ plant.cultivar }}'</template>
            </span>
          </div>
          <div v-if="plant.region_normalized" class="detail-row">
            <span class="detail-label">Регион</span>
            <span class="detail-value">{{ plant.region_normalized }}{{ plant.region_district ? `, ${plant.region_district}` : '' }}</span>
          </div>
          <div v-if="plant.age_display" class="detail-row">
            <span class="detail-label">Возраст</span>
            <span class="detail-value">{{ plant.age_display }}</span>
          </div>
          <div v-if="plant.size_display" class="detail-row">
            <span class="detail-label">Размер</span>
            <span class="detail-value">{{ plant.size_display }}</span>
          </div>
          <div v-if="plant.originator" class="detail-row">
            <span class="detail-label">Оригинатор</span>
            <span class="detail-value">{{ plant.originator }}</span>
          </div>
          <div v-if="plant.garden_display" class="detail-row">
            <span class="detail-label">Источник</span>
            <span class="detail-value">
              <NuxtLink :to="`/garden/${encodeURIComponent(plant.garden_display)}`" class="garden-link">
                {{ plant.garden_display }}
              </NuxtLink>
              <span class="source-type">({{ plant.garden_type_ru }})</span>
            </span>
          </div>
          <div v-if="plant.date" class="detail-row">
            <span class="detail-label">Дата</span>
            <span class="detail-value">{{ plant.date }}</span>
          </div>
        </div>

        <!-- MAX link -->
        <a v-if="plant.max_url" :href="plant.max_url" target="_blank" rel="noopener" class="max-link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          Смотреть в MAX
        </a>

        <!-- Buy button (configured per garden) -->
        <a v-if="buyLink" :href="buyLink" target="_blank" rel="noopener" class="btn-buy-rusinov">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <path d="M16 10a4 4 0 01-8 0"/>
          </svg>
          Купить этот сорт
        </a>
      </div>
    </div>

    <!-- Growth diary -->
    <section class="growth-section">
      <h2 class="section-title">Дневник роста</h2>
      <GrowthTimeline :plant-id="plantId" :garden-display="plant?.garden_display" />
    </section>

    <!-- Same cultivar in different gardens -->
    <section v-if="sameCultivarPlants.length > 0" class="related cultivar-variants">
      <h2 class="section-title">
        '{{ plant.cultivar }}' в других садах
        <span class="variant-count">{{ sameCultivarPlants.length }}</span>
      </h2>
      <PlantGrid :plants="sameCultivarPlants" />
    </section>

    <!-- Related -->
    <section v-if="relatedPlants.length > 0" class="related">
      <h2 class="section-title">Похожие растения</h2>
      <PlantGrid :plants="relatedPlants" />
    </section>

    <!-- Fullscreen lightbox -->
    <Teleport to="body">
      <Transition name="lb">
        <div v-if="lightboxOpen" class="lightbox" @click="closeLightbox" @touchstart.passive="onLbTouchStart" @touchend.passive="onLbTouchEnd">
          <img :src="photoUrl(currentPhoto)" :alt="plant.latin_full" class="lb-img" @click.stop>
          <button class="lb-close" @click="closeLightbox">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <template v-if="plant.photos.length > 1">
            <button class="lb-nav lb-prev" @click.stop="prevPhoto">&lsaquo;</button>
            <button class="lb-nav lb-next" @click.stop="nextPhoto">&rsaquo;</button>
            <div class="lb-counter">{{ currentPhotoIdx + 1 }} / {{ plant.photos.length }}</div>
          </template>
        </div>
      </Transition>
    </Teleport>

    <!-- Edit drawer -->
    <PlantEditDrawer v-if="showEditDrawer" :plant="plant" @close="showEditDrawer = false" @saved="onPlantSaved" />

    <!-- Quick MAX post editor modal -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showMaxEditor" class="max-overlay" @click.self="showMaxEditor = false">
          <div class="max-modal">
            <div class="max-header">
              <h3>Текст поста в MAX</h3>
              <button class="max-close" @click="showMaxEditor = false">&times;</button>
            </div>
            <div v-if="maxLoading" class="max-body" style="text-align:center;padding:40px;color:var(--text-muted)">Загрузка...</div>
            <div v-else class="max-body">
              <textarea v-model="maxText" class="max-textarea" rows="14" />
              <div v-if="maxResult" class="max-result" :class="{ ok: maxResult.ok }">
                <template v-if="maxResult.ok && maxResult.maxEdited">Пост обновлён в MAX и на сайте</template>
                <template v-else-if="maxResult.ok && !maxResult.hasMid">Сохранено на сайте (нет mid для MAX)</template>
                <template v-else-if="maxResult.ok">Сохранено на сайте, MAX не обновлён</template>
                <template v-else>Ошибка при сохранении</template>
              </div>
              <button class="max-save" :disabled="maxSaving" @click="saveMaxText">
                {{ maxSaving ? 'Сохранение...' : 'Сохранить' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>

  <div v-else class="container not-found">
    <h1>Растение не найдено</h1>
    <NuxtLink to="/catalog">Вернуться в каталог</NuxtLink>
  </div>
</template>

<style scoped>
.plant-page {
  padding-top: 16px;
  padding-bottom: 48px;
}

@media (min-width: 768px) { .plant-page { padding-top: 24px; } }

.nav-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}
@media (min-width: 768px) { .nav-row { margin-bottom: 20px; } }

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 500;
  color: var(--primary);
  white-space: nowrap;
  transition: opacity 0.15s;
}
.back-link:hover { opacity: 0.7; }

.breadcrumbs {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 0;
  overflow-x: auto;
  white-space: nowrap;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.breadcrumbs::-webkit-scrollbar { display: none; }

@media (min-width: 768px) { .breadcrumbs { font-size: 13px; } }

.breadcrumbs a { color: var(--text-secondary); }
.breadcrumbs a:hover { color: var(--primary); }
.sep { margin: 0 6px; color: var(--border); }

/* Layout */
.plant-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 32px;
}

@media (min-width: 768px) {
  .plant-layout {
    grid-template-columns: 1fr 1fr;
    gap: 40px;
  }
}

/* Gallery */
.gallery-main {
  position: relative;
  aspect-ratio: 3/4;
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--bg-alt);
  cursor: zoom-in;
}

@media (min-width: 768px) {
  .gallery-main { aspect-ratio: 1; }
}

.gal-zoom {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text);
  box-shadow: var(--shadow);
  cursor: pointer;
  z-index: 2;
}

.gallery-skeleton {
  position: absolute;
  inset: 0;
  z-index: 1;
  border-radius: var(--radius);
}

.gallery-main img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.gallery-main img.gallery-reveal {
  animation: gallery-fade-in 0.3s ease-out both;
}

@keyframes gallery-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.gal-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  border: none;
  font-size: 20px;
  color: var(--text);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow);
}

.gal-nav.prev { left: 8px; }
.gal-nav.next { right: 8px; }

.gal-counter {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 10px;
}

.gallery-thumbs {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  overflow-x: auto;
}

.thumb {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-xs);
  overflow: hidden;
  border: 2px solid transparent;
  padding: 0;
  background: none;
  flex-shrink: 0;
  transition: border-color 0.15s;
}

.thumb.active { border-color: var(--primary); }

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Info */
.plant-latin {
  font-size: 22px;
  font-weight: 700;
  font-style: italic;
  color: var(--primary);
  line-height: 1.3;
}

.plant-ru {
  font-size: 15px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.plant-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.ptag {
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 12px;
}

.ptag-form { background: #e8f5e9; color: #2e7d32; }
.ptag-color { background: #e3f2fd; color: #1565c0; }
.ptag-ru { background: #fce4ec; color: #c62828; }
.ptag-hardy { background: #f3e5f5; color: #6a1b9a; }

/* Growing conditions badges */
.growing-conditions-section {
  margin-top: 16px;
}

/* Price */
.price-block {
  margin-top: 20px;
  padding: 16px;
  background: var(--bg-alt);
  border-radius: var(--radius);
}

.price-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 12px;
}

.current-price {
  font-size: 24px;
  font-weight: 800;
  color: var(--primary);
}

.current-price.no-price {
  font-size: 16px;
  font-weight: 500;
  color: var(--text-muted);
}

.old-price {
  font-size: 16px;
  color: var(--text-muted);
  text-decoration: line-through;
}

.cart-row {
  display: flex;
  gap: 10px;
  align-items: center;
}

.qty-control {
  display: flex;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
}

.qty-control button {
  width: 36px;
  height: 36px;
  background: none;
  border: none;
  font-size: 16px;
  color: var(--text);
}

.qty-control span {
  width: 36px;
  text-align: center;
  font-size: 14px;
  font-weight: 600;
}

.btn-buy-rusinov {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  width: 100%; padding: 14px 20px; margin-top: 12px;
  background: var(--primary); color: #fff; border-radius: var(--radius-sm);
  font-size: 15px; font-weight: 700; transition: all 0.15s;
  text-decoration: none;
}
.btn-buy-rusinov:hover { background: var(--primary-dark); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(26,86,50,0.25); }

.btn-cart {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 44px;
  background: var(--primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  font-weight: 700;
  font-size: 15px;
  transition: background 0.15s;
}

.btn-cart:hover { background: var(--primary-dark); }

/* Favorite button */
.action-buttons {
  display: flex; gap: 10px; margin-top: 16px; flex-wrap: wrap;
}
@media (max-width: 480px) { .action-buttons { flex-direction: column; } }

.fav-btn-detail {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 12px 24px; min-height: 48px;
  background: var(--bg); border: 1.5px solid var(--border);
  border-radius: var(--radius-sm); font-size: 14px; font-weight: 600;
  color: var(--text-secondary); cursor: pointer; transition: all 0.15s;
}
.fav-btn-detail:hover { border-color: #e53935; color: #e53935; }
.fav-btn-detail.active { border-color: #e53935; color: #e53935; background: #fce4ec; }

.share-btn-detail {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 12px 24px; min-height: 48px;
  background: var(--bg); border: 1.5px solid var(--border);
  border-radius: var(--radius-sm); font-size: 14px; font-weight: 600;
  color: var(--text-secondary); cursor: pointer; transition: all 0.15s;
  position: relative;
}
.share-btn-detail:hover { border-color: var(--primary); color: var(--primary); }

.edit-btn-detail {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 12px 24px; min-height: 48px;
  background: var(--primary); border: none;
  border-radius: var(--radius-sm); font-size: 14px; font-weight: 600;
  color: #fff; cursor: pointer; transition: background 0.15s;
}
.edit-btn-detail:hover { background: var(--primary-dark); }

.max-edit-btn {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 12px 24px; min-height: 48px;
  background: #1976d2; border: none;
  border-radius: var(--radius-sm); font-size: 14px; font-weight: 600;
  color: #fff; cursor: pointer; transition: background 0.15s;
}
.max-edit-btn:hover { background: #1565c0; }

/* MAX editor modal */
.max-overlay {
  position: fixed; inset: 0; z-index: 600;
  background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
}
.max-modal {
  background: var(--bg); border-radius: 16px;
  width: 100%; max-width: 560px; max-height: 90dvh;
  overflow-y: auto; box-shadow: 0 8px 32px rgba(0,0,0,0.2);
}
.max-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px 8px;
}
.max-header h3 { font-size: 18px; font-weight: 700; }
.max-close {
  background: none; border: none; font-size: 28px; line-height: 1;
  color: var(--text-muted); cursor: pointer;
}
.max-body { padding: 0 20px 20px; }
.max-textarea {
  width: 100%; padding: 12px; font-size: 14px; font-family: monospace;
  border: 1.5px solid var(--border); border-radius: 8px;
  background: var(--bg-alt); color: var(--text); resize: vertical;
  line-height: 1.5;
}
.max-textarea:focus { border-color: var(--primary); outline: none; }
.max-save {
  margin-top: 12px; width: 100%; padding: 12px;
  background: #1976d2; color: #fff; border: none;
  border-radius: 10px; font-size: 14px; font-weight: 600;
  cursor: pointer; transition: background 0.15s;
}
.max-save:hover:not(:disabled) { background: #1565c0; }
.max-save:disabled { opacity: 0.5; cursor: not-allowed; }
.max-result {
  margin-top: 8px; padding: 8px 12px; border-radius: 8px;
  font-size: 13px; font-weight: 600;
  background: #ffebee; color: #c62828;
}
.max-result.ok { background: #e8f5e9; color: #2e7d32; }

.share-toast {
  position: absolute;
  top: -32px; left: 50%; transform: translateX(-50%);
  background: var(--primary); color: #fff;
  font-size: 12px; font-weight: 600;
  padding: 4px 12px; border-radius: 8px;
  white-space: nowrap;
  pointer-events: none;
}

/* Details table */
.details-table {
  margin-top: 24px;
}

.detail-row {
  display: flex;
  gap: 8px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-light);
  font-size: 14px;
}

@media (max-width: 480px) {
  .detail-row { flex-direction: column; gap: 2px; }
}

.detail-label {
  width: 100px;
  flex-shrink: 0;
  color: var(--text-muted);
  font-size: 13px;
}

@media (max-width: 480px) {
  .detail-label { width: auto; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; }
}

.detail-value {
  color: var(--text);
}

.source-type {
  color: var(--text-muted);
  font-size: 12px;
}

/* MAX link */
.max-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 20px;
  padding: 10px 16px;
  background: var(--bg-alt);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
  color: var(--primary);
  transition: background 0.15s;
}

.max-link:hover { background: var(--border-light); }

/* Growth diary */
.growth-section {
  margin-top: 48px;
}

/* Related */
.related {
  margin-top: 48px;
}

.variant-count {
  font-size: 12px; font-weight: 700;
  background: var(--primary); color: #fff;
  padding: 2px 8px; border-radius: 10px;
  margin-left: 8px;
}

.cultivar-link, .garden-link {
  color: var(--primary); font-weight: 600;
}
.cultivar-count {
  font-size: 11px; font-weight: 600;
  color: var(--primary); opacity: 0.7;
  margin-left: 6px;
}

.section-title {
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 20px;
}

/* Not found */
.not-found {
  text-align: center;
  padding: 80px 16px;
  color: var(--text-muted);
}

.not-found h1 {
  margin-bottom: 16px;
  color: var(--text);
}

.not-found a {
  color: var(--primary);
  font-weight: 600;
}

@media (min-width: 768px) {
  .plant-latin { font-size: 26px; }
  .current-price { font-size: 28px; }
}

/* ── Lightbox ──────────────────── */
.lightbox {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.lb-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 4px;
  user-select: none;
}

.lb-close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  border: none;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 2;
}

.lb-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  border: none;
  font-size: 28px;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.lb-prev { left: 12px; }
.lb-next { right: 12px; }

.lb-counter {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 14px;
  padding: 6px 16px;
  border-radius: 20px;
}

.lb-enter-active { transition: opacity 0.2s ease; }
.lb-leave-active { transition: opacity 0.15s ease; }
.lb-enter-from, .lb-leave-to { opacity: 0; }

@media (min-width: 768px) {
  .lightbox { padding: 40px; }
  .lb-prev { left: 24px; }
  .lb-next { right: 24px; }
}
</style>
