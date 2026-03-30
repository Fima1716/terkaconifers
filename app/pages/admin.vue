<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'

definePageMeta({ middleware: 'admin' })

const pub = usePublicUrl()
const auth = useAuthStore()
useHead({ title: 'Админ-панель — Территория Хвойных' })

const activeTab = ref('dashboard')

// Dashboard data
const stats = ref<any>(null)
const loading = ref(false)
const message = ref('')
const messageType = ref<'ok' | 'err'>('ok')

// Sync
const syncToken = ref('')
const syncing = ref(false)
const syncOutput = ref('')
const syncProgress = ref<any>({ status: 'idle', percent: 0, message: '', lines: [], results: null })
let progressPoll: ReturnType<typeof setInterval> | null = null

// Banner
const bannerConfig = ref<any>({ enabled: false, slides: [], interval: 6000 })
const showEditor = ref(false)
const editingIndex = ref(-1)
const editor = reactive({
  type: 'constructed', bgType: 'gradient',
  bgColor1: '#1a5632', bgColor2: '#2d8b4e', bgImage: '',
  overlay: 0.4, title: '', subtitle: '',
  buttonText: '', buttonLink: '/catalog',
  textAlign: 'left', textColor: '#ffffff',
})
const editorFile = ref<File | null>(null)
const uploading = ref(false)

const PRESETS = [
  { name: 'Зелёный', bgType: 'gradient', c1: '#1a5632', c2: '#2d8b4e' },
  { name: 'Тёмный', bgType: 'gradient', c1: '#0a1e12', c2: '#1a3a2a' },
  { name: 'Бирюза', bgType: 'gradient', c1: '#1a5632', c2: '#4db8a4' },
  { name: 'Осень', bgType: 'gradient', c1: '#8B4513', c2: '#D4A843' },
  { name: 'Зима', bgType: 'gradient', c1: '#2c3e50', c2: '#4a6fa5' },
]

// Posts
const posts = ref<any[]>([])
const postsTotal = ref(0)
const postsPage = ref(1)
const postsPages = ref(0)
const postsSearch = ref('')
const editingPost = ref<any>(null)
const editText = ref('')
const saving = ref(false)

// Exchange moderation
const exchangePosts = ref<any[]>([])
async function loadExchange() {
  try {
    const data = await $fetch<any>('/api/exchange')
    exchangePosts.value = data.posts || []
  } catch {}
}
async function deleteExchangePost(id: number) {
  if (!confirm('Удалить объявление?')) return
  try {
    await $fetch('/api/exchange/delete', { method: 'POST', body: { id } })
    showMsg('Объявление удалено')
    await loadExchange()
  } catch (e: any) { showMsg(e?.data?.message || 'Ошибка', 'err') }
}

// Growth diary moderation
const diaryEntries = ref<any[]>([])
async function loadDiary() {
  try {
    const data = await $fetch<any>('/api/growth-diary')
    diaryEntries.value = data.entries || []
  } catch {}
}
async function deleteDiaryEntry(id: number) {
  if (!confirm('Удалить запись дневника?')) return
  try {
    await $fetch('/api/growth-diary/delete', { method: 'POST', body: { id } })
    showMsg('Запись удалена')
    await loadDiary()
  } catch (e: any) { showMsg(e?.data?.message || 'Ошибка', 'err') }
}

// ── Conditions ────────────────
import { useCatalogStore } from '~/stores/catalog'
import type { GrowingConditions } from '~/stores/catalog'

const conditionsData = ref<{ species: Record<string, GrowingConditions>; overrides: Record<string, GrowingConditions> }>({ species: {}, overrides: {} })
const condSpeciesSearch = ref('')
const condSelectedSpecies = ref('')
const condEditing = ref<GrowingConditions>({})
const condSaving = ref(false)

async function loadConditions() {
  try {
    conditionsData.value = await $fetch('/api/conditions')
  } catch {}
}

// Get unique species list from catalog
const catalogStore = useCatalogStore()
const speciesList = computed(() => {
  if (!catalogStore.isLoaded) return []
  const map = new Map<string, { speciesFull: string; speciesRu: string; count: number }>()
  for (const p of catalogStore.catalog) {
    if (!p.species_full || p.species_full === p.genus) continue
    const existing = map.get(p.species_full)
    if (existing) existing.count++
    else map.set(p.species_full, { speciesFull: p.species_full, speciesRu: p.species_ru, count: 1 })
  }
  return [...map.values()].sort((a, b) => b.count - a.count)
})

const filteredSpecies = computed(() => {
  const q = condSpeciesSearch.value.toLowerCase()
  if (!q) return speciesList.value
  return speciesList.value.filter(s =>
    s.speciesFull.toLowerCase().includes(q) || s.speciesRu.toLowerCase().includes(q)
  )
})

function selectCondSpecies(speciesFull: string) {
  condSelectedSpecies.value = speciesFull
  condEditing.value = { ...(conditionsData.value.species[speciesFull] || {}) }
  // Deep copy soil array
  if (condEditing.value.soil) condEditing.value.soil = [...condEditing.value.soil]
}

function toggleCondValue(field: 'light' | 'moisture' | 'wind' | 'winter', value: string) {
  if (condEditing.value[field] === value) {
    delete condEditing.value[field]
  } else {
    (condEditing.value as any)[field] = value
  }
}

function toggleSoil(value: string) {
  if (!condEditing.value.soil) condEditing.value.soil = []
  const idx = condEditing.value.soil.indexOf(value as any)
  if (idx >= 0) condEditing.value.soil.splice(idx, 1)
  else condEditing.value.soil.push(value as any)
  if (condEditing.value.soil.length === 0) delete condEditing.value.soil
}

async function saveConditions() {
  if (!condSelectedSpecies.value) return
  condSaving.value = true
  try {
    // Clean empty object
    const clean: GrowingConditions = {}
    if (condEditing.value.light) clean.light = condEditing.value.light
    if (condEditing.value.moisture) clean.moisture = condEditing.value.moisture
    if (condEditing.value.wind) clean.wind = condEditing.value.wind
    if (condEditing.value.winter) clean.winter = condEditing.value.winter
    if (condEditing.value.soil?.length) clean.soil = condEditing.value.soil

    await $fetch('/api/admin/conditions', {
      method: 'POST',
      body: { action: 'saveSpecies', speciesFull: condSelectedSpecies.value, conditions: clean },
    })
    conditionsData.value.species[condSelectedSpecies.value] = clean
    showMsg(`Условия сохранены для ${condSelectedSpecies.value}`)
  } catch (e: any) { showMsg(e?.data?.message || 'Ошибка сохранения', 'err') }
  finally { condSaving.value = false }
}

async function deleteConditions() {
  if (!condSelectedSpecies.value || !confirm('Удалить условия для этого вида?')) return
  try {
    await $fetch('/api/admin/conditions', {
      method: 'POST',
      body: { action: 'deleteSpecies', speciesFull: condSelectedSpecies.value },
    })
    delete conditionsData.value.species[condSelectedSpecies.value]
    condEditing.value = {}
    showMsg('Условия удалены')
  } catch (e: any) { showMsg(e?.data?.message || 'Ошибка', 'err') }
}

const condFilledCount = computed(() => Object.keys(conditionsData.value.species).length)

// ── Garden consent ────────────
const gardenConsents = ref<Record<string, boolean>>({})
const savedConsents = ref<Record<string, boolean>>({})
const allGardens = ref<{ name: string; count: number }[]>([])
const consentSearch = ref('')
const consentSaving = ref(false)

async function loadConsents() {
  try {
    const data = await $fetch<any>('/api/admin/consent')
    allGardens.value = data.gardens
    gardenConsents.value = { ...data.consents }
    savedConsents.value = { ...data.consents }
  } catch {}
}

const filteredConsentGardens = computed(() => {
  const q = consentSearch.value.toLowerCase()
  if (!q) return allGardens.value
  return allGardens.value.filter(g => g.name.toLowerCase().includes(q))
})

const consentStats = computed(() => {
  const total = allGardens.value.length
  const consented = allGardens.value.filter(g => gardenConsents.value[g.name]).length
  const plants = allGardens.value
    .filter(g => gardenConsents.value[g.name])
    .reduce((s, g) => s + g.count, 0)
  return { total, consented, plants }
})

const hasConsentChanges = computed(() => {
  return allGardens.value.some(g => gardenConsents.value[g.name] !== savedConsents.value[g.name])
})

function toggleConsent(gardenName: string) {
  gardenConsents.value[gardenName] = !gardenConsents.value[gardenName]
}

