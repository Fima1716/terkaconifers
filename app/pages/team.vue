<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'

useHead({ title: 'Команда — Территория Хвойных' })
useSeoMeta({
  description: 'Команда проекта «Территория Хвойных» — коллекционеры, садоводы и разработчики, создающие крупнейший каталог хвойных растений России.',
})

interface TeamLink {
  type: string
  url: string
}

interface TeamMember {
  id: string
  name: string
  role: string
  bio: string
  photo: string
  links: TeamLink[]
  tags: string[]
}

const LINK_TYPES = [
  { value: 'telegram', label: 'Telegram', placeholder: 'https://t.me/username' },
  { value: 'vk', label: 'ВКонтакте', placeholder: 'https://vk.com/username' },
  { value: 'max', label: 'Max', placeholder: 'https://max.im/username' },
  { value: 'email', label: 'Почта', placeholder: 'email@example.com' },
  { value: 'site', label: 'Сайт', placeholder: 'https://example.com' },
] as const

const auth = useAuthStore()
await auth.fetchMe()

const members = ref<TeamMember[]>([])
const loading = ref(true)
const saving = ref(false)
const editingId = ref<string | null>(null)

// Active member for the interactive panel
const activeId = ref<string | null>(null)
const animating = ref(false)

const activeMember = computed(() =>
  members.value.find(m => m.id === activeId.value) || null,
)

function selectMember(id: string) {
  if (id === activeId.value || animating.value) return
  animating.value = true
  activeId.value = id
  setTimeout(() => { animating.value = false }, 350)
}

const editForm = reactive({
  id: '',
  name: '',
  role: '',
  bio: '',
  tagsStr: '',
  links: [] as TeamLink[],
  existingPhoto: '',
})
const editPhotoFile = ref<File | null>(null)
const editPhotoPreview = ref<string | null>(null)

async function loadTeam() {
  loading.value = true
  try {
    const data = await $fetch<{ members: TeamMember[] }>('/api/team')
    members.value = data.members || []
    if (members.value.length && !activeId.value) {
      activeId.value = members.value[0].id
    }
  } catch {
    members.value = []
  }
  loading.value = false
}

await loadTeam()

function photoUrl(member: TeamMember): string {
  if (member.photo) return `/api/team-photo/${member.photo}`
  return ''
}

function linkHref(link: TeamLink): string {
  if (link.type === 'email') {
    return link.url.startsWith('mailto:') ? link.url : `mailto:${link.url}`
  }
  return link.url
}

function linkLabel(type: string): string {
  return LINK_TYPES.find(t => t.value === type)?.label || type
}

function linkPlaceholder(type: string): string {
  return LINK_TYPES.find(t => t.value === type)?.placeholder || 'URL'
}

// Auto-linkify URLs in bio text + sanitize HTML
function linkifyBio(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped.replace(
    /(https?:\/\/[^\s<,)]+)/g,
    '<a href="$1" target="_blank" rel="noopener" class="bio-link">$1</a>',
  )
}

function startEdit(member: TeamMember) {
  editingId.value = member.id
  editForm.id = member.id
  editForm.name = member.name
  editForm.role = member.role
  editForm.bio = member.bio
  editForm.tagsStr = (member.tags || []).join(', ')
  editForm.links = (member.links || []).map(l => ({ ...l }))
  editForm.existingPhoto = member.photo || ''
  editPhotoFile.value = null
  editPhotoPreview.value = null
}

function startAdd() {
  editingId.value = '__new__'
  editForm.id = ''
  editForm.name = ''
  editForm.role = ''
  editForm.bio = ''
  editForm.tagsStr = ''
  editForm.links = []
  editForm.existingPhoto = ''
  editPhotoFile.value = null
  editPhotoPreview.value = null
}

function cancelEdit() {
  editingId.value = null
  editPhotoFile.value = null
  editPhotoPreview.value = null
}

function addLink() {
  editForm.links.push({ type: 'telegram', url: '' })
}

function removeLink(index: number) {
  editForm.links.splice(index, 1)
}

function triggerPhotoInput(event: Event) {
  const section = (event.currentTarget as HTMLElement).closest('.edit-photo-section')
  const input = section?.querySelector('input[type="file"]') as HTMLInputElement
  input?.click()
}

