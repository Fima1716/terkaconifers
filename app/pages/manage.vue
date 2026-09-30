<script setup lang="ts">
import { photoUrl, thumbWebpUrl } from '~/utils/photoUrl'
import { useAuthStore } from '~/stores/auth'
import { useCatalogStore } from '~/stores/catalog'

definePageMeta({ middleware: 'manager' })

const auth = useAuthStore()
const catalog = useCatalogStore()
useHead({ title: 'Панель админа — Территория Хвойных' })

// ── Тосты ──────────────────────────────────
interface Toast { id: number; text: string; kind: 'ok' | 'warn' | 'err' }
const toasts = ref<Toast[]>([])
let toastId = 0
function toast(text: string, kind: Toast['kind'] = 'ok') {
  const id = ++toastId
  toasts.value.push({ id, text, kind })
  setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id) }, 5000)
}

// ── Данные ─────────────────────────────────
interface PostRow {
  id: number
  latin_full: string
  name_ru?: string
  species_ru?: string
  cultivar?: string
  region?: string
  region_normalized?: string
  age?: string
  age_display?: string
  garden_display?: string
  date?: string
  is_new?: boolean
  is_russian_enriched?: boolean
  form_ru?: string
  color_ru?: string
  photos: number
  thumbs: string[]
  max_url?: string
  problems: string[]
}
interface Counts { total: number; new: number; noPhoto: number; noRegion: number; noAge: number; noRu: number }

const posts = ref<PostRow[]>([])
const counts = ref<Counts>({ total: 0, new: 0, noPhoto: 0, noRegion: 0, noAge: 0, noRu: 0 })
const total = ref(0)
const page = ref(1)
const pages = ref(1)
const search = ref('')
const activeFilter = ref<'' | 'new' | 'noPhoto' | 'noRegion' | 'noAge' | 'noRu'>('')
const loading = ref(false)
const view = ref<'grid' | 'list'>('grid')

const PROBLEM_LABELS: Record<string, string> = {
  noPhoto: 'нет фото',
  noRegion: 'нет региона',
  noAge: 'нет возраста',
  noRu: 'нет рус. названия',
}

const FILTERS = computed(() => [
  { key: '' as const, label: 'Все', count: counts.value.total },
  { key: 'new' as const, label: 'Новинки', count: counts.value.new },
  { key: 'noRegion' as const, label: 'Без региона', count: counts.value.noRegion },
  { key: 'noAge' as const, label: 'Без возраста', count: counts.value.noAge },
  { key: 'noRu' as const, label: 'Без рус. названия', count: counts.value.noRu },
  { key: 'noPhoto' as const, label: 'Без фото', count: counts.value.noPhoto },
])

async function loadPosts() {
  loading.value = true
  try {
    const params: Record<string, any> = { page: page.value, limit: 24, search: search.value }
    if (activeFilter.value === 'new') params.onlyNew = 1
    else if (activeFilter.value) params.filter = activeFilter.value

    const data = await $fetch<{ posts: PostRow[]; total: number; pages: number; counts: Counts }>(
      '/api/admin/posts', { params }
    )
    posts.value = data.posts
    total.value = data.total
    pages.value = data.pages
    counts.value = data.counts
  } catch (e: any) {
    toast(e?.data?.message || 'Не удалось загрузить список', 'err')
  } finally {
    loading.value = false
  }
}

// ── Личная лента правок ────────────────────
interface MyEntry { ts: string; action: string; title?: string; targetId?: number | string }
const myEntries = ref<MyEntry[]>([])
const myWeek = ref(0)

async function loadMine() {
  try {
    const d = await $fetch<{ entries: MyEntry[]; week: number }>('/api/admin/my-actions', { params: { limit: 6 } })
    myEntries.value = d.entries.filter(e => e.action !== 'auth.login')
    myWeek.value = d.week
  } catch {}
}

let deb: ReturnType<typeof setTimeout>
function onSearch() {
  clearTimeout(deb)
  deb = setTimeout(() => { page.value = 1; loadPosts() }, 300)
}