function selectAllConsents() {
  for (const g of allGardens.value) gardenConsents.value[g.name] = true
}

function deselectAllConsents() {
  for (const g of allGardens.value) gardenConsents.value[g.name] = false
}

function invertConsents() {
  for (const g of allGardens.value) gardenConsents.value[g.name] = !gardenConsents.value[g.name]
}

function copyConsentLink(gardenName: string) {
  const url = `${window.location.origin}/consent?garden=${encodeURIComponent(gardenName)}`
  navigator.clipboard.writeText(url)
  showMsg(`Ссылка скопирована: ${url}`)
}

async function applyConsents() {
  consentSaving.value = true
  try {
    await $fetch('/api/admin/consent', {
      method: 'POST',
      body: { consents: gardenConsents.value },
    })
    savedConsents.value = { ...gardenConsents.value }
    // Force reload catalog with cache-busting so admin sees changes immediately
    catalogStore.$patch({ isLoaded: false })
    await catalogStore.loadCatalog(true)
    showMsg(`Доступы обновлены. ${consentStats.value.consented} садов видно на сайте.`)
  } catch (e: any) { showMsg(e?.data?.message || 'Ошибка', 'err') }
  finally { consentSaving.value = false }
}

const tabs = [
  { id: 'dashboard', label: 'Дашборд', icon: 'dashboard' },
  { id: 'consent', label: 'Согласия', icon: 'consent' },
  { id: 'sync', label: 'Синхронизация', icon: 'sync' },
  { id: 'posts', label: 'Посты', icon: 'posts' },
  { id: 'banner', label: 'Баннеры', icon: 'banner' },
  { id: 'exchange', label: 'Обмен', icon: 'exchange' },
  { id: 'diary', label: 'Дневник', icon: 'diary' },
  { id: 'conditions', label: 'Условия', icon: 'conditions' },
  { id: 'users', label: 'Пользователи', icon: 'users' },
]

// Buy buttons toggles
const showBuyButtons = ref(false)
const showBuyButtonsGarden = ref(false)
async function loadBuyButtonsSetting() {
  try {
    const data = await $fetch<any>(`/api/gardens?_=${Date.now()}`)
    showBuyButtons.value = !!data.showBuyButtons
    showBuyButtonsGarden.value = !!data.showBuyButtonsGarden
  } catch {}
}
async function toggleBuyButtons() {
  try {
    const res = await $fetch<any>('/api/admin/site-settings', {
      method: 'PUT',
      body: { showBuyButtons: !showBuyButtons.value },
    })
    showBuyButtons.value = res.showBuyButtons
    showMsg(res.showBuyButtons ? 'Кнопки в каталоге включены' : 'Кнопки в каталоге выключены')
  } catch (e: any) { showMsg(e?.data?.message || 'Ошибка', 'err') }
}
async function toggleBuyButtonsGarden() {
  try {
    const res = await $fetch<any>('/api/admin/site-settings', {
      method: 'PUT',
      body: { showBuyButtonsGarden: !showBuyButtonsGarden.value },
    })
    showBuyButtonsGarden.value = res.showBuyButtonsGarden
    showMsg(res.showBuyButtonsGarden ? 'Кнопки на страницах садов включены' : 'Кнопки на страницах садов выключены')
  } catch (e: any) { showMsg(e?.data?.message || 'Ошибка', 'err') }
}

// Maintenance mode
const maintenanceMode = ref({ enabled: false, message: '' })
const maintenanceMsg = ref('')

async function loadMaintenance() {
  try {
    maintenanceMode.value = await $fetch('/api/maintenance')
    maintenanceMsg.value = maintenanceMode.value.message || ''
  } catch {}
}

async function toggleMaintenance() {
  const newEnabled = !maintenanceMode.value.enabled
  if (newEnabled && !confirm('Закрыть сайт для всех посетителей?')) return
  try {
    maintenanceMode.value = await $fetch('/api/admin/maintenance', {
      method: 'POST',
      body: { enabled: newEnabled, message: maintenanceMsg.value },
    })
    showMsg(newEnabled ? 'Сайт закрыт' : 'Сайт открыт')
  } catch (e: any) { showMsg(e?.data?.message || 'Ошибка', 'err') }
}

async function saveMaintenanceMsg() {
  try {
    maintenanceMode.value = await $fetch('/api/admin/maintenance', {
      method: 'POST',
      body: { message: maintenanceMsg.value },
    })
    showMsg('Сообщение сохранено')
  } catch (e: any) { showMsg(e?.data?.message || 'Ошибка', 'err') }
}

onMounted(async () => {
  await loadStats()
  await loadBanner()
  await loadMaintenance()
  await loadBuyButtonsSetting()
})

async function loadStats() {
  try {
    stats.value = await $fetch('/api/admin/stats')
  } catch {}
}

async function loadBanner() {
  try {
    bannerConfig.value = await $fetch('/banner/config.json', { headers: { 'Cache-Control': 'no-cache' } })
    if (!bannerConfig.value.slides) bannerConfig.value.slides = []
  } catch {}
}

function showMsg(text: string, type: 'ok' | 'err' = 'ok') {
  message.value = text; messageType.value = type
  setTimeout(() => { message.value = '' }, 5000)
}

// ── Posts ──────────────────────
async function loadPosts() {
  try {
    const data = await $fetch<any>('/api/admin/posts', { params: { page: postsPage.value, limit: 50, search: postsSearch.value } })
    posts.value = data.posts
    postsTotal.value = data.total
    postsPages.value = data.pages
  } catch {}
}

let searchDebounce: ReturnType<typeof setTimeout>
function onPostsSearch() {
  clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => { postsPage.value = 1; loadPosts() }, 300)
}

function openEditPost(post: any) {
  editingPost.value = post
  // Reconstruct text from fields
  editText.value = [
    post.latin_full,
    post.name_ru || '',
    '',
    post.region || '',
    post.age ? `Возраст: ${post.age}` : '',
    post.garden_display ? `${post.garden_display}` : '',
  ].filter(Boolean).join('\n')
}

async function savePost() {
  if (!editingPost.value) return
  saving.value = true
  try {
    await $fetch('/api/admin/edit-post', {
      method: 'POST',
      body: { id: editingPost.value.id, text: editText.value, token: syncToken.value, chatId: '-71324192443065' },
    })
    showMsg('Пост обновлён')
    editingPost.value = null
    await runEnrich()
    await loadPosts()
  } catch (e: any) { showMsg(e?.data?.message || 'Ошибка', 'err') }
  finally { saving.value = false }
}

// ── Sync ───────────────────────
async function runSync() {
  if (!syncToken.value) { showMsg('Введите токен бота MAX', 'err'); return }
  syncing.value = true; syncOutput.value = ''
  syncProgress.value = { status: 'running', percent: 0, message: 'Запуск...', lines: [] }

  // Start polling progress
  progressPoll = setInterval(async () => {
    try {
      const p = await $fetch<any>('/api/admin/sync-progress')
      syncProgress.value = p
      if (p.lines?.length) syncOutput.value = p.lines.join('\n')
      if (p.status === 'done' || p.status === 'error') {
        stopPolling()
        syncing.value = false
        showMsg(p.status === 'done' ? 'Синхронизация завершена' : 'Ошибка', p.status === 'done' ? 'ok' : 'err')
        await loadStats()
      }
    } catch {}
  }, 800)

  // Fire sync (don't await — it runs in background while we poll)
  $fetch('/api/admin/sync', {
    method: 'POST',
    body: { token: syncToken.value, chatId: '-71324192443065' },
  }).catch(() => {})
}

function stopPolling() {
  if (progressPoll) { clearInterval(progressPoll); progressPoll = null }
}

async function clearNewFlags(days: number) {
  loading.value = true
  try {
    await $fetch('/api/admin/clear-new', { method: 'POST', body: { days } })
    showMsg('Флаги "Новинка" сброшены')
    await loadStats()
  } catch (e: any) { showMsg(e?.data?.message || 'Ошибка', 'err') }
  finally { loading.value = false }
}

async function runEnrich() {
  loading.value = true
  try {
    await $fetch('/api/admin/enrich', { method: 'POST',  })
    showMsg('Данные пересобраны')
    await loadStats()
  } catch (e: any) { showMsg(e?.data?.message || 'Ошибка', 'err') }
  finally { loading.value = false }
}

// ── Banner ─────────────────────
function openNewSlide() {
  editingIndex.value = -1
  Object.assign(editor, { type: 'constructed', bgType: 'gradient', bgColor1: '#1a5632', bgColor2: '#2d8b4e', bgImage: '', overlay: 0.4, title: '', subtitle: '', buttonText: '', buttonLink: '/catalog', textAlign: 'left', textColor: '#ffffff' })
  editorFile.value = null; showEditor.value = true
}