function handlePhotoSelect(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  editPhotoFile.value = file
  const reader = new FileReader()
  reader.onload = () => { editPhotoPreview.value = reader.result as string }
  reader.readAsDataURL(file)
}

async function saveMember() {
  saving.value = true
  try {
    const fd = new FormData()
    fd.append('action', 'save')
    if (editForm.id) fd.append('id', editForm.id)
    fd.append('name', editForm.name)
    fd.append('role', editForm.role)
    fd.append('bio', editForm.bio)

    const tags = editForm.tagsStr.split(',').map(t => t.trim()).filter(Boolean)
    fd.append('tags', JSON.stringify(tags))

    const validLinks = editForm.links.filter(l => l.url.trim())
    fd.append('links', JSON.stringify(validLinks))

    if (editForm.existingPhoto) fd.append('existingPhoto', editForm.existingPhoto)
    if (editPhotoFile.value) fd.append('photo', editPhotoFile.value)

    const res = await $fetch<{ ok: boolean; members: TeamMember[] }>('/api/admin/team', {
      method: 'POST',
      body: fd,
    })
    if (res.members) {
      members.value = res.members
      if (!activeId.value && members.value.length) {
        activeId.value = members.value[0].id
      }
    }
    cancelEdit()
  } catch (err: any) {
    alert(err?.data?.message || 'Ошибка сохранения')
  }
  saving.value = false
}

async function deleteMember(member: TeamMember) {
  if (!confirm(`Удалить ${member.name}?`)) return
  saving.value = true
  try {
    const fd = new FormData()
    fd.append('action', 'delete')
    fd.append('id', member.id)
    const res = await $fetch<{ ok: boolean; members: TeamMember[] }>('/api/admin/team', {
      method: 'POST',
      body: fd,
    })
    if (res.members) {
      members.value = res.members
      if (activeId.value === member.id) {
        activeId.value = members.value[0]?.id || null
      }
    }
    if (editingId.value === member.id) cancelEdit()
  } catch (err: any) {
    alert(err?.data?.message || 'Ошибка удаления')
  }
  saving.value = false
}

function editPhotoDisplayUrl(): string {
  if (editPhotoPreview.value) return editPhotoPreview.value
  if (editForm.existingPhoto) return `/api/team-photo/${editForm.existingPhoto}`
  return ''
}
</script>