function setFilter(k: typeof activeFilter.value) {
  activeFilter.value = k
  page.value = 1
  loadPosts()
}

function goPage(d: number) {
  page.value = Math.min(Math.max(1, page.value + d), pages.value)
  loadPosts()
  if (import.meta.client) window.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(() => {
  loadPosts()
  loadMine()
  if (!catalog.isLoaded) catalog.loadCatalog()
  if (import.meta.client) {
    const saved = localStorage.getItem('terka-manage-view')
    if (saved === 'list' || saved === 'grid') view.value = saved
  }
})

watch(view, v => { if (import.meta.client) { try { localStorage.setItem('terka-manage-view', v) } catch {} } })

async function refreshAll() {
  catalog.$patch({ isLoaded: false })
  await catalog.loadCatalog(true)
  await Promise.all([loadPosts(), loadMine()])
}

// ── Редактор карточки ──────────────────────
const editingPlantId = ref<number | null>(null)
const editingPlant = computed(() =>
  editingPlantId.value ? catalog.getPlantById(editingPlantId.value) : undefined
)

async function openCard(post: PostRow) {
  if (!catalog.isLoaded) await catalog.loadCatalog()
  if (!catalog.getPlantById(post.id)) {
    toast('Карточка не найдена в каталоге — нажмите «Обновить»', 'err')
    return
  }
  editingPlantId.value = post.id
}

async function onCardSaved() {
  editingPlantId.value = null
  toast('Карточка сохранена')
  await refreshAll()
}

// ── Редактор текста в MAX ──────────────────
const maxPost = ref<PostRow | null>(null)
const maxText = ref('')
const maxOriginal = ref('')
const maxLoading = ref(false)
const maxSaving = ref(false)
const maxLink = ref('')
const maxHasMid = ref(true)
const maxDirty = computed(() => maxText.value !== maxOriginal.value)

async function openMax(post: PostRow) {
  maxPost.value = post
  maxText.value = ''
  maxOriginal.value = ''
  maxLink.value = post.max_url || ''
  maxHasMid.value = true
  maxLoading.value = true
  try {
    const d = await $fetch<{ text: string; hasMid: boolean; maxUrl: string | null }>(`/api/admin/max-text/${post.id}`)
    maxText.value = d.text
    maxOriginal.value = d.text
    maxHasMid.value = d.hasMid
    maxLink.value = d.maxUrl || post.max_url || ''
  } catch (e: any) {
    maxPost.value = null
    toast(e?.data?.message || 'Не удалось загрузить текст поста', 'err')
  } finally {
    maxLoading.value = false
  }
}

function closeMax() {
  if (maxDirty.value && !confirm('Изменения в тексте не сохранены. Закрыть?')) return
  maxPost.value = null
}

async function saveMax() {
  if (!maxPost.value || !maxText.value.trim()) return
  maxSaving.value = true
  try {
    const d = await $fetch<{ ok: boolean; maxEdited: boolean; hasMid: boolean }>(
      `/api/admin/max-text/${maxPost.value.id}`,
      { method: 'PUT', body: { text: maxText.value } }
    )
    if (d.maxEdited) toast('Сохранено на сайте и в канале MAX')
    else if (!d.hasMid) toast('Сохранено на сайте. Пост в MAX не привязан — там правьте вручную', 'warn')
    else toast('Сохранено на сайте, но MAX не подтвердил правку', 'warn')
    maxPost.value = null
    await refreshAll()
  } catch (e: any) {
    toast(e?.data?.message || 'Ошибка сохранения', 'err')
  } finally {
    maxSaving.value = false
  }
}

onMounted(() => {
  const h = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && maxPost.value && !maxSaving.value) closeMax()
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && maxPost.value && maxDirty.value) saveMax()
  }
  window.addEventListener('keydown', h)
  onUnmounted(() => window.removeEventListener('keydown', h))
})

function when(ts: string) {
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60_000) return 'только что'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} мин назад`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} ч назад`
  return new Date(ts).toLocaleDateString('ru', { day: '2-digit', month: '2-digit' })
}

