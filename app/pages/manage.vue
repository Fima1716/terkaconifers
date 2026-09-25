<script setup lang="ts">
import { photoUrl } from '~/utils/photoUrl'
import { useAuthStore } from '~/stores/auth'
import { useCatalogStore } from '~/stores/catalog'

definePageMeta({ middleware: 'manager' })

const auth = useAuthStore()
const catalog = useCatalogStore()
useHead({ title: 'Менеджерская — Территория Хвойных' })

// ── Сообщения ──────────────────────────────
const message = ref('')
const msgType = ref<'ok' | 'warn' | 'err'>('ok')
function showMsg(text: string, type: 'ok' | 'warn' | 'err' = 'ok') {
  message.value = text
  msgType.value = type
  setTimeout(() => { if (message.value === text) message.value = '' }, 5000)
}

// ── Список постов ──────────────────────────
interface PostRow {
  id: number
  latin_full: string
  name_ru?: string
  species_ru?: string
  cultivar?: string
  region?: string
  region_normalized?: string
  age?: string
  garden_display?: string
  date?: string
  is_new?: boolean
  is_russian_enriched?: boolean
  form_ru?: string
  color_ru?: string
  photos: number
  thumbs: string[]
  max_url?: string
}

const posts = ref<PostRow[]>([])
const total = ref(0)
const page = ref(1)
const pages = ref(0)
const search = ref('')
const onlyNew = ref(false)
const loading = ref(false)

async function loadPosts() {
  loading.value = true
  try {
    const data = await $fetch<{ posts: PostRow[]; total: number; pages: number }>('/api/admin/posts', {
      params: { page: page.value, limit: 30, search: search.value, onlyNew: onlyNew.value ? 1 : 0 },
    })
    posts.value = data.posts
    total.value = data.total
    pages.value = data.pages
  } catch (e: any) {
    showMsg(e?.data?.message || 'Не удалось загрузить список', 'err')
  } finally {
    loading.value = false
  }
}

let searchDebounce: ReturnType<typeof setTimeout>
function onSearch() {
  clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => { page.value = 1; loadPosts() }, 300)
}

function toggleOnlyNew() {
  onlyNew.value = !onlyNew.value
  page.value = 1
  loadPosts()
}

function goPage(delta: number) {
  page.value = Math.min(Math.max(1, page.value + delta), pages.value || 1)
  loadPosts()
}

onMounted(() => {
  loadPosts()
  if (!catalog.isLoaded) catalog.loadCatalog()
})

async function refreshData() {
  catalog.$patch({ isLoaded: false })
  await catalog.loadCatalog(true)
  await loadPosts()
}

// ── Редактор карточки (тот же, что на странице растения) ──
const editingPlantId = ref<number | null>(null)
const editingPlant = computed(() =>
  editingPlantId.value ? catalog.getPlantById(editingPlantId.value) : undefined
)

async function openCard(post: PostRow) {
  if (!catalog.isLoaded) await catalog.loadCatalog()
  if (!catalog.getPlantById(post.id)) {
    showMsg('Карточка не найдена в каталоге — обновите данные', 'err')
    return
  }
  editingPlantId.value = post.id
}

async function onCardSaved() {
  editingPlantId.value = null
  showMsg('Карточка сохранена')
  await refreshData()
}

// ── Редактор текста поста в MAX ────────────
const maxPost = ref<PostRow | null>(null)
const maxText = ref('')
const maxLoading = ref(false)
const maxSaving = ref(false)
const maxLink = ref('')
const maxHasMid = ref(true)

async function openMax(post: PostRow) {
  maxPost.value = post
  maxText.value = ''
  maxLink.value = post.max_url || ''
  maxHasMid.value = true
  maxLoading.value = true
  try {
    const data = await $fetch<{ text: string; hasMid: boolean; maxUrl: string | null }>(
      `/api/admin/max-text/${post.id}`
    )
    maxText.value = data.text
    maxHasMid.value = data.hasMid
    maxLink.value = data.maxUrl || post.max_url || ''
  } catch (e: any) {
    maxPost.value = null
    showMsg(e?.data?.message || 'Не удалось загрузить текст поста', 'err')
  } finally {
    maxLoading.value = false
  }
}

