<script setup lang="ts">
import { photoUrl, thumbWebpUrl, thumbMicroUrl, thumbHiresUrl } from '~/utils/photoUrl'
import type { Plant } from '~/stores/catalog'
import { useFavoritesStore } from '~/stores/favorites'

const props = defineProps<{ plant: Plant; eager?: boolean; buyLink?: string }>()
const favorites = useFavoritesStore()

const displayName = computed(() => {
  return props.plant.latin_full
})

const imgLoaded = ref(false)
const hiresLoaded = ref(false)
const hiresSrc = ref('')
const cardEl = ref<HTMLElement>()

function onImgLoad() {
  imgLoaded.value = true
  // After thumb loads, start hi-res upgrade for visible cards
  if (props.plant.thumbs[0] && !props.plant.thumbs[0].startsWith('http')) {
    loadHires()
  }
}

function loadHires() {
  const url = thumbHiresUrl(props.plant.thumbs[0])
  const img = new Image()
  img.onload = () => {
    hiresSrc.value = url
    hiresLoaded.value = true
  }
  img.src = url
}

function toggleFav(e: Event) {
  e.preventDefault()
  e.stopPropagation()
  favorites.toggle(props.plant.id)
}

function formatDate(d: string) {
  const [day, month, year] = d.split('.')
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
  return `${parseInt(day)} ${months[parseInt(month) - 1]} ${year}`
}

const hasBuyLink = computed(() => !!props.buyLink)

const router = useRouter()
function goToGarden(e: Event) {
  e.preventDefault()
  e.stopPropagation()
  if (props.plant.garden_display) {
    router.push(`/garden/${encodeURIComponent(props.plant.garden_display)}`)
  }
}
</script>

<template>
  <NuxtLink :to="`/plant/${plant.id}`" class="plant-card">
    <div class="card-img" ref="cardEl">
      <!-- Layer 1: Micro placeholder (~1KB, blurred) — instant -->
      <img
        v-if="plant.thumbs[0] && !imgLoaded"
        :src="thumbMicroUrl(plant.thumbs[0])"
        :alt="displayName"
        loading="eager"
        decoding="sync"
        class="img-micro"
        width="50"
        height="67"
      >
      <!-- Layer 2: Standard thumb (300px, ~39KB) — fast -->
      <picture v-if="plant.thumbs[0]">
        <source :srcset="thumbWebpUrl(plant.thumbs[0])" type="image/webp">
        <img
          :src="photoUrl(plant.thumbs[0])"
          :alt="displayName"
          :loading="eager ? 'eager' : 'lazy'"
          :decoding="eager ? 'sync' : 'async'"
          :fetchpriority="eager ? 'high' : undefined"
          width="300"
          height="400"
          :class="{ 'img-reveal': imgLoaded && !hiresLoaded }"
          :style="imgLoaded ? undefined : { opacity: 0, position: 'absolute' }"
          @load="onImgLoad"
        >
      </picture>
      <!-- Layer 3: Hi-res (500px, ~80KB) — background upgrade -->
      <img
        v-if="hiresLoaded"
        :src="hiresSrc"
        :alt="displayName"
        class="img-hires"
        width="500"
        height="667"
      >
      <div v-if="!plant.thumbs[0]" class="no-img" />
      <span v-if="plant.photos.length > 1" class="badge-photos">
        {{ plant.photos.length }} фото
      </span>
      <span v-if="plant.is_new" class="badge-new">Новинка</span>
      <span v-if="plant.is_russian_enriched" class="badge-ru" :style="plant.is_new ? { top: '28px' } : {}">RU</span>
      <button class="fav-heart" :class="{ active: favorites.isFavorite(plant.id) }" @click="toggleFav">
        <svg viewBox="0 0 24 24" :fill="favorites.isFavorite(plant.id) ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" width="18" height="18">
          <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
        </svg>
      </button>
    </div>
    <div class="card-body">
      <div class="card-name">{{ displayName }}</div>
      <div class="card-meta">
        <span class="card-species">{{ plant.species_ru || '&nbsp;' }}</span>
        <span v-if="plant.garden_display" class="card-garden card-garden-link" @click="goToGarden">{{ plant.garden_display }}</span>
        <span v-else class="card-garden">&nbsp;</span>
        <span class="card-region">{{ plant.region_normalized || '&nbsp;' }}</span>
        <span class="card-age">{{ plant.age_display || '&nbsp;' }}</span>
        <span v-if="plant.is_new && plant.date" class="card-date">Добавлено {{ formatDate(plant.date) }}</span>
      </div>
      <a
        v-if="hasBuyLink"
        :href="buyLink"
        target="_blank"
        rel="noopener"
        class="btn-buy"
        @click.stop
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13">
          <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>
        </svg>
        Купить
      </a>
    </div>
  </NuxtLink>