async function doLogout() {
  await auth.logout()
  await navigateTo('/login')
}
</script>

<template>
  <div class="mp">
    <!-- ── Шапка ── -->
    <header class="mp-top">
      <div class="mp-top-in">
        <div class="mp-brand">
          <span class="mp-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" width="20" height="20"><path d="M12 2L7 9h3l-4 6h4l-3 5h10l-3-5h4l-4-6h3z" /></svg>
          </span>
          <span class="mp-brand-txt">
            <strong>Панель админа</strong>
            <small>Территория Хвойных</small>
          </span>
        </div>

        <div class="mp-user">
          <span class="mp-ava">{{ (auth.user?.displayName || '?').charAt(0).toUpperCase() }}</span>
          <span class="mp-user-txt">
            <strong>{{ auth.user?.displayName }}</strong>
            <small>{{ auth.roleLabel }}</small>
          </span>
          <NuxtLink v-if="auth.isSuperAdmin" to="/admin" class="mp-ghost">Админка</NuxtLink>
          <button class="mp-ghost" @click="doLogout">Выйти</button>
        </div>
      </div>
    </header>

    <div class="mp-wrap">
      <!-- ── Сводка ── -->
      <section class="mp-stats">
        <div class="mp-stat">
          <span class="mp-stat-n">{{ counts.total.toLocaleString('ru') }}</span>
          <span class="mp-stat-l">растений в каталоге</span>
        </div>
        <div class="mp-stat" :class="{ accent: counts.new > 0 }">
          <span class="mp-stat-n">{{ counts.new }}</span>
          <span class="mp-stat-l">новинок</span>
        </div>
        <div class="mp-stat" :class="{ warn: counts.noRegion + counts.noAge > 0 }">
          <span class="mp-stat-n">{{ counts.noRegion + counts.noAge + counts.noRu }}</span>
          <span class="mp-stat-l">карточек с недочётами</span>
        </div>
        <div class="mp-stat">
          <span class="mp-stat-n">{{ myWeek }}</span>
          <span class="mp-stat-l">ваших правок за неделю</span>
        </div>
      </section>

      <!-- ── Мои последние правки ── -->
      <section v-if="myEntries.length" class="mp-mine">
        <h2>Вы недавно правили</h2>
        <div class="mp-mine-row">
          <NuxtLink
            v-for="(e, i) in myEntries"
            :key="e.ts + i"
            :to="`/plant/${e.targetId}`"
            class="mp-mine-chip"
          >
            <span class="mp-mine-name">{{ e.title || '#' + e.targetId }}</span>
            <span class="mp-mine-when">{{ when(e.ts) }}</span>
          </NuxtLink>
        </div>
      </section>

      <!-- ── Панель управления ── -->
      <section class="mp-toolbar">
        <div class="mp-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
          <input v-model="search" type="search" placeholder="Название, сорт, сад..." @input="onSearch">
          <button v-if="search" class="mp-search-clear" @click="search = ''; page = 1; loadPosts()">✕</button>
        </div>

        <div class="mp-tools-right">
          <div class="mp-viewsw">
            <button :class="{ on: view === 'grid' }" title="Плитки" @click="view = 'grid'">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
            </button>
            <button :class="{ on: view === 'list' }" title="Список" @click="view = 'list'">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
            </button>
          </div>
          <button class="mp-btn" :disabled="loading" @click="refreshAll">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15" :class="{ spin: loading }"><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></svg>
            {{ loading ? 'Обновление' : 'Обновить' }}
          </button>
        </div>
      </section>

      <!-- ── Фильтры ── -->
      <section class="mp-filters">
        <button
          v-for="f in FILTERS"
          :key="f.key"
          class="mp-fchip"
          :class="{ on: activeFilter === f.key }"
          @click="setFilter(f.key)"
        >
          {{ f.label }}
          <span class="mp-fcount">{{ f.count }}</span>
        </button>
      </section>

      <div class="mp-found">
        Найдено: <strong>{{ total.toLocaleString('ru') }}</strong>
        <template v-if="search"> по запросу «{{ search }}»</template>
      </div>

      <!-- ── Скелетон / пусто ── -->
      <div v-if="loading && !posts.length" class="mp-grid">
        <div v-for="n in 8" :key="n" class="mp-card sk">
          <div class="sk-img" /><div class="sk-line" /><div class="sk-line short" />
        </div>
      </div>

      <div v-else-if="!posts.length" class="mp-none">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
        <p>Ничего не найдено</p>
        <button v-if="search || activeFilter" class="mp-btn" @click="search = ''; setFilter('')">Сбросить фильтры</button>
      </div>

      <!-- ── Плитки ── -->
      <div v-else-if="view === 'grid'" class="mp-grid">
        <article v-for="post in posts" :key="post.id" class="mp-card">
          <div class="mp-card-img" @click="openCard(post)">
            <img
              v-if="post.thumbs[0]"
              :src="thumbWebpUrl(post.thumbs[0])"
              :alt="post.latin_full"
              loading="lazy"
              @error="($event.target as HTMLImageElement).src = photoUrl(post.thumbs[0])"
            >
            <div v-else class="mp-card-noimg">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="26" height="26"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
            </div>
            <div class="mp-card-badges">
              <span v-if="post.is_new" class="mp-b new">NEW</span>
              <span v-if="post.photos > 1" class="mp-b ph">{{ post.photos }} фото</span>
            </div>
          </div>

          <div class="mp-card-body">
            <h3 class="mp-card-name">{{ post.cultivar || post.latin_full }}</h3>
            <p class="mp-card-sub">{{ post.species_ru || post.latin_full }}</p>
            <p class="mp-card-meta">
              {{ post.region_normalized || post.region || '— регион не указан' }}
            </p>
            <p class="mp-card-meta dim">{{ post.garden_display || '—' }}</p>

            <div v-if="post.problems.length" class="mp-probs">
              <span v-for="p in post.problems" :key="p" class="mp-prob">{{ PROBLEM_LABELS[p] }}</span>
            </div>
          </div>

          <div class="mp-card-acts">
            <button class="mp-a primary" @click="openCard(post)">Править</button>
            <button class="mp-a" @click="openMax(post)">Текст MAX</button>
            <NuxtLink :to="`/plant/${post.id}`" target="_blank" class="mp-a icon" title="Открыть на сайте">↗</NuxtLink>
          </div>
        </article>
      </div>

      <!-- ── Список ── -->
      <div v-else class="mp-list">
        <article v-for="post in posts" :key="post.id" class="mp-row">
          <img
            v-if="post.thumbs[0]"
            :src="thumbWebpUrl(post.thumbs[0])"
            class="mp-row-img"
            :alt="post.latin_full"
            loading="lazy"
            @error="($event.target as HTMLImageElement).src = photoUrl(post.thumbs[0])"
          >
          <div v-else class="mp-row-img mp-card-noimg">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M21 15l-5-5L5 21" /></svg>
          </div>

          <div class="mp-row-main">
            <div class="mp-row-l1">
              <strong>{{ post.cultivar || post.latin_full }}</strong>
              <span v-if="post.is_new" class="mp-b new">NEW</span>
              <span v-for="p in post.problems" :key="p" class="mp-prob">{{ PROBLEM_LABELS[p] }}</span>
            </div>
            <div class="mp-row-l2">
              {{ post.species_ru || '—' }} · {{ post.region_normalized || post.region || 'без региона' }} ·
              {{ post.garden_display || '—' }} · #{{ post.id }}
            </div>
          </div>

          <div class="mp-card-acts">
            <button class="mp-a primary" @click="openCard(post)">Править</button>
            <button class="mp-a" @click="openMax(post)">Текст MAX</button>
            <NuxtLink :to="`/plant/${post.id}`" target="_blank" class="mp-a icon">↗</NuxtLink>
          </div>
        </article>
      </div>

      <!-- ── Пагинация ── -->
      <nav v-if="pages > 1" class="mp-pager">
        <button class="mp-pg" :disabled="page <= 1" @click="goPage(-1)">← Назад</button>
        <span class="mp-pg-i">Стр. {{ page }} из {{ pages }}</span>
        <button class="mp-pg" :disabled="page >= pages" @click="goPage(1)">Вперёд →</button>
      </nav>
    </div>

    <!-- ── Редактор карточки ── -->
    <PlantEditDrawer
      v-if="editingPlant"
      :plant="editingPlant"
      @close="editingPlantId = null"
      @saved="onCardSaved"
    />

    <!-- ── Редактор текста MAX ── -->
    <Teleport to="body">
      <Transition name="mp-fade">
        <div v-if="maxPost" class="mx-ov" @click.self="closeMax">
          <div class="mx-md">
            <header class="mx-h">
              <div class="mx-h-txt">
                <strong>Текст поста в MAX</strong>
                <small>{{ maxPost.cultivar || maxPost.latin_full }} · #{{ maxPost.id }}</small>
              </div>
              <button class="mx-x" @click="closeMax">✕</button>
            </header>

            <div v-if="maxLoading" class="mx-b mx-load">Загрузка текста...</div>
            <div v-else class="mx-b">
              <p class="mx-hint">
                1-я строка — латинское название, далее русское название, регион,
                «Возраст: …», «Размер: …», «Оригинатор: …», сад и хештеги.
              </p>
              <textarea v-model="maxText" class="mx-ta" rows="13" spellcheck="false" />
              <div class="mx-foot-info">
                <span v-if="maxDirty" class="mx-dirty">● есть несохранённые изменения</span>
                <span v-else class="mx-clean">сохранено</span>
                <a v-if="maxLink" :href="maxLink" target="_blank" rel="noopener" class="mx-link">Открыть в MAX ↗</a>
              </div>
              <div v-if="!maxHasMid" class="mx-warn">
                Пост не привязан к сообщению в MAX — правка сохранится только на сайте.
              </div>
            </div>

            <footer class="mx-f">
              <button class="mx-cancel" @click="closeMax">Отмена</button>
              <button class="mx-save" :disabled="maxSaving || maxLoading || !maxText.trim() || !maxDirty" @click="saveMax">
                {{ maxSaving ? 'Сохранение...' : 'Сохранить' }}
              </button>
            </footer>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ── Тосты ── -->
    <Teleport to="body">
      <div class="mp-toasts">
        <TransitionGroup name="mp-toast">
          <div v-for="t in toasts" :key="t.id" class="mp-toast" :class="t.kind">{{ t.text }}</div>
        </TransitionGroup>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.mp {
  --mp-radius: 16px;
  --mp-card: var(--bg);
  --mp-line: var(--border);
  min-height: 100vh;
  background: var(--bg-alt);
  padding-bottom: 100px;
}

