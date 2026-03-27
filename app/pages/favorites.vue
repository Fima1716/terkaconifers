<script setup lang="ts">
import { useCatalogStore } from '~/stores/catalog'
import { useFavoritesStore } from '~/stores/favorites'

const catalog = useCatalogStore()
const favorites = useFavoritesStore()
const route = useRoute()
const router = useRouter()

onMounted(() => { if (!catalog.isLoaded) catalog.loadCatalog() })

// Shared mode: someone opened a link with ?ids=
const sharedIds = computed(() => {
  const raw = route.query.ids
  if (!raw) return null
  return String(raw).split(',').map(Number).filter(n => n > 0)
})

const isSharedMode = computed(() => sharedIds.value !== null)

const displayPlants = computed(() => {
  const ids = isSharedMode.value ? sharedIds.value! : favorites.ids
  return ids.map(id => catalog.getPlantById(id)).filter(Boolean) as any[]
})

const shareToast = ref(false)

async function shareCollection() {
  const ids = favorites.ids.join(',')
  const url = `${window.location.origin}/favorites?ids=${ids}`

  if (navigator.share) {
    try {
      await navigator.share({ title: 'Подборка хвойных — ТЕРКА', url })
      return
    } catch {}
  }
  await navigator.clipboard.writeText(url)
  shareToast.value = true
  setTimeout(() => { shareToast.value = false }, 2500)
}

function saveSharedToFavorites() {
  if (!sharedIds.value) return
  for (const id of sharedIds.value) {
    if (!favorites.isFavorite(id)) favorites.toggle(id)
  }
  router.replace('/favorites')
}

useHead({
  title: computed(() => isSharedMode.value
    ? `Подборка растений (${displayPlants.value.length}) — Территория Хвойных`
    : 'Избранное — Территория Хвойных'
  ),
})
</script>

<template>
  <div class="favorites-page container">
    <BreadCrumbs :items="[{ label: 'Главная', to: '/' }, { label: isSharedMode ? 'Подборка' : 'Избранное' }]" />

    <!-- Shared mode header -->
    <template v-if="isSharedMode">
      <h1 class="page-title">
        Подборка растений
        <span class="title-count">{{ displayPlants.length }}</span>
      </h1>
      <div v-if="displayPlants.length > 0" class="share-actions">
        <button class="btn-save-all" @click="saveSharedToFavorites">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
          Сохранить всё к себе
        </button>
      </div>
    </template>

    <!-- Own favorites header -->
    <template v-else>
      <h1 class="page-title">
        Избранное
        <span v-if="favorites.count" class="title-count">{{ favorites.count }}</span>
      </h1>
    </template>

    <!-- Empty state -->
    <div v-if="displayPlants.length === 0" class="empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48" style="color: var(--border); margin-bottom: 16px;">
        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
      </svg>
      <p>{{ isSharedMode ? 'Растения не найдены' : 'В избранном пока пусто' }}</p>
      <p class="empty-hint">{{ isSharedMode ? 'Ссылка может быть устаревшей' : 'Нажмите на сердечко на карточке растения, чтобы добавить его сюда' }}</p>
      <NuxtLink to="/catalog" class="btn-catalog">Перейти в каталог</NuxtLink>
    </div>

    <!-- Plant grid -->
    <template v-if="displayPlants.length > 0">
      <div v-if="!isSharedMode" class="fav-toolbar">
        <button class="btn-share" @click="shareCollection">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          Поделиться подборкой
        </button>
        <button class="btn-clear-fav" @click="favorites.$reset()">Очистить</button>
      </div>
      <PlantGrid :plants="displayPlants" />
    </template>

    <!-- Toast -->
    <Transition name="toast">
      <div v-if="shareToast" class="toast">Ссылка скопирована</div>
    </Transition>
  </div>
</template>

<style scoped>
.favorites-page { padding: 24px 16px 48px; }
.page-title { font-size: 26px; font-weight: 700; margin-bottom: 16px; display: flex; align-items: baseline; gap: 10px; }
.title-count { font-size: 15px; font-weight: 400; color: var(--text-muted); }

.empty { text-align: center; padding: 60px 0; color: var(--text-muted); }
.empty p { font-size: 16px; }
.empty-hint { font-size: 13px; margin-top: 4px; color: var(--text-muted); }
.btn-catalog { display: inline-block; margin-top: 20px; padding: 12px 32px; background: var(--primary); color: #fff; border-radius: var(--radius-sm); font-weight: 600; }

.fav-toolbar {
  display: flex; align-items: center; gap: 12px; margin-bottom: 16px;
}

.btn-share {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 16px;
  background: var(--primary); color: #fff;
  border: none; border-radius: var(--radius-sm);
  font-size: 13px; font-weight: 600; cursor: pointer;
  transition: opacity 0.15s;
}
.btn-share:hover { opacity: 0.85; }

.btn-clear-fav { background: none; border: none; color: var(--text-muted); font-size: 13px; cursor: pointer; }
.btn-clear-fav:hover { color: var(--danger); }

.share-actions { margin-bottom: 20px; }

.btn-save-all {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 10px 20px;
  background: var(--primary); color: #fff;
  border: none; border-radius: var(--radius-sm);
  font-size: 14px; font-weight: 600; cursor: pointer;
  transition: opacity 0.15s;
}
.btn-save-all:hover { opacity: 0.85; }

.toast {
  position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
  background: var(--text); color: var(--bg); padding: 10px 20px;
  border-radius: 8px; font-size: 13px; font-weight: 600;
  z-index: 1000; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}
.toast-enter-active { transition: all 0.3s ease; }
.toast-leave-active { transition: all 0.3s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(10px); }
</style>