function editSlide(i: number) {
  editingIndex.value = i
  const s = bannerConfig.value.slides[i]
  Object.assign(editor, { type: s.type || 'constructed', bgType: s.bgType || 'gradient', bgColor1: s.bgColor1 || '#1a5632', bgColor2: s.bgColor2 || '#2d8b4e', bgImage: s.bgImage || '', overlay: s.overlay ?? 0.4, title: s.title || '', subtitle: s.subtitle || '', buttonText: s.buttonText || '', buttonLink: s.buttonLink || '/catalog', textAlign: s.textAlign || 'left', textColor: s.textColor || '#ffffff' })
  editorFile.value = null; showEditor.value = true
}

async function saveSlide() {
  uploading.value = true
  try {
    const fd = new FormData()
    fd.append('action', 'saveSlide'); fd.append('slideIndex', String(editingIndex.value))
    for (const [k, v] of Object.entries(editor)) fd.append(k, String(v))
    if (editorFile.value) fd.append('bgImageFile', editorFile.value)
    await $fetch('/api/banner', { method: 'POST', body: fd,  })
    showMsg(editingIndex.value >= 0 ? 'Слайд обновлён' : 'Слайд добавлен')
    showEditor.value = false; await loadBanner()
  } catch (e: any) { showMsg(e?.data?.message || 'Ошибка', 'err') }
  finally { uploading.value = false }
}

async function deleteSlide(i: number) {
  if (!confirm('Удалить слайд?')) return
  const fd = new FormData(); fd.append('action', 'delete'); fd.append('slideIndex', String(i))
  await $fetch('/api/banner', { method: 'POST', body: fd,  })
  showMsg('Слайд удалён'); await loadBanner()
}

async function toggleBanner() {
  const fd = new FormData(); fd.append('action', 'toggle'); fd.append('enabled', String(!bannerConfig.value.enabled))
  await $fetch('/api/banner', { method: 'POST', body: fd,  })
  await loadBanner()
}

const previewStyle = computed(() => {
  const s: Record<string, string> = {}
  if (editor.bgType === 'gradient') s.background = `linear-gradient(135deg, ${editor.bgColor1}, ${editor.bgColor2})`
  else if (editor.bgType === 'color') s.background = editor.bgColor1
  else if (editor.bgType === 'image') {
    if (editorFile.value) s.backgroundImage = `url(${URL.createObjectURL(editorFile.value)})`
    else if (editor.bgImage) s.backgroundImage = `url(/banner/${editor.bgImage})`
    s.backgroundSize = 'cover'; s.backgroundPosition = 'center'
  }
  s.color = editor.textColor; return s
})