function closeMax() {
  maxPost.value = null
}

async function saveMax() {
  if (!maxPost.value || !maxText.value.trim()) return
  maxSaving.value = true
  try {
    const data = await $fetch<{ ok: boolean; maxEdited: boolean; hasMid: boolean }>(
      `/api/admin/max-text/${maxPost.value.id}`,
      { method: 'PUT', body: { text: maxText.value } }
    )
    if (data.maxEdited) showMsg('Сохранено на сайте и в канале MAX')
    else if (!data.hasMid) showMsg('Сохранено на сайте. Пост в MAX не привязан — там правьте вручную', 'warn')
    else showMsg('Сохранено на сайте, но MAX не подтвердил правку', 'warn')
    maxPost.value = null
    await refreshData()
  } catch (e: any) {
    showMsg(e?.data?.message || 'Ошибка сохранения', 'err')
  } finally {
    maxSaving.value = false
  }
}

// Escape закрывает редактор текста
onMounted(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && maxPost.value && !maxSaving.value) closeMax()
  }
  window.addEventListener('keydown', handler)
  onUnmounted(() => window.removeEventListener('keydown', handler))
})

async function doLogout() {
  await auth.logout()
  await navigateTo('/login')
}
</script>

<template>
  <div class="manage-page container">
    <!-- Заголовок -->
    <div class="mg-head">
      <div>
        <h1>Менеджерская</h1>
        <p class="mg-sub">
          Правка карточек растений и текста постов в канале MAX.
          Изменения сразу видны на сайте.
        </p>
      </div>
      <div class="mg-user">
        <span class="mg-user-name">{{ auth.user?.displayName }}</span>
        <span class="mg-user-role">{{ auth.roleLabel }}</span>
        <button class="mg-logout" @click="doLogout">Выйти</button>
      </div>
    </div>

    <Transition name="fade">
      <div v-if="message" class="mg-msg" :class="msgType">{{ message }}</div>
    </Transition>

    <!-- Поиск и фильтры -->
    <div class="mg-toolbar">
      <div class="mg-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
        <input
          v-model="search"
          type="search"
          placeholder="Название, сорт, сад..."
          @input="onSearch"
        >
      </div>
      <button class="mg-chip" :class="{ active: onlyNew }" @click="toggleOnlyNew">Только новинки</button>
      <button class="mg-chip" :disabled="loading" @click="refreshData">
        {{ loading ? 'Обновление...' : 'Обновить' }}
      </button>
    </div>

    <div class="mg-count">
      {{ total }} записей<template v-if="search"> по запросу «{{ search }}»</template>
    </div>

    <!-- Список -->
    <div v-if="loading && !posts.length" class="mg-empty">Загрузка...</div>
    <div v-else-if="!posts.length" class="mg-empty">Ничего не найдено</div>

    <div v-else class="mg-list">
      <div v-for="post in posts" :key="post.id" class="mg-row">
        <img v-if="post.thumbs[0]" :src="photoUrl(post.thumbs[0])" class="mg-thumb" alt="">
        <div v-else class="mg-thumb mg-thumb-empty" />

        <div class="mg-info">
          <div class="mg-name">
            {{ post.cultivar || post.latin_full }}
            <span v-if="post.is_new" class="mg-badge new">NEW</span>
            <span v-if="post.is_russian_enriched" class="mg-badge ru">RU</span>
          </div>
          <div class="mg-meta">
            {{ post.species_ru || post.latin_full }} ·
            {{ post.region_normalized || post.region || '—' }}
            <template v-if="post.date"> · {{ post.date }}</template>
          </div>
          <div class="mg-meta">
            {{ post.garden_display || '—' }} · фото: {{ post.photos }} · #{{ post.id }}
          </div>
        </div>

        <div class="mg-actions">
          <button class="mg-btn" @click="openCard(post)">Карточка</button>
          <button class="mg-btn" @click="openMax(post)">Текст в MAX</button>
          <NuxtLink :to="`/plant/${post.id}`" class="mg-btn mg-btn-ghost">На сайте ↗</NuxtLink>
        </div>
      </div>
    </div>

    <!-- Пагинация -->
    <div v-if="pages > 1" class="mg-pager">
      <button class="mg-pg" :disabled="page <= 1" @click="goPage(-1)">←</button>
      <span class="mg-pg-info">{{ page }} / {{ pages }}</span>
      <button class="mg-pg" :disabled="page >= pages" @click="goPage(1)">→</button>
    </div>

    <!-- Редактор карточки -->
    <PlantEditDrawer
      v-if="editingPlant"
      :plant="editingPlant"
      @close="editingPlantId = null"
      @saved="onCardSaved"
    />

    <!-- Редактор текста поста в MAX -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="maxPost" class="mx-overlay" @click.self="closeMax">
          <div class="mx-modal">
            <div class="mx-head">
              <div>
                <h3>Текст поста в MAX</h3>
                <span class="mx-sub">{{ maxPost.cultivar || maxPost.latin_full }} · #{{ maxPost.id }}</span>
              </div>
              <button class="mx-close" @click="closeMax">&times;</button>
            </div>

            <div v-if="maxLoading" class="mx-body mx-loading">Загрузка...</div>
            <div v-else class="mx-body">
              <p class="mx-hint">
                1-я строка — латинское название, затем русское название, регион,
                «Возраст: …», «Размер: …», «Оригинатор: …», сад и хештеги.
                После сохранения каталог пересобирается автоматически.
              </p>
              <textarea v-model="maxText" class="mx-textarea" rows="14" />
              <div v-if="!maxHasMid" class="mx-warn">
                Пост не привязан к сообщению в MAX — правка сохранится только на сайте.
              </div>
              <a v-if="maxLink" :href="maxLink" target="_blank" rel="noopener" class="mx-link">Открыть пост в MAX ↗</a>
            </div>

            <div class="mx-foot">
              <button class="mx-cancel" @click="closeMax">Отмена</button>
              <button class="mx-save" :disabled="maxSaving || maxLoading || !maxText.trim()" @click="saveMax">
                {{ maxSaving ? 'Сохранение...' : 'Сохранить' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.manage-page { padding: 16px 16px 100px; }

/* ── Заголовок ── */
.mg-head {
  display: flex; justify-content: space-between; align-items: flex-start;
  gap: 16px; flex-wrap: wrap; margin-bottom: 16px;
}
.mg-head h1 { font-size: 22px; font-weight: 700; color: var(--text); }
.mg-sub { font-size: 13px; color: var(--text-muted); margin-top: 4px; max-width: 46ch; }
.mg-user { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.mg-user-name { font-size: 13px; font-weight: 600; color: var(--text); }
.mg-user-role {
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px;
  padding: 2px 8px; border-radius: 10px; background: var(--bg-alt); color: var(--primary);
}
.mg-logout {
  padding: 6px 12px; border: 1px solid var(--border); border-radius: 8px;
  background: var(--bg); font-size: 12px; cursor: pointer; color: var(--text-secondary);
}

/* ── Сообщения ── */
.mg-msg { padding: 10px 14px; border-radius: 10px; font-size: 13px; margin-bottom: 12px; }
.mg-msg.ok { background: #e8f5e9; color: #2e7d32; }
.mg-msg.warn { background: #fff8e1; color: #a06a00; }
.mg-msg.err { background: #fce4ec; color: #c62828; }

/* ── Тулбар ── */
.mg-toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 10px; }
.mg-search {
  flex: 1; min-width: 200px; display: flex; align-items: center; gap: 8px;
  height: 42px; padding: 0 12px;
  border: 1px solid var(--border); border-radius: 10px; background: var(--bg);
  color: var(--text-muted);
}
.mg-search input {
  flex: 1; border: none; outline: none; background: none;
  font-size: 14px; color: var(--text); min-width: 0;
}
.mg-chip {
  height: 42px; padding: 0 14px; border: 1px solid var(--border); border-radius: 10px;
  background: var(--bg); font-size: 13px; font-weight: 600; cursor: pointer; color: var(--text-secondary);
  white-space: nowrap;
}
.mg-chip.active { background: var(--primary); border-color: var(--primary); color: #fff; }
.mg-chip:disabled { opacity: 0.6; cursor: default; }

.mg-count { font-size: 12px; color: var(--text-muted); margin-bottom: 10px; }
.mg-empty { padding: 40px 0; text-align: center; color: var(--text-muted); font-size: 14px; }

/* ── Список ── */
.mg-list { display: flex; flex-direction: column; gap: 8px; }
.mg-row {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  padding: 10px; border: 1px solid var(--border); border-radius: 12px; background: var(--bg);
}
.mg-thumb { width: 56px; height: 56px; object-fit: cover; border-radius: 8px; flex-shrink: 0; }
.mg-thumb-empty { background: var(--bg-alt); }
.mg-info { flex: 1; min-width: 160px; }
.mg-name { font-size: 14px; font-weight: 600; color: var(--text); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.mg-meta { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
.mg-badge {
  font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 8px;
  text-transform: uppercase; letter-spacing: 0.3px;
}
.mg-badge.new { background: #e8f5e9; color: #2e7d32; }
.mg-badge.ru { background: #e3f2fd; color: #1565c0; }

.mg-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.mg-btn {
  padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px;
  background: var(--bg-alt); font-size: 12px; font-weight: 600;
  cursor: pointer; color: var(--text); white-space: nowrap;
}
.mg-btn-ghost { background: none; color: var(--text-secondary); }

/* ── Пагинация ── */
.mg-pager { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 16px; }
.mg-pg {
  width: 40px; height: 40px; border: 1px solid var(--border); border-radius: 10px;
  background: var(--bg); cursor: pointer; font-size: 16px; color: var(--text);
}
.mg-pg:disabled { opacity: 0.4; cursor: default; }
.mg-pg-info { font-size: 13px; color: var(--text-secondary); }

/* ── Модалка текста MAX ── */
.mx-overlay {
  position: fixed; inset: 0; z-index: 9000;
  background: rgba(0, 0, 0, 0.45);
  display: flex; align-items: center; justify-content: center; padding: 16px;
}
.mx-modal {
  width: 100%; max-width: 560px; max-height: 92vh;
  background: var(--bg); border-radius: 16px;
  display: flex; flex-direction: column; overflow: hidden;
}
.mx-head {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
  padding: 16px 20px; border-bottom: 1px solid var(--border);
}
.mx-head h3 { font-size: 16px; font-weight: 700; color: var(--text); }
.mx-sub { font-size: 12px; color: var(--text-muted); }
.mx-close {
  width: 32px; height: 32px; border: none; border-radius: 50%;
  background: var(--bg-alt); font-size: 20px; line-height: 1; cursor: pointer; color: var(--text-secondary);
  flex-shrink: 0;
}
.mx-body { padding: 16px 20px; overflow-y: auto; flex: 1; }
.mx-loading { text-align: center; padding: 40px 20px; color: var(--text-muted); }
.mx-hint { font-size: 11px; color: var(--text-muted); margin-bottom: 8px; line-height: 1.5; }
.mx-textarea {
  width: 100%; padding: 12px; border: 1px solid var(--border); border-radius: 10px;
  font-family: inherit; font-size: 14px; line-height: 1.6;
  color: var(--text); background: var(--bg); box-sizing: border-box; resize: vertical; outline: none;
}
.mx-textarea:focus { border-color: var(--primary); }
.mx-warn {
  margin-top: 10px; padding: 8px 12px; border-radius: 8px;
  background: #fff8e1; color: #a06a00; font-size: 12px;
}
.mx-link { display: inline-block; margin-top: 10px; font-size: 12px; color: var(--primary); }
.mx-foot { display: flex; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--border); }
.mx-cancel {
  flex: 1; height: 46px; border: 1px solid var(--border); border-radius: 12px;
  background: var(--bg); font-size: 14px; font-weight: 600; cursor: pointer; color: var(--text-secondary);
}
.mx-save {
  flex: 2; height: 46px; border: none; border-radius: 12px;
  background: var(--primary); color: #fff; font-size: 14px; font-weight: 700; cursor: pointer;
}
.mx-save:disabled { opacity: 0.6; cursor: not-allowed; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