/* ── Шапка ── */
.mp-top {
  position: sticky; top: 0; z-index: 40;
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--mp-line);
}
.mp-top-in {
  max-width: 1280px; margin: 0 auto; padding: 12px 16px;
  display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap;
}
.mp-brand { display: flex; align-items: center; gap: 10px; }
.mp-logo {
  width: 38px; height: 38px; border-radius: 12px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--primary); color: #fff;
}
.mp-brand-txt { display: flex; flex-direction: column; line-height: 1.2; }
.mp-brand-txt strong { font-size: 15px; font-weight: 700; color: var(--text); }
.mp-brand-txt small { font-size: 11px; color: var(--text-muted); }

.mp-user { display: flex; align-items: center; gap: 10px; }
.mp-ava {
  width: 34px; height: 34px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: var(--primary); color: #fff; font-size: 14px; font-weight: 700; flex-shrink: 0;
}
.mp-user-txt { display: flex; flex-direction: column; line-height: 1.2; }
.mp-user-txt strong { font-size: 13px; font-weight: 600; color: var(--text); }
.mp-user-txt small { font-size: 11px; color: var(--primary); font-weight: 600; }
.mp-ghost {
  padding: 7px 12px; border: 1px solid var(--mp-line); border-radius: 9px;
  background: var(--bg); font-size: 12px; font-weight: 600; cursor: pointer; color: var(--text-secondary);
}
.mp-ghost:hover { border-color: var(--primary); color: var(--primary); }
@media (max-width: 600px) { .mp-user-txt { display: none; } }