</template>

<style scoped>
.plant-card {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  transition: box-shadow 0.2s;
  display: flex;
  flex-direction: column;
  content-visibility: auto;
  contain-intrinsic-size: auto 200px 350px;
  -webkit-tap-highlight-color: transparent;
}

@media (min-width: 1024px) {
  .plant-card:hover { box-shadow: var(--shadow-card-hover); }
}

.card-img {
  position: relative;
  aspect-ratio: 0.85;
  overflow: hidden;
  background: var(--bg-alt);
}

.img-micro {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: blur(12px);
  transform: scale(1.1);
  z-index: 1;
}

.card-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.card-img img.img-reveal {
  animation: img-fade-in 0.3s ease-out both;
  z-index: 2;
  position: relative;
}

.img-hires {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 3;
  animation: img-fade-in 0.25s ease-out both;
}

@keyframes img-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.no-img {
  width: 100%;
  height: 100%;
  background: var(--bg-alt);
}

.badge-photos {
  position: absolute;
  bottom: 6px;
  left: 6px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  z-index: 5;
}

.badge-new {
  position: absolute;
  top: 6px;
  right: 6px;
  background: #ff6d00;
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  z-index: 5;
}

.badge-ru {
  position: absolute;
  top: 6px;
  right: 6px;
  background: rgba(170, 55, 40, 0.85);
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  padding: 2px 5px;
  border-radius: 4px;
  z-index: 5;
}

.badge-form {
  position: absolute;
  top: 6px;
  left: 6px;
  background: rgba(26, 86, 50, 0.85);
  color: #fff;
  font-size: 9px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
}

.card-body {
  padding: 10px 12px 12px;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.card-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.3;
  height: 2.6em; /* exactly 2 lines */
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.card-meta {
  display: flex;
  flex-direction: column;
  margin-top: 4px;
}

.card-meta > span {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.5;
}

.card-species {
  font-size: 11px;
  color: var(--text-secondary);
  font-style: italic;
}

.card-garden {
  font-size: 11px;
  color: var(--primary);
  font-weight: 500;
}
.card-garden-link { cursor: pointer; }
.card-garden-link:hover { text-decoration: underline; }

.card-region {
  font-size: 11px;
  color: var(--text-muted);
}

.fav-heart {
  position: absolute; top: 6px; right: 6px;
  width: 36px; height: 36px; border-radius: 50%;
  background: rgba(255, 255, 255, 0.85); border: none;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-muted); cursor: pointer;
  transition: all 0.15s;
  backdrop-filter: blur(4px);
  z-index: 5;
}
/* Mobile: always visible. Desktop: show on hover */
@media (min-width: 1024px) {
  .fav-heart { opacity: 0; }
  .plant-card:hover .fav-heart { opacity: 1; }
}
.fav-heart.active { opacity: 1; color: #e53935; }
.fav-heart:hover { color: #e53935; transform: scale(1.1); }

.card-age {
  font-size: 11px;
  color: var(--text-muted);
}

.card-date {
  font-size: 10px;
  color: #ff6d00;
  font-weight: 600;
}

.btn-buy {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  width: 100%; margin-top: 8px; padding: 7px 12px;
  font-size: 12px; font-weight: 700; color: #fff;
  background: var(--primary); border: none; border-radius: 8px;
  cursor: pointer; text-decoration: none;
  transition: all 0.15s;
}
.btn-buy:hover { background: var(--primary-dark, #0f3a20); transform: translateY(-1px); }

@media (min-width: 768px) {
  .card-body { padding: 12px 14px 14px; }
  .card-name { font-size: 14px; }
  .card-species, .card-region { font-size: 12px; }
  .badge-photos, .badge-ru, .badge-form { font-size: 11px; padding: 3px 7px; }
  .btn-buy { padding: 8px 14px; font-size: 13px; }
}
</style>