<template>
  <div class="team-page">
    <!-- Hero -->
    <section class="team-hero">
      <div class="hero-inner container">
        <BreadCrumbs :items="[{ label: 'Главная', to: '/' }, { label: 'Команда' }]" />
        <h1>Наша команда</h1>
        <p class="hero-lead">
          За проектом «Территория Хвойных» стоят увлечённые люди — коллекционеры,
          учёные, фотографы и разработчики, объединённые любовью к хвойным растениям.
        </p>
      </div>
      <div class="hero-pattern" />
    </section>

    <!-- Admin bar -->
    <section v-if="auth.isSuperAdmin" class="container admin-bar">
      <button class="btn-add" @click="startAdd">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Добавить участника
      </button>
    </section>

    <!-- Edit form (new member) -->
    <section v-if="editingId === '__new__'" class="container" style="padding: 0 16px 24px;">
      <article class="edit-card">
        <h3 class="edit-card-title">Новый участник</h3>
        <div class="edit-form">
          <div class="edit-photo-section" @click="triggerPhotoInput($event)">
            <div class="edit-photo-circle">
              <img v-if="editPhotoPreview" :src="editPhotoPreview" alt="" />
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </div>
            <input type="file" accept="image/*" style="display:none" @change="handlePhotoSelect" />
            <span class="edit-photo-hint">Нажмите для загрузки фото</span>
          </div>
          <div class="edit-fields">
            <div class="field-row">
              <input v-model="editForm.name" placeholder="Имя" class="edit-input" />
              <input v-model="editForm.role" placeholder="Роль" class="edit-input" />
            </div>
            <textarea v-model="editForm.bio" placeholder="Биография" class="edit-textarea" rows="3" />
            <input v-model="editForm.tagsStr" placeholder="Теги через запятую" class="edit-input" />
            <div class="edit-links-section">
              <div class="edit-links-header">
                <span class="edit-label">Ссылки</span>
                <button class="btn-link-add" @click.stop="addLink">+ добавить</button>
              </div>
              <div v-for="(link, li) in editForm.links" :key="li" class="edit-link-row">
                <select v-model="link.type" class="edit-select">
                  <option v-for="lt in LINK_TYPES" :key="lt.value" :value="lt.value">{{ lt.label }}</option>
                </select>
                <input v-model="link.url" :placeholder="linkPlaceholder(link.type)" class="edit-input edit-input--grow" @click.stop />
                <button class="btn-link-remove" @click.stop="removeLink(li)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            </div>
            <div class="edit-actions">
              <button class="btn-save" :disabled="saving || !editForm.name.trim()" @click="saveMember">
                {{ saving ? 'Сохранение...' : 'Сохранить' }}
              </button>
              <button class="btn-cancel" @click="cancelEdit">Отмена</button>
            </div>
          </div>
        </div>
      </article>
    </section>

    <!-- Loading state -->
    <div v-if="loading" class="loading-state">
      <div class="loading-spinner" />
      <p>Загрузка команды...</p>
    </div>

    <!-- Empty state -->
    <div v-else-if="!members.length && editingId !== '__new__'" class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87" />
        <path d="M16 3.13a4 4 0 010 7.75" />
      </svg>
      <p>Участники команды появятся здесь</p>
    </div>

    <!-- Interactive team viewer -->
    <section v-else class="team-viewer container">
      <!-- Sidebar: member list -->
      <aside class="sidebar">
        <button
          v-for="member in members"
          :key="member.id"
          class="sidebar-item"
          :class="{ 'sidebar-item--active': activeId === member.id }"
          @click="selectMember(member.id)"
        >
          <div class="sidebar-avatar">
            <img v-if="member.photo" :src="photoUrl(member)" :alt="member.name" />
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="24" height="24">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <div class="sidebar-info">
            <span class="sidebar-name">{{ member.name }}</span>
            <span class="sidebar-role">{{ member.role }}</span>
          </div>
          <div class="sidebar-indicator" />
        </button>
      </aside>

      <!-- Profile panel -->
      <div class="profile-panel">
        <Transition name="profile" mode="out-in">
          <div v-if="activeMember && editingId !== activeMember.id" :key="activeMember.id" class="profile">
            <div class="profile-top">
              <div class="profile-photo">
                <img v-if="activeMember.photo" :src="photoUrl(activeMember)" :alt="activeMember.name" />
                <div v-else class="profile-photo-placeholder">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" width="64" height="64">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
              </div>
              <div class="profile-heading">
                <h2 class="profile-name">{{ activeMember.name }}</h2>
                <span class="profile-role">{{ activeMember.role }}</span>
                <div v-if="activeMember.tags?.length" class="profile-tags">
                  <span v-for="tag in activeMember.tags" :key="tag" class="tag-chip">{{ tag }}</span>
                </div>
              </div>
            </div>

            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="profile-bio" v-html="linkifyBio(activeMember.bio || '')" />

            <div v-if="activeMember.links?.length" class="profile-links">
              <a
                v-for="link in activeMember.links"
                :key="link.url"
                :href="linkHref(link)"
                :target="link.type === 'email' ? undefined : '_blank'"
                :rel="link.type === 'email' ? undefined : 'noopener'"
                class="profile-link-btn"
                :class="`profile-link-btn--${link.type}`"
              >
                <!-- Telegram -->
                <svg v-if="link.type === 'telegram'" viewBox="0 0 24 24" width="18" height="18">
                  <path fill="currentColor" d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm5.53 8.15l-1.8 8.47c-.13.6-.5.75-.99.47l-2.76-2.04-1.33 1.28c-.15.15-.27.27-.56.27l.2-2.82 5.12-4.63c.22-.2-.05-.31-.34-.12l-6.33 3.99-2.73-.85c-.59-.18-.6-.59.12-.88l10.67-4.11c.5-.18.93.12.77.88z"/>
                </svg>
                <!-- VK -->
                <svg v-else-if="link.type === 'vk'" viewBox="0 0 24 24" width="18" height="18">
                  <path fill="currentColor" d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm5.84 13.55s.96.95 1.2 1.39c.01.02.02.04.03.06.1.18.13.32.07.42-.09.17-.39.25-.5.26h-1.72c-.14 0-.43-.04-.78-.29-.27-.19-.53-.5-.78-.8-.37-.44-.69-.82-1.02-.89a.36.36 0 00-.12-.02c-.16 0-.36.1-.36.52v.74c0 .08-.02.13-.14.13-1.2 0-2.5-.01-3.69-.85-1.36-.96-2.6-2.88-3.75-5.28-.08-.17-.02-.26.13-.26h1.73c.12 0 .17.06.21.15.24.57.64 1.37 1.1 2.06.59.87 1.01 1.23 1.33 1.23.09 0 .17-.04.24-.12.32-.32.28-1.62.26-1.94 0-.12-.01-.99-.31-1.43-.2-.29-.5-.38-.68-.41.06-.09.19-.21.37-.29.33-.16.92-.18 1.52-.18h.35c.65.01.72.05.92.1.39.1.4.37.36 1.05-.01.19-.02.41-.02.67 0 .06-.01.13-.01.2-.03.42-.07.9.31 1.21.05.04.13.12.35.12.15 0 .62-.08 1.55-1.2.5-.59.88-1.35 1.12-1.94.02-.04.07-.12.13-.15a.32.32 0 01.15-.04h2.01c.14 0 .34.02.38.14.06.18-.02.62-1.06 1.87l-.46.6c-.86 1.12-.86 1.18.05 2.01z"/>
                </svg>
                <!-- Max -->
                <svg v-else-if="link.type === 'max'" viewBox="0 0 24 24" width="18" height="18">
                  <path fill="currentColor" d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm4.95 15.2c-.42.7-1.14 1.18-1.97 1.18-.83 0-1.44-.42-1.97-1.1L12 13.86l-1.01 1.42c-.53.68-1.14 1.1-1.97 1.1-.83 0-1.55-.48-1.97-1.18-.38-.64-.47-1.4-.14-2.58l1.54-5.36c.16-.56.62-.94 1.14-.94.58 0 1.04.46 1.04 1.02 0 .12-.02.24-.06.36L9.24 12.5c-.08.28-.04.48.1.48.12 0 .28-.12.46-.36L12 9.26l2.2 3.36c.18.24.34.36.46.36.14 0 .18-.2.1-.48l-1.33-4.8a1.1 1.1 0 01-.06-.36c0-.56.46-1.02 1.04-1.02.52 0 .98.38 1.14.94l1.54 5.36c.33 1.18.24 1.94-.14 2.58z"/>
                </svg>
                <!-- Email -->
                <svg v-else-if="link.type === 'email'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7" />
                </svg>
                <!-- Site -->
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                  <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                </svg>
                <span>{{ linkLabel(link.type) }}</span>
              </a>
            </div>

            <!-- Admin buttons -->
            <div v-if="auth.isSuperAdmin" class="profile-admin">
              <button class="btn-edit" @click="startEdit(activeMember)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Редактировать
              </button>
              <button class="btn-delete" @click="deleteMember(activeMember)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
                Удалить
              </button>
            </div>
          </div>

          <!-- Edit mode for active member -->
          <div v-else-if="activeMember && editingId === activeMember.id" :key="'edit-' + activeMember.id" class="profile">
            <div class="edit-form">
              <div class="edit-photo-section" @click="triggerPhotoInput($event)">
                <div class="edit-photo-circle">
                  <img v-if="editPhotoDisplayUrl()" :src="editPhotoDisplayUrl()" alt="" />
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36">
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </div>
                <input type="file" accept="image/*" style="display:none" @change="handlePhotoSelect" />
                <span class="edit-photo-hint">Нажмите для замены фото</span>
              </div>
              <div class="edit-fields">
                <div class="field-row">
                  <input v-model="editForm.name" placeholder="Имя" class="edit-input" />
                  <input v-model="editForm.role" placeholder="Роль" class="edit-input" />
                </div>
                <textarea v-model="editForm.bio" placeholder="Биография" class="edit-textarea" rows="5" />
                <input v-model="editForm.tagsStr" placeholder="Теги через запятую" class="edit-input" />
                <div class="edit-links-section">
                  <div class="edit-links-header">
                    <span class="edit-label">Ссылки</span>
                    <button class="btn-link-add" @click.stop="addLink">+ добавить</button>
                  </div>
                  <div v-for="(link, li) in editForm.links" :key="li" class="edit-link-row">
                    <select v-model="link.type" class="edit-select">
                      <option v-for="lt in LINK_TYPES" :key="lt.value" :value="lt.value">{{ lt.label }}</option>
                    </select>
                    <input v-model="link.url" :placeholder="linkPlaceholder(link.type)" class="edit-input edit-input--grow" @click.stop />
                    <button class="btn-link-remove" @click.stop="removeLink(li)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  </div>
                </div>
                <div class="edit-actions">
                  <button class="btn-save" :disabled="saving || !editForm.name.trim()" @click="saveMember">
                    {{ saving ? 'Сохранение...' : 'Сохранить' }}
                  </button>
                  <button class="btn-cancel" @click="cancelEdit">Отмена</button>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* ═══════ Hero ═══════ */