.mp-wrap { max-width: 1280px; margin: 0 auto; padding: 20px 16px 0; }

/* ── Сводка ── */
.mp-stats {
  display: grid; gap: 10px; margin-bottom: 20px;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}
.mp-stat {
  background: var(--mp-card); border: 1px solid var(--mp-line); border-radius: var(--mp-radius);
  padding: 16px 18px; display: flex; flex-direction: column; gap: 3px;
}
.mp-stat-n { font-size: 26px; font-weight: 700; color: var(--text); line-height: 1.1; }
.mp-stat-l { font-size: 12px; color: var(--text-muted); }
.mp-stat.accent .mp-stat-n { color: var(--primary); }
.mp-stat.warn .mp-stat-n { color: #e65100; }

/* ── Мои правки ── */
.mp-mine { margin-bottom: 20px; }
.mp-mine h2 { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .7px; color: var(--text-muted); margin-bottom: 8px; }
.mp-mine-row { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; }
.mp-mine-chip {
  flex-shrink: 0; display: flex; flex-direction: column; gap: 1px;
  padding: 9px 14px; border: 1px solid var(--mp-line); border-radius: 12px;
  background: var(--mp-card); transition: border-color .15s;
}
.mp-mine-chip:hover { border-color: var(--primary); }
.mp-mine-name { font-size: 13px; font-weight: 600; color: var(--text); white-space: nowrap; }
.mp-mine-when { font-size: 11px; color: var(--text-muted); }

/* ── Тулбар ── */
.mp-toolbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
.mp-search {
  flex: 1; min-width: 220px; display: flex; align-items: center; gap: 9px;
  height: 46px; padding: 0 14px; background: var(--mp-card);
  border: 1px solid var(--mp-line); border-radius: 13px; color: var(--text-muted);
  transition: border-color .15s;
}
.mp-search:focus-within { border-color: var(--primary); }
.mp-search input { flex: 1; min-width: 0; border: none; outline: none; background: none; font-size: 14px; color: var(--text); }
.mp-search-clear { border: none; background: none; cursor: pointer; color: var(--text-muted); font-size: 13px; padding: 4px; }

.mp-tools-right { display: flex; gap: 8px; align-items: center; }
.mp-viewsw { display: flex; background: var(--mp-card); border: 1px solid var(--mp-line); border-radius: 11px; overflow: hidden; }
.mp-viewsw button {
  width: 40px; height: 44px; border: none; background: none; cursor: pointer;
  color: var(--text-muted); display: flex; align-items: center; justify-content: center;
}
.mp-viewsw button.on { background: var(--primary); color: #fff; }
.mp-btn {
  display: inline-flex; align-items: center; gap: 7px; height: 44px; padding: 0 16px;
  border: 1px solid var(--mp-line); border-radius: 11px; background: var(--mp-card);
  font-size: 13px; font-weight: 600; color: var(--text); cursor: pointer;
}
.mp-btn:disabled { opacity: .6; cursor: default; }
.spin { animation: mp-spin 1s linear infinite; }
@keyframes mp-spin { to { transform: rotate(360deg); } }

/* ── Фильтры ── */
.mp-filters { display: flex; gap: 7px; flex-wrap: wrap; margin-bottom: 12px; }
.mp-fchip {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 8px 13px; border: 1px solid var(--mp-line); border-radius: 22px;
  background: var(--mp-card); font-size: 13px; font-weight: 600; color: var(--text-secondary); cursor: pointer;
  transition: all .15s;
}
.mp-fchip:hover { border-color: var(--primary); }
.mp-fchip.on { background: var(--primary); border-color: var(--primary); color: #fff; }
.mp-fcount {
  font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 10px;
  background: var(--bg-alt); color: var(--text-muted);
}
.mp-fchip.on .mp-fcount { background: rgba(255,255,255,.22); color: #fff; }

.mp-found { font-size: 13px; color: var(--text-muted); margin-bottom: 14px; }
.mp-found strong { color: var(--text); }

.mp-none {
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  padding: 60px 20px; color: var(--text-muted);
}
.mp-none p { font-size: 15px; }

/* ── Плитки ── */
.mp-grid {
  display: grid; gap: 14px;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
}
.mp-card {
  background: var(--mp-card); border: 1px solid var(--mp-line); border-radius: var(--mp-radius);
  overflow: hidden; display: flex; flex-direction: column;
  transition: border-color .15s, transform .15s, box-shadow .15s;
}
.mp-card:hover { border-color: var(--primary); transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,.07); }
.mp-card-img { position: relative; aspect-ratio: 4/3; background: var(--bg-alt); cursor: pointer; overflow: hidden; }
.mp-card-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
.mp-card-noimg { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--border); background: var(--bg-alt); }
.mp-card-badges { position: absolute; top: 8px; left: 8px; display: flex; gap: 5px; flex-wrap: wrap; }
.mp-b { font-size: 9px; font-weight: 800; letter-spacing: .4px; padding: 3px 7px; border-radius: 7px; text-transform: uppercase; }
.mp-b.new { background: var(--primary); color: #fff; }
.mp-b.ph { background: rgba(0,0,0,.6); color: #fff; }

.mp-card-body { padding: 12px 14px; flex: 1; }
.mp-card-name { font-size: 14px; font-weight: 700; color: var(--text); line-height: 1.3; }
.mp-card-sub { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
.mp-card-meta { font-size: 11px; color: var(--text-muted); margin-top: 4px; }
.mp-card-meta.dim { opacity: .8; }

.mp-probs { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
.mp-prob { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 8px; background: #fff3e0; color: #e65100; }

.mp-card-acts { display: flex; gap: 6px; padding: 0 14px 14px; }
.mp-list .mp-card-acts { padding: 0; }
.mp-a {
  flex: 1; height: 36px; border: 1px solid var(--mp-line); border-radius: 9px;
  background: var(--bg-alt); font-size: 12px; font-weight: 600; color: var(--text);
  cursor: pointer; display: inline-flex; align-items: center; justify-content: center; white-space: nowrap;
}
.mp-a:hover { border-color: var(--primary); color: var(--primary); }
.mp-a.primary { background: var(--primary); border-color: var(--primary); color: #fff; }
.mp-a.primary:hover { background: var(--primary-dark, var(--primary)); color: #fff; }
.mp-a.icon { flex: 0 0 36px; }

/* ── Список ── */
.mp-list { display: flex; flex-direction: column; gap: 8px; }
.mp-row {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  background: var(--mp-card); border: 1px solid var(--mp-line); border-radius: 13px; padding: 10px 12px;
}
.mp-row:hover { border-color: var(--primary); }
.mp-row-img { width: 54px; height: 54px; border-radius: 10px; object-fit: cover; flex-shrink: 0; }
.mp-row-main { flex: 1; min-width: 170px; }
.mp-row-l1 { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; font-size: 14px; color: var(--text); }
.mp-row-l2 { font-size: 12px; color: var(--text-muted); margin-top: 3px; }
@media (max-width: 560px) { .mp-row .mp-card-acts { width: 100%; } }

/* ── Скелетон ── */
.mp-card.sk { pointer-events: none; }
.sk-img { aspect-ratio: 4/3; background: var(--bg-alt); }
.sk-line { height: 11px; margin: 12px 14px 0; border-radius: 6px; background: var(--bg-alt); }
.sk-line.short { width: 55%; margin-bottom: 16px; }
.mp-card.sk .sk-img, .mp-card.sk .sk-line { animation: sk-pulse 1.4s ease-in-out infinite; }
@keyframes sk-pulse { 0%,100% { opacity: 1 } 50% { opacity: .45 } }

/* ── Пагинация ── */
.mp-pager { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 24px; }
.mp-pg {
  height: 42px; padding: 0 18px; border: 1px solid var(--mp-line); border-radius: 11px;
  background: var(--mp-card); font-size: 13px; font-weight: 600; color: var(--text); cursor: pointer;
}
.mp-pg:disabled { opacity: .4; cursor: default; }
.mp-pg-i { font-size: 13px; color: var(--text-muted); }

/* ── Модалка MAX ── */
.mx-ov {
  position: fixed; inset: 0; z-index: 9000; background: rgba(0,0,0,.5);
  display: flex; align-items: center; justify-content: center; padding: 16px;
}
.mx-md {
  width: 100%; max-width: 580px; max-height: 92vh; background: var(--bg);
  border-radius: 18px; display: flex; flex-direction: column; overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,.28);
}
.mx-h { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--mp-line); }
.mx-h-txt { display: flex; flex-direction: column; gap: 2px; }
.mx-h-txt strong { font-size: 16px; font-weight: 700; color: var(--text); }
.mx-h-txt small { font-size: 12px; color: var(--text-muted); }
.mx-x { width: 32px; height: 32px; border: none; border-radius: 50%; background: var(--bg-alt); cursor: pointer; color: var(--text-secondary); flex-shrink: 0; font-size: 13px; }
.mx-b { padding: 16px 20px; overflow-y: auto; flex: 1; }
.mx-load { text-align: center; padding: 50px 20px; color: var(--text-muted); }
.mx-hint { font-size: 11px; color: var(--text-muted); line-height: 1.5; margin-bottom: 9px; }
.mx-ta {
  width: 100%; padding: 13px; border: 1px solid var(--mp-line); border-radius: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; line-height: 1.65;
  color: var(--text); background: var(--bg); box-sizing: border-box; resize: vertical; outline: none;
}
.mx-ta:focus { border-color: var(--primary); }
.mx-foot-info { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 9px; flex-wrap: wrap; }
.mx-dirty { font-size: 11px; color: #e65100; font-weight: 600; }
.mx-clean { font-size: 11px; color: var(--text-muted); }
.mx-link { font-size: 12px; color: var(--primary); }
.mx-warn { margin-top: 10px; padding: 9px 12px; border-radius: 10px; background: #fff8e1; color: #a06a00; font-size: 12px; }
.mx-f { display: flex; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--mp-line); }
.mx-cancel { flex: 1; height: 46px; border: 1px solid var(--mp-line); border-radius: 12px; background: var(--bg); font-size: 14px; font-weight: 600; color: var(--text-secondary); cursor: pointer; }
.mx-save { flex: 2; height: 46px; border: none; border-radius: 12px; background: var(--primary); color: #fff; font-size: 14px; font-weight: 700; cursor: pointer; }
.mx-save:disabled { opacity: .5; cursor: not-allowed; }

/* ── Тосты ── */
.mp-toasts { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: 9500; display: flex; flex-direction: column; gap: 8px; align-items: center; pointer-events: none; padding: 0 16px; }
.mp-toast {
  padding: 12px 20px; border-radius: 12px; font-size: 13px; font-weight: 600;
  box-shadow: 0 8px 28px rgba(0,0,0,.18); max-width: 92vw;
}
.mp-toast.ok { background: #1b5e20; color: #fff; }
.mp-toast.warn { background: #ef6c00; color: #fff; }
.mp-toast.err { background: #c62828; color: #fff; }
.mp-toast-enter-active, .mp-toast-leave-active { transition: all .25s ease; }
.mp-toast-enter-from, .mp-toast-leave-to { opacity: 0; transform: translateY(14px); }

.mp-fade-enter-active, .mp-fade-leave-active { transition: opacity .2s; }
.mp-fade-enter-from, .mp-fade-leave-to { opacity: 0; }
</style>
