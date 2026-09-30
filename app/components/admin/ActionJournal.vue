<script setup lang="ts">
interface Change { field: string; from?: string; to?: string }
interface Entry {
  ts: string
  user: string
  displayName?: string
  role?: string
  action: string
  targetId?: string | number
  title?: string
  changes?: Change[]
  note?: string
  ip?: string
  ok?: boolean
}
interface ByUser { user: string; displayName?: string; count: number; last?: string }
interface SubEntry {
  ts: string
  stage: string
  source: string
  author?: string
  admin?: string
  latin?: string
  photos?: number
  channelMid?: string
  ok?: boolean
  error?: string
  text?: string
  aiText?: string
  photoUrls?: string[]
  files?: string[]
}

const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Вход',
  'plant.update': 'Правка карточки',
  'plant.photos': 'Фото',
  'maxtext.update': 'Текст в MAX',
  'buylink.update': 'Ссылка «Купить»',
  'garden.update': 'Правка сада',
  'user.create': 'Создан аккаунт',
  'user.update': 'Изменён аккаунт',
  'user.delete': 'Удалён аккаунт',
}

const FIELD_LABELS: Record<string, string> = {
  latin_full: 'Латинское название',
  name_ru: 'Русское название',
  cultivar: 'Сорт',
  species: 'Вид',
  genus: 'Род (лат.)',
  genus_ru: 'Род (рус.)',
  region: 'Регион',
  age: 'Возраст',
  size: 'Размер',
  garden: 'Сад',
  originator: 'Оригинатор',
  is_russian: 'Российский сорт',
  photos: 'Фото',
}

const STAGE_LABELS: Record<string, string> = {
  received: 'Пришла',
  accepted: 'Принята',
  rejected: 'Отклонена',
  published: 'Опубликована',
  publish_failed: 'НЕ опубликована',
}

const mode = ref<'edits' | 'subs'>('edits')
const loading = ref(false)
const error = ref('')
const search = ref('')

// ── Режим «Правки на сайте» ────────────────
const entries = ref<Entry[]>([])
const byUser = ref<ByUser[]>([])
const total = ref(0)
const page = ref(1)
const pages = ref(1)
const filterUser = ref('')
const filterAction = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await $fetch<{ entries: Entry[]; total: number; pages: number; byUser: ByUser[] }>(
      '/api/admin/action-log',
      { params: { page: page.value, limit: 50, user: filterUser.value, action: filterAction.value, search: search.value } }
    )
    entries.value = data.entries
    byUser.value = data.byUser
    total.value = data.total
    pages.value = data.pages
  } catch (e: any) {
    error.value = e?.data?.message || 'Не удалось загрузить журнал'
  } finally {
    loading.value = false
  }
}

// ── Режим «Заявки бота» ────────────────────
const subs = ref<SubEntry[]>([])
const stuck = ref<SubEntry[]>([])
const failures = ref(0)
const subCounts = ref<Record<string, number>>({})
const subTotal = ref(0)
const subStage = ref('')
const subsLoaded = ref(false)
const archiveMb = ref(0)
const archived = ref(0)
const opened = ref<Set<string>>(new Set())

function toggle(key: string) {
  const next = new Set(opened.value)
  next.has(key) ? next.delete(key) : next.add(key)
  opened.value = next
}

function fileUrl(rel: string) {
  return `/api/admin/submission-file?path=${encodeURIComponent(rel)}`
}

async function copyText(t: string) {
  try { await navigator.clipboard.writeText(t) } catch {}
}

async function loadSubs() {
  loading.value = true
  error.value = ''
  try {
    const d = await $fetch<any>('/api/admin/submissions-log', {
      params: { limit: 60, stage: subStage.value, search: search.value },
    })
    subs.value = d.entries
    stuck.value = d.stuck
    failures.value = d.failures
    subCounts.value = d.counts
    subTotal.value = d.total
    archiveMb.value = d.archiveMb || 0
    archived.value = d.archived || 0
    subsLoaded.value = true
  } catch (e: any) {
    error.value = e?.data?.message || 'Не удалось загрузить журнал заявок'
  } finally {
    loading.value = false
  }
}

function setMode(m: 'edits' | 'subs') {
  mode.value = m
  search.value = ''
  if (m === 'subs' && !subsLoaded.value) loadSubs()
}