function thumbStyle(slide: any): Record<string, string> {
  if (slide.bgType === 'gradient') return { background: `linear-gradient(135deg, ${slide.bgColor1}, ${slide.bgColor2})` }
  if (slide.bgType === 'color') return { background: slide.bgColor1 }
  if (slide.bgImage) return { backgroundImage: `url(/banner/${slide.bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
  return { background: '#ddd' }
}

function formatDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="admin">
    <!-- Main -->
    <div class="admin-layout">
      <!-- Sidebar -->
      <aside class="sidebar">
        <div class="sidebar-brand">
          <img :src="pub('images/logo.jpg')"  alt="" class="sidebar-logo">
          <span>Админка</span>
        </div>
        <div v-if="auth.user" class="sidebar-user">
          <span class="user-name">{{ auth.user.displayName }}</span>
          <button class="btn-logout" @click="auth.logout(); navigateTo('/login')">Выйти</button>
        </div>
        <nav class="sidebar-nav">
          <button v-for="tab in tabs" :key="tab.id" class="nav-item" :class="{ active: activeTab === tab.id }" @click="activeTab = tab.id; if (tab.id === 'posts' && !posts.length) loadPosts(); if (tab.id === 'exchange') loadExchange(); if (tab.id === 'diary') loadDiary(); if (tab.id === 'conditions') { loadConditions(); if (!catalogStore.isLoaded) catalogStore.loadCatalog() }; if (tab.id === 'consent') loadConsents()">
            <span class="nav-icon">
              <svg v-if="tab.icon === 'dashboard'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
              <svg v-else-if="tab.icon === 'consent'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>
              <svg v-else-if="tab.icon === 'sync'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
              <svg v-else-if="tab.icon === 'posts'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              <svg v-else-if="tab.icon === 'banner'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
              <svg v-else-if="tab.icon === 'exchange'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>
              <svg v-else-if="tab.icon === 'diary'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>
              <svg v-else-if="tab.icon === 'conditions'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              <svg v-else-if="tab.icon === 'users'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
            </span>
            <span class="nav-label">{{ tab.label }}</span>
          </button>
        </nav>
        <div class="sidebar-footer">
          <NuxtLink to="/" class="nav-item">
            <span class="nav-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </span>
            <span class="nav-label">На сайт</span>
          </NuxtLink>
        </div>
      </aside>

      <!-- Content -->
      <main class="content">
        <div v-if="message" class="toast" :class="messageType">{{ message }}</div>

        <!-- ═══ Dashboard ═══ -->
        <div v-if="activeTab === 'dashboard'" class="page">
          <h2>Дашборд</h2>

          <!-- Maintenance mode -->
          <div class="panel maintenance-panel" :class="{ 'maintenance-active': maintenanceMode.enabled }">
            <div class="maintenance-header">
              <div>
                <h3>Профилактика</h3>
                <p class="panel-desc">Закрыть сайт для всех посетителей. Админ-панель останется доступна.</p>
              </div>
              <button
                class="btn-maintenance"
                :class="maintenanceMode.enabled ? 'btn-danger' : 'btn-secondary'"
                @click="toggleMaintenance"
              >
                {{ maintenanceMode.enabled ? 'Открыть сайт' : 'Закрыть сайт' }}
              </button>
            </div>
            <div class="field" style="margin-top: 12px;">
              <label>Сообщение для посетителей</label>
              <div style="display: flex; gap: 8px;">
                <input v-model="maintenanceMsg" type="text" class="input" placeholder="Сайт временно закрыт на профилактику..." style="flex: 1;">
                <button class="btn-secondary" @click="saveMaintenanceMsg">Сохранить</button>
              </div>
            </div>
          </div>

          <!-- Buy buttons toggles -->
          <div v-if="auth.isSuperAdmin" class="panel">
            <h3>Кнопки «Купить»</h3>
            <div class="maintenance-header" style="margin-top: 12px;">
              <div>
                <p class="panel-desc" style="margin: 0;"><strong>В общем каталоге</strong> — на странице /catalog</p>
              </div>
              <button
                class="btn-maintenance"
                :class="showBuyButtons ? 'btn-danger' : 'btn-secondary'"
                @click="toggleBuyButtons"
              >
                {{ showBuyButtons ? 'Выключить' : 'Включить' }}
              </button>
            </div>
            <div class="maintenance-header" style="margin-top: 12px;">
              <div>
                <p class="panel-desc" style="margin: 0;"><strong>На страницах садов</strong> — на странице конкретного сада</p>
              </div>
              <button
                class="btn-maintenance"
                :class="showBuyButtonsGarden ? 'btn-danger' : 'btn-secondary'"
                @click="toggleBuyButtonsGarden"
              >
                {{ showBuyButtonsGarden ? 'Выключить' : 'Включить' }}
              </button>
            </div>
          </div>

          <div v-if="stats" class="cards-grid">
            <div class="stat-card">
              <div class="stat-value">{{ stats.catalog.count.toLocaleString() }}</div>
              <div class="stat-label">Растений в каталоге</div>
            </div>
            <div class="stat-card accent">
              <div class="stat-value">{{ stats.catalog.newCount }}</div>
              <div class="stat-label">Новинок</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{{ stats.banner.slides }}</div>
              <div class="stat-label">Слайдов баннера</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{{ stats.prices.count }}</div>
              <div class="stat-label">С ценами</div>
            </div>
          </div>

          <!-- Genera breakdown -->
          <div v-if="stats" class="panel">
            <h3>Роды растений</h3>
            <div class="genera-grid">
              <div v-for="(count, name) in stats.catalog.genera" :key="name" class="genus-chip">
                {{ name }} <strong>{{ count }}</strong>
              </div>
            </div>
          </div>

          <!-- Quick info -->
          <div v-if="stats" class="panel">
            <h3>Информация</h3>
            <div class="info-list">
              <div class="info-row"><span>Последняя синхронизация</span><strong>{{ formatDate(stats.sync.last_sync) }}</strong></div>
              <div class="info-row"><span>Всего добавлено синком</span><strong>{{ stats.sync.total_synced }}</strong></div>
              <div class="info-row"><span>Размер каталога</span><strong>{{ stats.catalog.sizeKB }} КБ</strong></div>
              <div class="info-row"><span>Баннер</span><strong :style="{ color: stats.banner.enabled ? '#2e7d32' : '#c62828' }">{{ stats.banner.enabled ? 'Включён' : 'Выключен' }}</strong></div>
            </div>
          </div>

          <!-- Recent logs -->
          <div v-if="stats?.logs?.length" class="panel">
            <h3>Последние логи синхронизации</h3>
            <pre class="log-box">{{ stats.logs.join('\n') }}</pre>
          </div>
        </div>

        <!-- ═══ Consent ═══ -->
        <div v-if="activeTab === 'consent'" class="page">
          <h2>Согласия садов</h2>
          <p class="page-desc">Выберите сады, которые можно показывать на сайте. Изменения вступят в силу после нажатия «Применить».</p>

          <!-- Auto-maintenance warning -->
          <div v-if="consentStats.consented === 0 && allGardens.length > 0" class="consent-warning">
            Ни один сад не выбран — сайт автоматически закрыт для посетителей. Выберите хотя бы один сад и нажмите «Применить».
          </div>

          <div class="consent-stats">
            <div class="stat-card" :class="{ accent: consentStats.consented > 0 }">
              <div class="stat-value">{{ consentStats.consented }} / {{ consentStats.total }}</div>
              <div class="stat-label">Садов выбрано</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{{ consentStats.plants.toLocaleString() }}</div>
              <div class="stat-label">Растений будет видно</div>
            </div>
          </div>

          <div class="panel">
            <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px;">
              <input v-model="consentSearch" type="text" class="input" placeholder="Поиск сада..." style="flex: 1;">
              <button
                class="btn-primary"
                :disabled="!hasConsentChanges || consentSaving"
                @click="applyConsents"
              >
                {{ consentSaving ? 'Сохранение...' : 'Применить' }}
              </button>
            </div>

            <!-- Quick action buttons -->
            <div class="consent-actions">
              <button class="btn-sm btn-green" @click="selectAllConsents">Выбрать все</button>
              <button class="btn-sm btn-outline" @click="deselectAllConsents">Снять все</button>
              <button class="btn-sm btn-outline" @click="invertConsents">Инвертировать</button>
            </div>

            <div class="consent-list">
              <div
                v-for="g in filteredConsentGardens"
                :key="g.name"
                class="consent-row"
                :class="{ consented: gardenConsents[g.name] }"
                @click="toggleConsent(g.name)"
              >
                <label class="consent-toggle" @click.prevent>
                  <span class="st-switch">
                    <input type="checkbox" :checked="gardenConsents[g.name]" @change="toggleConsent(g.name)">
                    <span class="st-track" />
                  </span>
                  <span class="consent-name">{{ g.name }}</span>
                  <span class="consent-count">{{ g.count }} растений</span>
                  <button class="consent-link-btn" title="Скопировать ссылку на согласие" @click.stop="copyConsentLink(g.name)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
                  </button>
                </label>
              </div>
            </div>

            <!-- Sticky apply bar when there are changes -->
            <div v-if="hasConsentChanges" class="consent-apply-bar">
              <span>Есть несохранённые изменения</span>
              <button class="btn-primary" :disabled="consentSaving" @click="applyConsents">
                {{ consentSaving ? 'Сохранение...' : 'Применить изменения' }}
              </button>
            </div>
          </div>
        </div>

        <!-- ═══ Sync ═══ -->
        <div v-if="activeTab === 'sync'" class="page">
          <h2>Синхронизация с MAX</h2>
          <p class="page-desc">Сравнивает ВСЕ сообщения в канале MAX с текущим каталогом сайта. Добавляет новые растения, обновляет фото и данные из свежих постов, обрабатывает удалённые посты.</p>

          <div class="panel">
            <h3>Запуск синхронизации</h3>
            <div class="field">
              <label>Токен бота MAX</label>
              <input v-model="syncToken" type="password" class="input" placeholder="Токен из @BotFather MAX">
            </div>

            <!-- Progress bar -->
            <div v-if="syncing || syncProgress.status === 'running'" class="sync-progress">
              <div class="progress-bar">
                <div class="progress-fill" :style="{ width: syncProgress.percent + '%' }" />
              </div>
              <div class="progress-info">
                <span class="progress-text">{{ syncProgress.message }}</span>
                <span class="progress-pct">{{ syncProgress.percent }}%</span>
              </div>
            </div>

            <div v-else class="btn-row">
              <button class="btn-primary" @click="runSync">Запустить синхронизацию</button>
            </div>

            <!-- Structured results -->
            <div v-if="syncProgress.results && (syncProgress.status === 'done' || syncProgress.status === 'error')" class="sync-results">
              <div class="sync-results-header" :class="syncProgress.status">
                {{ syncProgress.status === 'done' ? 'Синхронизация завершена' : 'Ошибка синхронизации' }}
              </div>

              <div class="sync-stats">
                <div class="sync-stat">
                  <span class="sync-stat-num" :class="{ highlight: syncProgress.results.added > 0 }">{{ syncProgress.results.added }}</span>
                  <span class="sync-stat-label">Добавлено</span>
                </div>
                <div class="sync-stat">
                  <span class="sync-stat-num" :class="{ highlight: syncProgress.results.updated > 0 }">{{ syncProgress.results.updated }}</span>
                  <span class="sync-stat-label">Обновлено</span>
                </div>
                <div class="sync-stat">
                  <span class="sync-stat-num">{{ syncProgress.results.total }}</span>
                  <span class="sync-stat-label">Всего в каталоге</span>
                </div>
                <div class="sync-stat">
                  <span class="sync-stat-num">{{ syncProgress.results.messagesTotal }}</span>
                  <span class="sync-stat-label">Сообщений в канале</span>
                </div>
              </div>

              <!-- New plants list -->
              <div v-if="syncProgress.results.newPlants?.length" class="sync-changes">
                <div class="sync-changes-title">Новые растения</div>
                <NuxtLink v-for="name in syncProgress.results.newPlants" :key="name" :to="`/catalog?q=${encodeURIComponent(name)}`" class="sync-change-item new sync-link">{{ name }}</NuxtLink>
              </div>

              <!-- Updated plants list -->
              <div v-if="syncProgress.results.updatedPlants?.length" class="sync-changes">
                <div class="sync-changes-title">Обновлённые растения</div>
                <NuxtLink v-for="name in syncProgress.results.updatedPlants" :key="name" :to="`/catalog?q=${encodeURIComponent(name)}`" class="sync-change-item updated sync-link">{{ name }}</NuxtLink>
              </div>

              <div v-if="syncProgress.results.relinkedPlants?.length" class="sync-changes">
                <div class="sync-changes-title">Перепривязаны (удалённые посты)</div>
                <NuxtLink v-for="name in syncProgress.results.relinkedPlants" :key="name" :to="`/catalog?q=${encodeURIComponent(name)}`" class="sync-change-item relinked sync-link">{{ name }}</NuxtLink>
              </div>

              <!-- Raw log toggle -->
              <details class="sync-log-details">
                <summary>Показать полный лог</summary>
                <pre class="log-box">{{ syncOutput }}</pre>
              </details>
            </div>
          </div>

          <div class="panel">
            <h3>Управление новинками</h3>
            <p class="panel-desc">Новые растения из синка получают оранжевый бейдж «Новинка» на сайте. Здесь можно снять его вручную или по возрасту.</p>
            <div class="btn-row">
              <button class="btn-secondary" @click="clearNewFlags(7)">Снять старше 7 дней</button>
              <button class="btn-secondary" @click="clearNewFlags(3)">Снять старше 3 дней</button>
              <button class="btn-danger" @click="clearNewFlags(0)">Снять все</button>
            </div>
          </div>

          <div class="panel">
            <h3>Пересборка данных (Enrich)</h3>
            <p class="panel-desc">Пересобирает обогащённые данные: формы роста, цвет хвои, регионы, зоны зимостойкости, фильтры. Запускается автоматически после синхронизации.</p>
            <button class="btn-secondary" :disabled="loading" @click="runEnrich">
              {{ loading ? 'Пересборка...' : 'Пересобрать каталог' }}
            </button>
          </div>
        </div>

        <!-- ═══ Posts ═══ -->
        <div v-if="activeTab === 'posts'" class="page">
          <h2>Управление постами</h2>
          <p class="page-desc">Просмотр и редактирование записей каталога. Изменения сохраняются локально и могут быть отправлены в MAX.</p>

          <div class="panel">
            <div class="er" style="margin-bottom: 12px;">
              <input v-model="postsSearch" class="input" placeholder="Поиск по названию, саду, сорту..." @input="onPostsSearch">
              <button class="btn-secondary" @click="loadPosts">Обновить</button>
            </div>

            <div class="posts-info">{{ postsTotal }} записей{{ postsSearch ? ` по запросу "${postsSearch}"` : '' }}</div>

            <div class="posts-list">
              <div v-for="post in posts" :key="post.id" class="post-row" @click="openEditPost(post)">
                <img v-if="post.thumbs[0]" :src="photoUrl(post.thumbs[0])" class="post-thumb" alt="">
                <div v-else class="post-thumb post-thumb-empty" />
                <div class="post-info">
                  <div class="post-name">
                    {{ post.cultivar || post.latin_full }}
                    <span v-if="post.is_new" class="post-badge new">NEW</span>
                    <span v-if="post.is_russian_enriched" class="post-badge ru">RU</span>
                  </div>
                  <div class="post-meta">{{ post.species_ru }} · {{ post.region_normalized || post.region || '—' }} · {{ post.date }}</div>
                  <div class="post-meta">{{ post.garden_display || '—' }}{{ post.form_ru ? ' · ' + post.form_ru : '' }}{{ post.color_ru ? ' · ' + post.color_ru : '' }}</div>
                </div>
                <div class="post-id">#{{ post.id }}</div>
              </div>
            </div>

            <!-- Pagination -->
            <div v-if="postsPages > 1" class="pagination">
              <button class="pg-btn" :disabled="postsPage <= 1" @click="postsPage--; loadPosts()">←</button>
              <span class="pg-info">{{ postsPage }} / {{ postsPages }}</span>
              <button class="pg-btn" :disabled="postsPage >= postsPages" @click="postsPage++; loadPosts()">→</button>
            </div>
          </div>

          <!-- Edit modal -->
          <Teleport to="body">
            <Transition name="modal">
              <div v-if="editingPost" class="modal-overlay" @click.self="editingPost = null">
                <div class="modal">
                  <div class="modal-head">
                    <h3>Редактировать #{{ editingPost.id }}</h3>
                    <button class="modal-close" @click="editingPost = null">✕</button>
                  </div>
                  <div class="modal-body">
                    <div class="edit-preview">
                      <img v-if="editingPost.thumbs[0]" :src="photoUrl(editingPost.thumbs[0])" class="edit-img" alt="">
                      <div class="edit-current">
                        <strong>{{ editingPost.latin_full }}</strong>
                        <div style="font-size: 12px; color: #888; margin-top: 2px;">
                          {{ editingPost.species_ru }} · {{ editingPost.garden_display }}
                        </div>
                        <a v-if="editingPost.max_url" :href="editingPost.max_url" target="_blank" class="edit-max-link">Открыть в MAX ↗</a>
                      </div>
                    </div>

                    <div class="eg">
                      <label class="eg-label">Текст поста</label>
                      <p style="font-size: 11px; color: #999; margin-bottom: 8px;">
                        Первая строка = латинское название. Далее: русское название, регион, возраст, сад, хештеги. После сохранения каталог пересобирается автоматически.
                      </p>
                      <textarea v-model="editText" class="edit-textarea" rows="12" />
                    </div>

                    <div class="eg" style="margin-top: -4px;">
                      <label class="eg-label">Синхронизация с MAX</label>
                      <p style="font-size: 11px; color: #999;">
                        Если указан токен бота — пост будет также отредактирован в канале MAX. Без токена — только локально.
                      </p>
                    </div>
                  </div>
                  <div class="modal-foot">
                    <button class="btn-secondary" @click="editingPost = null">Отмена</button>
                    <button class="btn-primary" :disabled="saving" @click="savePost">
                      {{ saving ? 'Сохранение...' : 'Сохранить' }}
                    </button>
                  </div>
                </div>
              </div>
            </Transition>
          </Teleport>
        </div>

        <!-- ═══ Banner ═══ -->
        <div v-if="activeTab === 'banner'" class="page">
          <div class="page-head">
            <h2>Баннер-слайдер</h2>
            <button class="pill" :class="bannerConfig.enabled ? 'pill-on' : 'pill-off'" @click="toggleBanner">
              {{ bannerConfig.enabled ? 'Включён' : 'Выключен' }}
            </button>
          </div>

          <div class="panel">
            <p class="panel-desc">Баннер редактируется визуально на главной странице. Нажмите кнопку ниже, чтобы открыть редактор.</p>
            <div class="btn-row" style="margin-top: 12px;">
              <NuxtLink to="/" class="btn-primary" style="text-decoration: none; display: inline-flex; align-items: center; gap: 8px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                Открыть редактор баннера
              </NuxtLink>
            </div>
            <p class="panel-desc" style="margin-top: 12px; font-size: 12px;">На главной нажмите кнопку-карандаш на баннере для входа в режим редактирования.</p>
          </div>

          <div class="panel" style="margin-top: 16px;">
            <h3>Слайды ({{ bannerConfig.slides.length }})</h3>
            <div class="slides-grid">
              <div v-for="(slide, i) in bannerConfig.slides" :key="i" class="slide-thumb">
                <div class="thumb-preview" :style="thumbStyle(slide)">
                  <span class="thumb-title">{{ slide.title || slide.elements?.[0]?.content || 'Слайд' }}</span>
                </div>
                <div class="thumb-bar">
                  <span>Слайд {{ i + 1 }}</span>
                  <button class="thumb-del" @click.stop="deleteSlide(i)">✕</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ═══ Exchange ═══ -->
        <div v-if="activeTab === 'exchange'" class="page">
          <h2>Модерация обмена</h2>
          <p class="page-desc">Управление объявлениями на доске обмена растениями</p>

          <div class="panel">
            <div class="posts-info">{{ exchangePosts.length }} объявлений</div>
            <div v-if="exchangePosts.length === 0" style="color: #888; font-size: 14px; padding: 20px 0;">Объявлений пока нет</div>
            <div class="posts-list">
              <div v-for="ep in exchangePosts" :key="ep.id" class="post-row">
                <div class="exchange-type-badge" :class="ep.type">{{ ep.type === 'looking' ? 'Ищу' : 'Предлагаю' }}</div>
                <div class="post-info">
                  <div class="post-name">{{ ep.plantName }}</div>
                  <div class="post-meta">{{ ep.region || '—' }} · {{ ep.contact }} · {{ formatDate(ep.createdAt) }}</div>
                  <div v-if="ep.description" class="post-meta">{{ ep.description }}</div>
                </div>
                <button class="thumb-del" @click="deleteExchangePost(ep.id)" title="Удалить">✕</button>
              </div>
            </div>
          </div>
        </div>

        <!-- ═══ Diary ═══ -->
        <div v-if="activeTab === 'diary'" class="page">
          <h2>Модерация дневника роста</h2>
          <p class="page-desc">Загруженные пользователями фото роста растений</p>

          <div class="panel">
            <div class="posts-info">{{ diaryEntries.length }} записей</div>
            <div v-if="diaryEntries.length === 0" style="color: #888; font-size: 14px; padding: 20px 0;">Записей пока нет</div>
            <div class="diary-grid">
              <div v-for="de in diaryEntries" :key="de.id" class="diary-card">
                <img :src="`/uploads/growth/${de.photoFilename}`" class="diary-img" alt="">
                <div class="diary-info">
                  <div class="post-name">Растение #{{ de.plantId }}</div>
                  <div class="post-meta">{{ de.year }} год · {{ de.authorContact || '—' }}</div>
                  <div v-if="de.comment" class="post-meta">{{ de.comment }}</div>
                  <div class="post-meta">{{ formatDate(de.createdAt) }}</div>
                </div>
                <button class="thumb-del" @click="deleteDiaryEntry(de.id)" title="Удалить">✕</button>
              </div>
            </div>
          </div>
        </div>

        <!-- ═══ Conditions ═══ -->
        <div v-if="activeTab === 'conditions'" class="page">
          <h2>Условия выращивания</h2>
          <p class="page-desc">Настройте условия выращивания по виду растения. Условия применяются ко всем растениям этого вида.</p>
          <p class="page-desc" style="margin-top: 4px; font-size: 12px; color: var(--text-muted);">Заполнено: {{ condFilledCount }} из {{ speciesList.length }} видов</p>

          <div class="cond-layout">
            <!-- Species list -->
            <div class="cond-sidebar">
              <input v-model="condSpeciesSearch" type="text" class="input" placeholder="Поиск вида..." style="margin-bottom: 8px;">
              <div class="cond-species-list">
                <button
                  v-for="sp in filteredSpecies"
                  :key="sp.speciesFull"
                  class="cond-species-item"
                  :class="{ active: condSelectedSpecies === sp.speciesFull, filled: conditionsData.species[sp.speciesFull] }"
                  @click="selectCondSpecies(sp.speciesFull)"
                >
                  <div class="cond-sp-name">{{ sp.speciesFull }}</div>
                  <div class="cond-sp-meta">{{ sp.speciesRu }} · {{ sp.count }}</div>
                  <span v-if="conditionsData.species[sp.speciesFull]" class="cond-sp-badge">✓</span>
                </button>
              </div>
            </div>

            <!-- Editor -->
            <div class="cond-editor">
              <div v-if="!condSelectedSpecies" class="cond-empty">Выберите вид слева</div>
              <template v-else>
                <h3 style="margin-bottom: 4px;">{{ condSelectedSpecies }}</h3>
                <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 20px;">{{ speciesList.find(s => s.speciesFull === condSelectedSpecies)?.speciesRu }}</p>

                <!-- Light -->
                <div class="cond-group">
                  <label class="cond-group-label">Освещённость</label>
                  <div class="cond-options">
                    <button class="cond-opt" :class="{ active: condEditing.light === 'full_sun' }" @click="toggleCondValue('light', 'full_sun')" style="--opt-bg: #FFF8E1; --opt-color: #F57F17;">☀️ Полное солнце</button>
                    <button class="cond-opt" :class="{ active: condEditing.light === 'partial_shade' }" @click="toggleCondValue('light', 'partial_shade')" style="--opt-bg: #E8F5E9; --opt-color: #2E7D32;">⛅ Полутень</button>
                    <button class="cond-opt" :class="{ active: condEditing.light === 'shade' }" @click="toggleCondValue('light', 'shade')" style="--opt-bg: #E3F2FD; --opt-color: #1565C0;">☁️ Тень</button>
                  </div>
                </div>

                <!-- Moisture -->
                <div class="cond-group">
                  <label class="cond-group-label">Влажность</label>
                  <div class="cond-options">
                    <button class="cond-opt" :class="{ active: condEditing.moisture === 'loves_water' }" @click="toggleCondValue('moisture', 'loves_water')" style="--opt-bg: #E3F2FD; --opt-color: #1565C0;">💧 Влаголюбивое</button>
                    <button class="cond-opt" :class="{ active: condEditing.moisture === 'moderate' }" @click="toggleCondValue('moisture', 'moderate')" style="--opt-bg: #E8F5E9; --opt-color: #2E7D32;">💧 Умеренный полив</button>
                    <button class="cond-opt" :class="{ active: condEditing.moisture === 'drought_tolerant' }" @click="toggleCondValue('moisture', 'drought_tolerant')" style="--opt-bg: #FFF8E1; --opt-color: #F57F17;">🏜️ Засухоустойчивое</button>
                  </div>
                </div>

                <!-- Wind -->
                <div class="cond-group">
                  <label class="cond-group-label">Ветер</label>
                  <div class="cond-options">
                    <button class="cond-opt" :class="{ active: condEditing.wind === 'wind_resistant' }" @click="toggleCondValue('wind', 'wind_resistant')" style="--opt-bg: #E8EAF6; --opt-color: #283593;">💨 Ветроустойчивое</button>
                    <button class="cond-opt" :class="{ active: condEditing.wind === 'needs_shelter' }" @click="toggleCondValue('wind', 'needs_shelter')" style="--opt-bg: #FCE4EC; --opt-color: #C62828;">🏠 Нужен затишек</button>
                  </div>
                </div>

                <!-- Winter -->
                <div class="cond-group">
                  <label class="cond-group-label">Зимовка</label>
                  <div class="cond-options">
                    <button class="cond-opt" :class="{ active: condEditing.winter === 'hardy' }" @click="toggleCondValue('winter', 'hardy')" style="--opt-bg: #E8F5E9; --opt-color: #2E7D32;">🛡️ Зимует без укрытия</button>
                    <button class="cond-opt" :class="{ active: condEditing.winter === 'needs_cover' }" @click="toggleCondValue('winter', 'needs_cover')" style="--opt-bg: #FCE4EC; --opt-color: #C62828;">❄️ Укрытие на зиму</button>
                  </div>
                </div>

                <!-- Soil -->
                <div class="cond-group">
                  <label class="cond-group-label">Почва (можно несколько)</label>
                  <div class="cond-options">
                    <button class="cond-opt" :class="{ active: condEditing.soil?.includes('any') }" @click="toggleSoil('any')" style="--opt-bg: #EFEBE9; --opt-color: #4E342E;">🌍 Любая</button>
                    <button class="cond-opt" :class="{ active: condEditing.soil?.includes('acidic') }" @click="toggleSoil('acidic')" style="--opt-bg: #F3E5F5; --opt-color: #6A1B9A;">🧪 Кислая</button>
                    <button class="cond-opt" :class="{ active: condEditing.soil?.includes('alkaline') }" @click="toggleSoil('alkaline')" style="--opt-bg: #E8EAF6; --opt-color: #283593;">🧪 Щелочная</button>
                    <button class="cond-opt" :class="{ active: condEditing.soil?.includes('well_drained') }" @click="toggleSoil('well_drained')" style="--opt-bg: #FFF8E1; --opt-color: #F57F17;">🪨 Дренированная</button>
                  </div>
                </div>

                <!-- Actions -->
                <div style="display: flex; gap: 10px; margin-top: 24px;">
                  <button class="btn-primary" :disabled="condSaving" @click="saveConditions">{{ condSaving ? 'Сохранение...' : 'Сохранить' }}</button>
                  <button v-if="conditionsData.species[condSelectedSpecies]" class="btn-danger" @click="deleteConditions">Удалить</button>
                </div>
              </template>
            </div>
          </div>
        </div>

        <!-- Old modal editor removed — editing happens via the visual editor on the homepage -->
        <!-- ═══ Users ═══ -->
        <div v-if="activeTab === 'users'" class="page">
          <UserManagement />
        </div>

      </main>
    </div>
  </div>
</template>

<style scoped>
.admin { min-height: 100dvh; background: #f0f2f5; }

/* ── Login ────────────────────── */
.login { display: flex; align-items: center; justify-content: center; min-height: 100dvh; padding: 20px; }
.login-card { background: #fff; border-radius: 16px; padding: 40px 32px; width: 100%; max-width: 360px; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
.login-logo { height: 48px; margin-bottom: 16px; }
.login-card h1 { font-size: 22px; margin-bottom: 20px; }

/* ── Layout ───────────────────── */
.admin-layout { display: flex; min-height: 100dvh; }

.sidebar { width: 220px; background: #1a1f2e; color: #fff; display: flex; flex-direction: column; flex-shrink: 0; position: sticky; top: 0; height: 100dvh; }
.sidebar-brand { display: flex; align-items: center; gap: 10px; padding: 16px; border-bottom: 1px solid rgba(255,255,255,0.08); }
.sidebar-logo { height: 28px; filter: brightness(0) invert(1); opacity: 0.8; }
.sidebar-brand span { font-size: 14px; font-weight: 700; opacity: 0.9; }
.sidebar-user { padding: 8px 16px; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: space-between; }
.user-name { font-size: 12px; color: rgba(255,255,255,0.7); }
.btn-logout { font-size: 11px; color: rgba(255,255,255,0.5); background: none; border: 1px solid rgba(255,255,255,0.15); padding: 3px 10px; border-radius: 6px; cursor: pointer; }
.btn-logout:hover { color: #fff; border-color: rgba(255,255,255,0.4); }
.sidebar-nav { flex: 1; padding: 8px; }
.sidebar-footer { padding: 8px; border-top: 1px solid rgba(255,255,255,0.08); }

.nav-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; border-radius: 8px; background: none; border: none; color: rgba(255,255,255,0.6); font-size: 13px; cursor: pointer; transition: all 0.12s; text-decoration: none; }
.nav-item:hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.9); }
.nav-item.active { background: rgba(26,86,50,0.4); color: #fff; }
.nav-icon { width: 22px; display: flex; align-items: center; justify-content: center; }

.content { flex: 1; padding: 24px; overflow-y: auto; }

@media (max-width: 768px) {
  .admin-layout { flex-direction: column; }
  .sidebar { width: 100%; height: auto; position: static; flex-direction: row; align-items: center; overflow-x: auto; }
  .sidebar-brand { display: none; }
  .sidebar-nav { display: flex; flex: 1; padding: 4px; gap: 2px; }
  .sidebar-footer { display: none; }
  .nav-item { flex-direction: column; gap: 2px; padding: 8px 12px; font-size: 10px; white-space: nowrap; }
  .nav-label { font-size: 10px; }
  .content { padding: 16px; }
}

/* ── Page ─────────────────────── */
.page h2 { font-size: 22px; font-weight: 700; margin-bottom: 20px; }
.page-desc { font-size: 14px; color: #666; margin: -12px 0 20px; }
.page-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.page-head h2 { margin: 0; }

/* ── Stats cards ──────────────── */
.cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; margin-bottom: 20px; }
.stat-card { background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
.stat-card.accent { border-left: 4px solid #ff6d00; }
.stat-value { font-size: 28px; font-weight: 800; color: var(--primary); }
.stat-card.accent .stat-value { color: #ff6d00; }
.stat-label { font-size: 12px; color: #888; margin-top: 4px; }

/* ── Panel ────────────────────── */
.panel { background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); margin-bottom: 16px; }
.panel h3 { font-size: 15px; font-weight: 700; margin-bottom: 12px; }
.panel-desc { font-size: 13px; color: #888; margin: -4px 0 14px; }

.info-list { display: flex; flex-direction: column; }
.info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f2f5; font-size: 13px; }
.info-row span { color: #888; }
.info-row strong { color: #333; }

.genera-grid { display: flex; flex-wrap: wrap; gap: 6px; }
.genus-chip { padding: 4px 12px; background: #f0f2f5; border-radius: 16px; font-size: 12px; color: #555; }
.genus-chip strong { color: var(--primary); margin-left: 4px; }

.log-box { background: #1a1f2e; color: #a0d0b0; padding: 14px; border-radius: 8px; font-size: 11px; line-height: 1.5; overflow-x: auto; max-height: 300px; overflow-y: auto; white-space: pre; margin-top: 12px; }

/* Sync results */
.sync-results { margin-top: 16px; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
.sync-results-header { padding: 12px 16px; font-weight: 700; font-size: 14px; }
.sync-results-header.done { background: #e8f5e9; color: #2e7d32; }
.sync-results-header.error { background: #fce4ec; color: #c62828; }
.sync-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: var(--border); }
@media (max-width: 600px) { .sync-stats { grid-template-columns: repeat(2, 1fr); } }
.sync-stat { background: var(--bg); padding: 16px; text-align: center; }
.sync-stat-num { display: block; font-size: 24px; font-weight: 800; color: var(--text); line-height: 1.2; }
.sync-stat-num.highlight { color: var(--primary); }
.sync-stat-label { font-size: 11px; color: var(--text-secondary); margin-top: 4px; display: block; }
.sync-changes { padding: 12px 16px; border-top: 1px solid var(--border); }
.sync-changes-title { font-size: 12px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
.sync-change-item { font-size: 13px; padding: 4px 8px; border-radius: 6px; margin-bottom: 4px; display: block; }
.sync-change-item.new { background: #e8f5e9; color: #2e7d32; }
.sync-change-item.updated { background: #e3f2fd; color: #1565c0; }
.sync-change-item.relinked { background: #fff3e0; color: #e65100; }
.sync-link { text-decoration: none; cursor: pointer; transition: opacity 0.15s; }
.sync-link:hover { opacity: 0.7; text-decoration: underline; }
.sync-log-details { padding: 12px 16px; border-top: 1px solid var(--border); }
.sync-log-details summary { cursor: pointer; font-size: 13px; color: var(--text-secondary); user-select: none; }
.sync-log-details summary:hover { color: var(--text); }
.sync-progress { margin: 16px 0; }

/* ── Forms ────────────────────── */
.field { margin-bottom: 14px; }
.field label { display: block; font-size: 12px; font-weight: 600; color: #888; margin-bottom: 6px; }
.input { width: 100%; padding: 10px 14px; border: 1.5px solid #ddd; border-radius: 8px; font-size: 14px; color: #333; outline: none; background: #fff; }
.input:focus { border-color: var(--primary); }
.input.sm { width: auto; padding: 8px 12px; font-size: 13px; }
.mt { margin-top: 8px; }

.btn-row { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
.btn-row.wrap { flex-wrap: wrap; }

.btn-primary { padding: 10px 22px; background: var(--primary); color: #fff; border: none; border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer; }
.btn-primary:hover { background: #145028; }
.btn-primary:disabled { opacity: 0.5; }
.btn-primary.full { width: 100%; margin-top: 12px; }

.btn-secondary { padding: 10px 22px; background: #fff; border: 1.5px solid #ddd; border-radius: 8px; font-size: 13px; font-weight: 500; color: #555; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
.btn-secondary:hover { border-color: var(--primary); color: var(--primary); }

.btn-danger { padding: 10px 22px; background: #fff; border: 1.5px solid #fcc; border-radius: 8px; font-size: 13px; font-weight: 500; color: #c62828; cursor: pointer; }
.btn-danger:hover { background: #fce4ec; }

/* ── Maintenance panel ────────── */
.maintenance-panel { transition: border-color 0.2s, background 0.2s; }
.maintenance-active { border-color: #c62828; background: #fff5f5; }
.maintenance-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.maintenance-header h3 { margin-bottom: 2px; }
.btn-maintenance { white-space: nowrap; flex-shrink: 0; padding: 10px 22px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }

/* ── Consent ─────────────────── */
.consent-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
.consent-list { display: flex; flex-direction: column; gap: 2px; max-height: 600px; overflow-y: auto; }
.consent-row { padding: 10px 12px; border-radius: 8px; transition: background 0.15s; }
.consent-row:hover { background: var(--bg-alt, #f5f5f5); }
.consent-row.consented { background: #e8f5e9; }
.consent-toggle { display: flex; align-items: center; gap: 12px; cursor: pointer; }
.consent-name { flex: 1; font-size: 14px; font-weight: 500; }
.consent-count { font-size: 12px; color: #999; white-space: nowrap; }
.consent-row { cursor: pointer; }
.consent-warning { background: #fff3e0; border: 1px solid #ffcc02; border-radius: 8px; padding: 12px 16px; font-size: 13px; color: #e65100; font-weight: 500; margin-bottom: 16px; }
.consent-apply-bar { position: sticky; bottom: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; margin: 12px -16px -16px; background: #f5f5f5; border-top: 1px solid #ddd; border-radius: 0 0 12px 12px; font-size: 13px; color: #666; }
.consent-actions { display: flex; gap: 6px; margin-bottom: 12px; }
.btn-sm { padding: 5px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
.btn-green { background: #2e7d32; color: #fff; border: none; }
.btn-green:hover { background: #1b5e20; }
.btn-outline { background: none; border: 1.5px solid #ccc; color: #666; }
.btn-outline:hover { border-color: #999; color: #333; }
.consent-link-btn { background: none; border: none; color: #bbb; cursor: pointer; padding: 4px; border-radius: 4px; transition: all 0.15s; flex-shrink: 0; }
.consent-link-btn:hover { color: #1a5632; background: rgba(26,86,50,0.08); }

.pill { padding: 5px 14px; border-radius: 20px; border: none; font-size: 12px; font-weight: 700; cursor: pointer; }
.pill-on { background: #e8f5e9; color: #2e7d32; }
.pill-off { background: #fce4ec; color: #c62828; }

/* ── Toast ────────────────────── */
.toast { padding: 12px 16px; border-radius: 8px; font-size: 13px; font-weight: 500; margin-bottom: 16px; }
.toast.ok { background: #e8f5e9; color: #2e7d32; }
.toast.err { background: #fce4ec; color: #c62828; }

/* ── Banner slides ────────────── */
.slides-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
.slide-thumb { border-radius: 10px; overflow: hidden; border: 2px solid #ddd; cursor: pointer; transition: border-color 0.15s; background: #fff; }
.slide-thumb:hover { border-color: var(--primary); }
.thumb-preview { aspect-ratio: 16/7; display: flex; align-items: center; justify-content: center; padding: 12px; color: #fff; }
.thumb-title { font-weight: 700; text-shadow: 0 1px 4px rgba(0,0,0,0.3); font-size: 12px; text-align: center; }
.thumb-bar { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; font-size: 12px; color: #888; }
.thumb-del { background: none; border: none; color: #ccc; cursor: pointer; font-size: 14px; }
.thumb-del:hover { color: #c62828; }
.slide-add { border-radius: 10px; border: 2px dashed #ddd; display: flex; align-items: center; justify-content: center; padding: 24px; color: #aaa; cursor: pointer; font-size: 14px; background: none; aspect-ratio: 16/7; }
.slide-add:hover { border-color: var(--primary); color: var(--primary); }

/* ── Modal ────────────────────── */
.modal-overlay { position: fixed; inset: 0; z-index: 300; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; padding: 16px; }
.modal { background: #fff; border-radius: 16px; width: 100%; max-width: 600px; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 16px 48px rgba(0,0,0,0.2); }
.modal-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid #eee; }
.modal-head h3 { font-size: 16px; }
.modal-close { background: none; border: none; font-size: 18px; color: #999; cursor: pointer; }
.modal-body { flex: 1; overflow-y: auto; padding: 20px; }
.modal-foot { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 20px; border-top: 1px solid #eee; }

/* Preview */
.preview-frame { border-radius: 10px; overflow: hidden; border: 1px solid #eee; margin-bottom: 16px; }
.preview-slide { position: relative; min-height: 120px; display: flex; align-items: center; padding: 20px; color: #fff; }
.preview-overlay { position: absolute; inset: 0; background: #000; }
.preview-content { position: relative; z-index: 1; width: 100%; }
.preview-content.align-center { text-align: center; }
.preview-content.align-right { text-align: right; }
.pv-title { font-size: 16px; font-weight: 800; margin-bottom: 4px; text-shadow: 0 1px 4px rgba(0,0,0,0.2); }
.pv-sub { font-size: 11px; opacity: 0.8; margin-bottom: 8px; }
.pv-btn { display: inline-block; padding: 5px 14px; background: rgba(255,255,255,0.9); color: var(--primary); border-radius: 14px; font-size: 10px; font-weight: 700; }

/* Editor groups */
.eg { margin-bottom: 14px; }
.eg-label { display: block; font-size: 11px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 8px; }
.eg-sm { font-size: 11px; color: #999; }
.er { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.cf { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #666; cursor: pointer; }
.ci { width: 28px; height: 28px; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; padding: 1px; }
.range { flex: 1; accent-color: var(--primary); }
.presets { display: flex; gap: 6px; }
.preset { width: 44px; height: 28px; border-radius: 6px; border: 2px solid #ddd; cursor: pointer; }
.preset:hover { border-color: var(--primary); }

/* ── Progress bar ─────────────── */
.progress-wrap { margin: 16px 0; }

.progress-bar {
  height: 8px; background: #e8ece8; border-radius: 4px; overflow: hidden;
}

.progress-fill {
  height: 100%; background: linear-gradient(90deg, var(--primary), #4db8a4);
  border-radius: 4px;
  transition: width 0.4s ease;
}

.progress-info {
  display: flex; justify-content: space-between; margin-top: 8px;
}

.progress-text { font-size: 13px; color: #555; }
.progress-pct { font-size: 13px; font-weight: 700; color: var(--primary); }

/* ── Posts ─────────────────────── */
.posts-info { font-size: 12px; color: #888; margin-bottom: 10px; }

.posts-list { display: flex; flex-direction: column; gap: 2px; }

.post-row {
  display: flex; align-items: center; gap: 12px;
  padding: 10px; border-radius: 8px; cursor: pointer;
  transition: background 0.1s;
}
.post-row:hover { background: #f5f7f9; }

.post-thumb { width: 44px; height: 44px; border-radius: 8px; object-fit: cover; flex-shrink: 0; }
.post-thumb-empty { background: #eee; }

.post-info { flex: 1; min-width: 0; }
.post-name { font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.post-meta { font-size: 11px; color: #888; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.post-badge { font-size: 8px; font-weight: 800; padding: 1px 5px; border-radius: 4px; letter-spacing: 0.3px; }
.post-badge.new { background: #fff3e0; color: #ff6d00; }
.post-badge.ru { background: #fce4ec; color: #c62828; }

.post-id { font-size: 11px; color: #ccc; font-weight: 600; flex-shrink: 0; }

.pagination { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 16px 0; }
.pg-btn { width: 36px; height: 36px; border-radius: 8px; background: #fff; border: 1px solid #ddd; cursor: pointer; font-size: 14px; }
.pg-btn:disabled { opacity: 0.3; }
.pg-info { font-size: 13px; color: #888; }

/* Edit modal extras */
.edit-preview { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 16px; padding: 12px; background: #f5f7f9; border-radius: 10px; }
.edit-img { width: 64px; height: 64px; border-radius: 8px; object-fit: cover; flex-shrink: 0; }
.edit-current { flex: 1; min-width: 0; }
.edit-current strong { font-size: 14px; display: block; }
.edit-max-link { display: inline-block; margin-top: 6px; font-size: 11px; color: var(--primary); font-weight: 600; }
.edit-textarea { width: 100%; padding: 12px; border: 1.5px solid #ddd; border-radius: 8px; font-size: 13px; font-family: monospace; line-height: 1.6; resize: vertical; outline: none; }
.edit-textarea:focus { border-color: var(--primary); }

/* ── Exchange moderation ──────── */
.exchange-type-badge {
  padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; flex-shrink: 0; white-space: nowrap;
}
.exchange-type-badge.looking { background: #fff3e0; color: #e65100; }
.exchange-type-badge.offering { background: #e8f5e9; color: #2e7d32; }

/* ── Diary moderation ────────── */
.diary-grid { display: flex; flex-direction: column; gap: 8px; }
.diary-card {
  display: flex; align-items: center; gap: 12px;
  padding: 10px; border-radius: 8px;
  transition: background 0.1s;
}
.diary-card:hover { background: #f5f7f9; }
.diary-img { width: 56px; height: 56px; border-radius: 8px; object-fit: cover; flex-shrink: 0; }

/* Transitions */
.modal-enter-active { transition: opacity 0.2s; }
.modal-enter-active .modal { transition: transform 0.2s; }
.modal-leave-active { transition: opacity 0.15s; }
.modal-enter-from { opacity: 0; }
.modal-enter-from .modal { transform: scale(0.95) translateY(10px); }
.modal-leave-to { opacity: 0; }

/* ── Conditions ─────────────── */
.cond-layout { display: flex; gap: 24px; margin-top: 16px; }
.cond-sidebar { width: 320px; flex-shrink: 0; }
.cond-editor { flex: 1; min-width: 0; }

@media (max-width: 768px) {
  .cond-layout { flex-direction: column; }
  .cond-sidebar { width: 100%; }
}

.cond-species-list { max-height: 600px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
.cond-species-item {
  display: flex; flex-wrap: wrap; align-items: center; gap: 4px;
  width: 100%; padding: 10px 12px; background: var(--bg); border: 1px solid var(--border-light);
  border-radius: 8px; text-align: left; cursor: pointer; transition: all 0.15s; position: relative;
}
.cond-species-item:hover { border-color: var(--primary-light); }
.cond-species-item.active { border-color: var(--primary); background: rgba(26, 86, 50, 0.05); }
.cond-species-item.filled { border-left: 3px solid var(--primary); }
.cond-sp-name { font-size: 13px; font-weight: 600; font-style: italic; width: 100%; }
.cond-sp-meta { font-size: 11px; color: var(--text-muted); width: 100%; }
.cond-sp-badge { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); font-size: 12px; color: var(--primary); font-weight: 700; }

.cond-empty { padding: 48px; text-align: center; color: var(--text-muted); }

.cond-group { margin-bottom: 20px; }
.cond-group-label { display: block; font-size: 12px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
.cond-options { display: flex; flex-wrap: wrap; gap: 8px; }
.cond-opt {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 14px; border-radius: 20px; font-size: 13px; font-weight: 500;
  background: var(--bg-alt); border: 1.5px solid var(--border); color: var(--text-secondary);
  cursor: pointer; transition: all 0.15s;
}
.cond-opt:hover { border-color: var(--opt-color, var(--primary)); color: var(--opt-color, var(--primary)); }
.cond-opt.active { background: var(--opt-bg, var(--bg-alt)); border-color: var(--opt-color, var(--primary)); color: var(--opt-color, var(--primary)); font-weight: 600; }

.btn-danger { padding: 10px 20px; background: #fff; border: 1.5px solid #d44; color: #d44; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; }
.btn-danger:hover { background: #d44; color: #fff; }
</style>