.team-hero {
  position: relative;
  background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%);
  color: #fff;
  padding: 32px 0 48px;
  overflow: hidden;
}
.hero-inner { position: relative; z-index: 1; }
.hero-pattern {
  position: absolute; inset: 0;
  background-image: radial-gradient(circle at 20% 80%, rgba(255,255,255,0.06) 0%, transparent 50%),
                     radial-gradient(circle at 80% 20%, rgba(255,255,255,0.04) 0%, transparent 40%);
  pointer-events: none;
}
.team-hero :deep(.bc) { opacity: 0.6; }
.team-hero :deep(.bc a) { color: #fff; }
.team-hero h1 { font-size: 36px; font-weight: 800; margin: 16px 0 14px; letter-spacing: -0.5px; }
.hero-lead { font-size: 16px; line-height: 1.75; opacity: 0.88; max-width: 540px; }
@media (min-width: 768px) {
  .team-hero { padding: 52px 0 64px; }
  .team-hero h1 { font-size: 44px; }
  .hero-lead { font-size: 17px; }
}

/* ═══════ Admin bar ═══════ */
.admin-bar { display: flex; justify-content: flex-end; padding: 20px 16px 0; }
.btn-add {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 22px;
  background: var(--primary); color: #fff;
  border: none; border-radius: var(--radius-sm);
  font-size: 14px; font-weight: 600;
  cursor: pointer; transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(26, 86, 50, 0.2);
}
.btn-add:hover { background: var(--primary-dark); transform: translateY(-1px); }

/* ═══════ Loading / Empty ═══════ */
.loading-state, .empty-state { text-align: center; padding: 80px 16px; color: var(--text-muted); }
.loading-state p, .empty-state p { margin-top: 16px; font-size: 15px; }
.loading-spinner {
  width: 36px; height: 36px;
  border: 3px solid var(--border); border-top-color: var(--primary);
  border-radius: 50%; margin: 0 auto;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ═══════ Team viewer (sidebar + panel) ═══════ */
.team-viewer {
  display: flex;
  gap: 0;
  padding: 32px 16px 80px;
  min-height: 500px;
}

/* ═══════ Sidebar ═══════ */
.sidebar {
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-right: 24px;
  border-right: 1px solid var(--border-light, #eef2ee);
}
.sidebar-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: none;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s;
  position: relative;
}
.sidebar-item:hover {
  background: rgba(26, 86, 50, 0.04);
}
.sidebar-item--active {
  background: rgba(26, 86, 50, 0.08);
}
.sidebar-item--active .sidebar-name {
  color: var(--primary);
}
.sidebar-indicator {
  position: absolute;
  right: -25px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 0;
  background: var(--primary);
  border-radius: 2px;
  transition: height 0.25s;
}
.sidebar-item--active .sidebar-indicator {
  height: 28px;
}
.sidebar-avatar {
  width: 48px; height: 48px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--bg-alt);
  border: 2px solid transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  transition: border-color 0.2s;
}
.sidebar-item--active .sidebar-avatar {
  border-color: var(--primary);
}
.sidebar-avatar img {
  width: 100%; height: 100%; object-fit: cover;
}
.sidebar-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.sidebar-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.2s;
}
.sidebar-role {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ═══════ Profile panel ═══════ */
.profile-panel {
  flex: 1;
  min-width: 0;
  padding-left: 32px;
}

/* ═══════ Profile transition ═══════ */
.profile-enter-active {
  animation: profileIn 0.3s ease-out;
}
.profile-leave-active {
  animation: profileOut 0.15s ease-in;
}
@keyframes profileIn {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes profileOut {
  from { opacity: 1; }
  to { opacity: 0; }
}

/* ═══════ Profile content ═══════ */
.profile-top {
  display: flex;
  align-items: flex-start;
  gap: 24px;
  margin-bottom: 24px;
}
.profile-photo {
  width: 140px; height: 140px;
  border-radius: 16px;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--bg-alt);
  box-shadow: 0 4px 20px rgba(0,0,0,0.08);
}
.profile-photo img {
  width: 100%; height: 100%; object-fit: cover;
}
.profile-photo-placeholder {
  width: 100%; height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}
.profile-heading {
  padding-top: 8px;
}
.profile-name {
  font-size: 28px;
  font-weight: 800;
  color: var(--text);
  margin: 0 0 6px;
  letter-spacing: -0.3px;
}
.profile-role {
  font-size: 14px;
  font-weight: 600;
  color: var(--primary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.profile-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}
.tag-chip {
  font-size: 11px; font-weight: 600;
  padding: 4px 12px;
  background: rgba(26, 86, 50, 0.06);
  color: var(--primary);
  border-radius: 20px;
}
.profile-bio {
  font-size: 15px;
  line-height: 1.8;
  color: var(--text-secondary);
  word-break: break-word;
}
.profile-bio :deep(.bio-link) {
  color: var(--primary);
  text-decoration: none;
  word-break: break-all;
}
.profile-bio :deep(.bio-link:hover) {
  text-decoration: underline;
}

/* ═══════ Profile links ═══════ */
.profile-links {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 24px;
}
.profile-link-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border: 1px solid var(--border-light, #eef2ee);
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  text-decoration: none;
  background: #fff;
  transition: all 0.2s;
}
.profile-link-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 14px rgba(0,0,0,0.08);
}
.profile-link-btn--telegram:hover { color: #2AABEE; border-color: #2AABEE; background: rgba(42,171,238,0.05); }
.profile-link-btn--vk:hover { color: #0077FF; border-color: #0077FF; background: rgba(0,119,255,0.05); }
.profile-link-btn--max:hover { color: #5B3CDB; border-color: #5B3CDB; background: rgba(91,60,219,0.05); }
.profile-link-btn--email:hover { color: var(--primary); border-color: var(--primary); background: rgba(26,86,50,0.04); }
.profile-link-btn--site:hover { color: var(--accent); border-color: var(--accent); background: rgba(77,184,164,0.05); }

/* ═══════ Profile admin ═══════ */
.profile-admin {
  display: flex;
  gap: 10px;
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid var(--border-light, #eef2ee);
}
.btn-edit, .btn-delete {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 16px;
  border: 1px solid var(--border); border-radius: var(--radius-xs);
  font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all 0.15s;
  background: #fff; color: var(--text-secondary);
}
.btn-edit:hover { border-color: var(--primary); color: var(--primary); background: rgba(26,86,50,0.04); }
.btn-delete:hover { border-color: #d32f2f; color: #d32f2f; background: rgba(211,47,47,0.04); }

/* ═══════ Edit card / form ═══════ */
.edit-card {
  background: #fff;
  border: 2px solid var(--primary-light);
  border-radius: 14px;
  padding: 28px;
}
.edit-card-title {
  font-size: 18px; font-weight: 700;
  margin: 0 0 20px;
  color: var(--text);
}
.edit-form { display: flex; flex-direction: column; gap: 20px; }
.edit-photo-section {
  display: flex; flex-direction: column; align-items: center; gap: 8px; cursor: pointer;
}
.edit-photo-circle {
  width: 100px; height: 100px;
  border-radius: 50%; overflow: hidden;
  background: var(--bg-alt);
  border: 2px dashed var(--border);
  display: flex; align-items: center; justify-content: center;
  color: var(--text-muted);
  transition: border-color 0.2s, background 0.2s;
}
.edit-photo-section:hover .edit-photo-circle { border-color: var(--primary); background: rgba(26,86,50,0.04); }
.edit-photo-circle img { width: 100%; height: 100%; object-fit: cover; }
.edit-photo-hint { font-size: 12px; color: var(--text-muted); transition: color 0.2s; }
.edit-photo-section:hover .edit-photo-hint { color: var(--primary); }
.edit-fields { display: flex; flex-direction: column; gap: 12px; }
.field-row { display: flex; gap: 12px; }
.field-row .edit-input { flex: 1; }
.edit-input {
  width: 100%; padding: 10px 14px;
  border: 1px solid var(--border); border-radius: var(--radius-xs);
  font-size: 14px; color: var(--text); background: #fff;
  transition: border-color 0.15s, box-shadow 0.15s; font-family: inherit;
}
.edit-input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(26,86,50,0.08); }
.edit-input--grow { flex: 1; min-width: 0; }
.edit-textarea {
  width: 100%; padding: 10px 14px;
  border: 1px solid var(--border); border-radius: var(--radius-xs);
  font-size: 14px; color: var(--text); background: #fff;
  font-family: inherit; resize: vertical;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.edit-textarea:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(26,86,50,0.08); }
.edit-select {
  padding: 10px 12px;
  border: 1px solid var(--border); border-radius: var(--radius-xs);
  font-size: 13px; color: var(--text); background: #fff;
  font-family: inherit; cursor: pointer; min-width: 110px;
}
.edit-select:focus { outline: none; border-color: var(--primary); }
.edit-links-section { display: flex; flex-direction: column; gap: 8px; }
.edit-links-header { display: flex; justify-content: space-between; align-items: center; }
.edit-label { font-size: 13px; font-weight: 600; color: var(--text-secondary); }
.btn-link-add {
  font-size: 12px; font-weight: 600; color: var(--primary);
  background: none; border: none; cursor: pointer;
  padding: 4px 10px; border-radius: 6px; transition: background 0.15s;
}
.btn-link-add:hover { background: rgba(26,86,50,0.06); }
.edit-link-row { display: flex; gap: 8px; align-items: center; }
.btn-link-remove {
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px;
  border: none; border-radius: 50%; background: none;
  color: var(--text-muted); cursor: pointer; flex-shrink: 0;
  transition: all 0.15s;
}
.btn-link-remove:hover { background: rgba(211,47,47,0.08); color: #d32f2f; }
.edit-actions { display: flex; gap: 10px; margin-top: 8px; }
.btn-save {
  padding: 10px 28px; background: var(--primary); color: #fff;
  border: none; border-radius: var(--radius-xs);
  font-size: 14px; font-weight: 600; cursor: pointer;
  transition: all 0.2s; box-shadow: 0 2px 6px rgba(26,86,50,0.15);
}
.btn-save:hover:not(:disabled) { background: var(--primary-dark); }
.btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-cancel {
  padding: 10px 20px; background: none;
  border: 1px solid var(--border); border-radius: var(--radius-xs);
  font-size: 14px; font-weight: 600; color: var(--text-secondary);
  cursor: pointer; transition: all 0.15s;
}
.btn-cancel:hover { border-color: var(--text-muted); color: var(--text); }

/* ═══════ Mobile: horizontal strip ═══════ */
@media (max-width: 767px) {
  .team-viewer {
    flex-direction: column;
    gap: 24px;
    min-height: auto;
  }
  .sidebar {
    width: 100%;
    flex-direction: row;
    overflow-x: auto;
    gap: 8px;
    padding: 0 0 16px;
    border-right: none;
    border-bottom: 1px solid var(--border-light, #eef2ee);
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .sidebar::-webkit-scrollbar { display: none; }
  .sidebar-item {
    flex-direction: column;
    gap: 6px;
    padding: 10px 14px;
    min-width: 80px;
    text-align: center;
    flex-shrink: 0;
  }
  .sidebar-indicator {
    position: absolute;
    right: auto;
    bottom: -17px;
    left: 50%;
    top: auto;
    transform: translateX(-50%);
    height: 3px;
    width: 0;
  }
  .sidebar-item--active .sidebar-indicator {
    height: 3px;
    width: 40px;
  }
  .sidebar-avatar { width: 44px; height: 44px; }
  .sidebar-info { align-items: center; }
  .sidebar-role { display: none; }
  .profile-panel { padding-left: 0; }
  .profile-top { flex-direction: column; align-items: center; text-align: center; }
  .profile-heading { align-items: center; display: flex; flex-direction: column; }
  .profile-tags { justify-content: center; }
  .profile-photo { width: 120px; height: 120px; }
  .profile-name { font-size: 24px; }
  .profile-bio { text-align: left; }
  .profile-links { justify-content: center; }
  .profile-admin { justify-content: center; }
  .field-row { flex-direction: column; gap: 10px; }
  .edit-link-row { flex-wrap: wrap; }
  .edit-select { width: 100%; }
}
</style>