function refresh() {
  if (mode.value === 'edits') load()
  else loadSubs()
}

let deb: ReturnType<typeof setTimeout>
function onSearch() {
  clearTimeout(deb)
  deb = setTimeout(() => { page.value = 1; refresh() }, 300)
}

function pickUser(u: string) {
  filterUser.value = filterUser.value === u ? '' : u
  page.value = 1
  load()
}

function setAction(a: string) {
  filterAction.value = a
  page.value = 1
  load()
}

function setStage(st: string) {
  subStage.value = st
  loadSubs()
}

function goPage(d: number) {
  page.value = Math.min(Math.max(1, page.value + d), pages.value)
  load()
}

function actionLabel(a: string) { return ACTION_LABELS[a] || a }
function fieldLabel(f: string) { return FIELD_LABELS[f] || f }
function stageLabel(s: string) { return STAGE_LABELS[s] || s }

function when(ts: string) {
  const d = new Date(ts)
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return 'только что'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} мин назад`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} ч назад`
  return d.toLocaleString('ru', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function exact(ts: string) { return new Date(ts).toLocaleString('ru') }

function initials(e: { displayName?: string; user?: string; author?: string }) {
  const n = (e.displayName || e.user || e.author || '?').trim()
  return n.charAt(0).toUpperCase()
}

const actionsUsed = computed(() => [...new Set(entries.value.map(e => e.action))])

onMounted(load)
</script>

<template>
  <div class="aj">
    <div class="aj-head">
      <div>
        <h2>Журнал</h2>
        <p class="aj-desc">Правки на сайте и полный путь заявок из бота. Пишется автоматически.</p>
      </div>
      <button class="aj-refresh" :disabled="loading" @click="refresh">
        {{ loading ? 'Обновление...' : 'Обновить' }}
      </button>
    </div>

    <div class="aj-modes">
      <button :class="{ on: mode === 'edits' }" @click="setMode('edits')">Правки на сайте</button>
      <button :class="{ on: mode === 'subs' }" @click="setMode('subs')">
        Заявки бота
        <span v-if="stuck.length + failures > 0" class="aj-alarm">{{ stuck.length + failures }}</span>
      </button>
    </div>

    <div v-if="error" class="aj-error">{{ error }}</div>

    <!-- ══════ Правки на сайте ══════ -->
    <div v-show="mode === 'edits'">
      <div v-if="byUser.length" class="aj-people">
        <button
          v-for="u in byUser"
          :key="u.user"
          class="aj-person"
          :class="{ active: filterUser === u.user }"
          @click="pickUser(u.user)"
        >
          <span class="aj-ava">{{ initials(u) }}</span>
          <span class="aj-person-info">
            <span class="aj-person-name">{{ u.displayName || u.user }}</span>
            <span class="aj-person-meta">{{ u.count }} действий<template v-if="u.last"> · {{ when(u.last) }}</template></span>
          </span>
        </button>
      </div>

      <div class="aj-filters">
        <div class="aj-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
          <input v-model="search" type="search" placeholder="Растение, человек, #id..." @input="onSearch">
        </div>
        <div class="aj-chips">
          <button class="aj-chip" :class="{ active: !filterAction }" @click="setAction('')">Все</button>
          <button
            v-for="a in actionsUsed"
            :key="a"
            class="aj-chip"
            :class="{ active: filterAction === a }"
            @click="setAction(a)"
          >{{ actionLabel(a) }}</button>
        </div>
        <button v-if="filterUser || filterAction || search" class="aj-clear" @click="filterUser = ''; filterAction = ''; search = ''; page = 1; load()">
          Сбросить
        </button>
      </div>

      <div class="aj-count">{{ total }} записей</div>

      <div v-if="loading && !entries.length" class="aj-empty">Загрузка...</div>
      <div v-else-if="!entries.length" class="aj-empty">Пока ничего не записано</div>

      <div v-else class="aj-feed">
        <div v-for="(e, i) in entries" :key="e.ts + i" class="aj-item">
          <span class="aj-ava sm">{{ initials(e) }}</span>
          <div class="aj-body">
            <div class="aj-line">
              <strong>{{ e.displayName || e.user }}</strong>
              <span class="aj-act" :class="e.action.split('.')[0]">{{ actionLabel(e.action) }}</span>
              <span v-if="e.title" class="aj-target">{{ e.title }}</span>
              <NuxtLink
                v-if="e.action.startsWith('plant') || e.action.startsWith('maxtext')"
                :to="`/plant/${e.targetId}`"
                target="_blank"
                class="aj-link"
              >#{{ e.targetId }} ↗</NuxtLink>
              <span class="aj-when" :title="exact(e.ts)">{{ when(e.ts) }}</span>
            </div>

            <div v-if="e.changes?.length" class="aj-changes">
              <div v-for="c in e.changes" :key="c.field" class="aj-change">
                <span class="aj-field">{{ fieldLabel(c.field) }}</span>
                <span class="aj-from">{{ c.from || '—' }}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                <span class="aj-to">{{ c.to || '—' }}</span>
              </div>
            </div>

            <div v-if="e.note" class="aj-note" :class="{ warn: e.ok === false }">{{ e.note }}</div>
          </div>
        </div>
      </div>

      <div v-if="pages > 1" class="aj-pager">
        <button class="aj-pg" :disabled="page <= 1" @click="goPage(-1)">←</button>
        <span>{{ page }} / {{ pages }}</span>
        <button class="aj-pg" :disabled="page >= pages" @click="goPage(1)">→</button>
      </div>
    </div>

    <!-- ══════ Заявки бота ══════ -->
    <div v-show="mode === 'subs'">
      <div v-if="stuck.length" class="aj-alert warn">
        <strong>Зависшие заявки: {{ stuck.length }}</strong>
        <div v-for="(s, i) in stuck.slice(0, 8)" :key="i" class="aj-alert-row">
          {{ s.latin || 'без названия' }} — от {{ s.author || '?' }}, принял(а) {{ s.admin || '?' }}, {{ when(s.ts) }}
        </div>
      </div>

      <div v-if="failures" class="aj-alert err">
        <strong>Ошибок публикации за сутки: {{ failures }}</strong>
      </div>

      <div class="aj-filters">
        <div class="aj-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
          <input v-model="search" type="search" placeholder="Растение, автор, админ..." @input="onSearch">
        </div>
        <div class="aj-chips">
          <button class="aj-chip" :class="{ active: !subStage }" @click="setStage('')">Все</button>
          <button
            v-for="(cnt, st) in subCounts"
            :key="st"
            class="aj-chip"
            :class="{ active: subStage === String(st), danger: st === 'publish_failed' }"
            @click="setStage(String(st))"
          >{{ stageLabel(String(st)) }} <span class="aj-fc">{{ cnt }}</span></button>
        </div>
      </div>

      <div class="aj-count">
        {{ subTotal }} записей · в архиве {{ archived }} фото ({{ archiveMb }} МБ)
      </div>

      <div v-if="loading && !subs.length" class="aj-empty">Загрузка...</div>
      <div v-else-if="!subs.length" class="aj-empty">
        Пока пусто — журнал заполняется по мере работы бота.
        Заявки, обработанные до его обновления, сюда не попали.
      </div>

      <div v-else class="aj-feed">
        <div v-for="(s, i) in subs" :key="s.ts + i" class="aj-item">
          <span class="aj-ava sm" :class="s.stage">{{ initials(s) }}</span>
          <div class="aj-body">
            <div class="aj-line">
              <strong>{{ s.latin || 'без названия' }}</strong>
              <span class="aj-act" :class="s.stage">{{ stageLabel(s.stage) }}</span>
              <span class="aj-src">{{ s.source === 'tg' ? 'Telegram' : 'MAX' }}</span>
              <span class="aj-when" :title="exact(s.ts)">{{ when(s.ts) }}</span>
            </div>
            <div class="aj-meta">
              от {{ s.author || '?' }}<template v-if="s.admin"> · обработал(а) {{ s.admin }}</template><template v-if="s.photos"> · фото: {{ s.photos }}</template><template v-if="s.files?.length"> · <span class="aj-saved">в архиве {{ s.files.length }}</span></template>
            </div>

            <div v-if="s.files?.length" class="aj-thumbs">
              <a
                v-for="(f, k) in s.files"
                :key="f"
                :href="fileUrl(f)"
                target="_blank"
                rel="noopener"
                class="aj-thumb"
                :title="'Открыть фото ' + (k + 1)"
              >
                <img :src="fileUrl(f)" :alt="'Фото ' + (k + 1)" loading="lazy">
              </a>
            </div>

            <div v-if="s.text || s.aiText" class="aj-textwrap">
              <button class="aj-toggle" @click="toggle(s.ts + i)">
                {{ opened.has(s.ts + i) ? 'Скрыть текст' : 'Показать полный текст' }}
              </button>
              <div v-if="opened.has(s.ts + i)" class="aj-texts">
                <div v-if="s.text" class="aj-textblock">
                  <div class="aj-textlabel">
                    Как прислал автор
                    <button class="aj-copy" @click="copyText(s.text!)">копировать</button>
                  </div>
                  <pre>{{ s.text }}</pre>
                </div>
                <div v-if="s.aiText" class="aj-textblock">
                  <div class="aj-textlabel">
                    Текст для канала
                    <button class="aj-copy" @click="copyText(s.aiText!)">копировать</button>
                  </div>
                  <pre>{{ s.aiText }}</pre>
                </div>
                <div v-if="s.photoUrls?.length" class="aj-urls">
                  Исходные ссылки MAX:
                  <a v-for="(u, k) in s.photoUrls" :key="u" :href="u" target="_blank" rel="noopener">{{ k + 1 }}</a>
                </div>
              </div>
            </div>

            <div v-if="s.error" class="aj-note warn">{{ s.error }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.aj-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 14px; flex-wrap: wrap; }
.aj-head h2 { font-size: 18px; font-weight: 700; }
.aj-desc { font-size: 13px; color: var(--text-muted); margin-top: 2px; }
.aj-refresh { padding: 8px 14px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg); font-size: 13px; font-weight: 600; cursor: pointer; color: var(--text-secondary); }
.aj-refresh:disabled { opacity: 0.6; }
.aj-error { padding: 10px 14px; border-radius: 10px; background: #fce4ec; color: #c62828; font-size: 13px; margin-bottom: 12px; }

/* Режимы */
.aj-modes { display: flex; gap: 6px; margin-bottom: 16px; background: var(--bg-alt); padding: 4px; border-radius: 12px; width: fit-content; }
.aj-modes button { padding: 8px 16px; border: none; border-radius: 9px; background: none; cursor: pointer; font-size: 13px; font-weight: 600; color: var(--text-secondary); display: inline-flex; align-items: center; gap: 7px; }
.aj-modes button.on { background: var(--bg); color: var(--text); box-shadow: 0 1px 3px rgba(0,0,0,.08); }
.aj-alarm { font-size: 10px; font-weight: 800; padding: 1px 7px; border-radius: 9px; background: #c62828; color: #fff; }

/* Плашки тревоги */
.aj-alert { padding: 12px 14px; border-radius: 12px; margin-bottom: 12px; font-size: 13px; }
.aj-alert.warn { background: #fff8e1; color: #8a5a00; }
.aj-alert.err { background: #fce4ec; color: #c62828; }
.aj-alert-row { font-size: 12px; margin-top: 4px; opacity: .9; }

/* Люди */
.aj-people { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; margin-bottom: 16px; }
.aj-person { display: flex; align-items: center; gap: 10px; flex-shrink: 0; padding: 10px 14px 10px 10px; border: 1px solid var(--border); border-radius: 14px; background: var(--bg); cursor: pointer; text-align: left; transition: border-color .15s, background .15s; }
.aj-person:hover { border-color: var(--primary); }
.aj-person.active { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 8%, var(--bg)); }
.aj-person-info { display: flex; flex-direction: column; }
.aj-person-name { font-size: 13px; font-weight: 600; color: var(--text); }
.aj-person-meta { font-size: 11px; color: var(--text-muted); }

.aj-ava { width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: var(--primary); color: #fff; font-size: 14px; font-weight: 700; }
.aj-ava.sm { width: 28px; height: 28px; font-size: 12px; }
.aj-ava.publish_failed { background: #c62828; }
.aj-ava.published { background: #2e7d32; }
.aj-ava.rejected { background: #78909c; }

/* Фильтры */
.aj-filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 10px; }
.aj-search { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 190px; height: 38px; padding: 0 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg); color: var(--text-muted); }
.aj-search input { flex: 1; min-width: 0; border: none; outline: none; background: none; font-size: 13px; color: var(--text); }
.aj-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.aj-chip { padding: 7px 12px; border: 1px solid var(--border); border-radius: 20px; background: var(--bg); font-size: 12px; font-weight: 600; cursor: pointer; color: var(--text-secondary); }
.aj-chip.active { background: var(--primary); border-color: var(--primary); color: #fff; }
.aj-chip.danger { border-color: #e57373; color: #c62828; }
.aj-chip.danger.active { background: #c62828; border-color: #c62828; color: #fff; }
.aj-fc { font-size: 10px; font-weight: 700; opacity: .7; }
.aj-clear { padding: 7px 12px; border: none; background: none; font-size: 12px; color: var(--primary); cursor: pointer; text-decoration: underline; }

.aj-count { font-size: 12px; color: var(--text-muted); margin-bottom: 10px; }
.aj-empty { padding: 40px 0; text-align: center; color: var(--text-muted); font-size: 14px; line-height: 1.6; }

/* Лента */
.aj-feed { display: flex; flex-direction: column; }
.aj-item { display: flex; gap: 12px; padding: 12px 0; border-top: 1px solid var(--border-light, var(--border)); }
.aj-item:first-child { border-top: none; }
.aj-body { flex: 1; min-width: 0; }
.aj-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; color: var(--text); }
.aj-act { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .3px; padding: 2px 8px; border-radius: 10px; background: var(--bg-alt); color: var(--text-secondary); }
.aj-act.plant { background: #e8f5e9; color: #2e7d32; }
.aj-act.maxtext { background: #fff3e0; color: #e65100; }
.aj-act.auth { background: #e3f2fd; color: #1565c0; }
.aj-act.user { background: #f3e5f5; color: #6a1b9a; }
.aj-act.received { background: var(--bg-alt); color: var(--text-secondary); }
.aj-act.accepted { background: #e3f2fd; color: #1565c0; }
.aj-act.rejected { background: #eceff1; color: #546e7a; }
.aj-act.published { background: #e8f5e9; color: #2e7d32; }
.aj-act.publish_failed { background: #fce4ec; color: #c62828; }
.aj-target { font-style: italic; color: var(--text-secondary); }
.aj-src { font-size: 11px; color: var(--text-muted); }
.aj-meta { font-size: 12px; color: var(--text-muted); margin-top: 3px; }
.aj-link { font-size: 11px; color: var(--primary); }
.aj-when { margin-left: auto; font-size: 11px; color: var(--text-muted); white-space: nowrap; }

.aj-changes { margin-top: 6px; display: flex; flex-direction: column; gap: 3px; }
.aj-change { display: flex; align-items: center; gap: 6px; font-size: 12px; flex-wrap: wrap; }
.aj-field { font-weight: 600; color: var(--text-secondary); min-width: 110px; }
.aj-from { color: #c62828; text-decoration: line-through; opacity: .75; word-break: break-word; }
.aj-to { color: #2e7d32; word-break: break-word; }
.aj-change svg { color: var(--text-muted); flex-shrink: 0; }
.aj-note { margin-top: 4px; font-size: 11px; color: var(--text-muted); }
.aj-note.warn { color: #a06a00; }

.aj-pager { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 16px; font-size: 13px; color: var(--text-secondary); }
.aj-pg { width: 36px; height: 36px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg); cursor: pointer; color: var(--text); }
.aj-pg:disabled { opacity: .4; cursor: default; }

/* Архив заявок */
.aj-saved { color: #2e7d32; font-weight: 600; }
.aj-thumbs { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
.aj-thumb { width: 74px; height: 74px; border-radius: 9px; overflow: hidden; border: 1px solid var(--border); display: block; }
.aj-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.aj-textwrap { margin-top: 8px; }
.aj-toggle { border: none; background: none; padding: 0; font-size: 12px; font-weight: 600; color: var(--primary); cursor: pointer; text-decoration: underline; }
.aj-texts { margin-top: 8px; display: flex; flex-direction: column; gap: 10px; }
.aj-textblock { background: var(--bg-alt); border-radius: 10px; padding: 10px 12px; }
.aj-textlabel { display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .3px; color: var(--text-muted); margin-bottom: 6px; }
.aj-copy { border: none; background: none; font-size: 11px; color: var(--primary); cursor: pointer; text-transform: none; letter-spacing: 0; font-weight: 600; }
.aj-textblock pre { margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; color: var(--text); }
.aj-urls { font-size: 11px; color: var(--text-muted); display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.aj-urls a { color: var(--primary); }
</style>
