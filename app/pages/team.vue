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

const auth = useAuthStore()
await auth.fetchMe()

const members = ref<TeamMember[]>([])
const loading = ref(true)
const saving = ref(false)

// Editing state: which member id is being edited, or '__new__' for adding
const editingId = ref<string | null>(null)

// Edit form state
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
const editPhotoInput = ref<HTMLInputElement | null>(null)

async function loadTeam() {
  loading.value = true
  try {
    const data = await $fetch<{ members: TeamMember[] }>('/api/team')
    members.value = data.members || []
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
    if (res.members) members.value = res.members
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
    if (res.members) members.value = res.members
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
      <div class="container">
        <BreadCrumbs :items="[{ label: 'Главная', to: '/' }, { label: 'Команда' }]" />
        <h1>Наша команда</h1>
        <p class="hero-lead">
          За проектом «Территория Хвойных» стоят увлечённые люди — коллекционеры,
          учёные, фотографы и разработчики, объединённые любовью к хвойным растениям.
        </p>
      </div>
    </section>

    <!-- Members -->
    <section class="team-section container">
      <!-- Admin: add button -->
      <div v-if="auth.isSuperAdmin" class="admin-bar">
        <button class="btn-add" @click="startAdd">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Добавить участника
        </button>
      </div>

      <!-- Add new member form -->
      <article v-if="editingId === '__new__'" class="member-card member-card--editing">
        <div class="edit-form">
          <div class="edit-photo-section">
            <div class="edit-photo-circle" @click="editPhotoInput?.click()">
              <img v-if="editPhotoPreview" :src="editPhotoPreview" alt="" />
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
            </div>
            <input ref="editPhotoInput" type="file" accept="image/*" style="display:none" @change="handlePhotoSelect" />
            <span class="edit-photo-hint">Нажмите для загрузки</span>
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
                <button class="btn-link-add" @click="addLink">+ добавить</button>
              </div>
              <div v-for="(link, li) in editForm.links" :key="li" class="edit-link-row">
                <select v-model="link.type" class="edit-select">
                  <option value="telegram">Telegram</option>
                  <option value="email">Email</option>
                  <option value="site">Сайт</option>
                </select>
                <input v-model="link.url" placeholder="URL" class="edit-input edit-input--grow" />
                <button class="btn-link-remove" @click="removeLink(li)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
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

      <!-- Loading state -->
      <div v-if="loading" class="loading-state">
        <div class="loading-spinner" />
        <p>Загрузка команды...</p>
      </div>

      <!-- Empty state -->
      <div v-else-if="!members.length && editingId !== '__new__'" class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 00-3-3.87"/>
          <path d="M16 3.13a4 4 0 010 7.75"/>
        </svg>
        <p>Участники команды появятся здесь</p>
      </div>

      <!-- Members grid -->
      <div v-else class="members-grid">
        <article
          v-for="member in members"
          :key="member.id"
          class="member-card"
          :class="{ 'member-card--editing': editingId === member.id }"
        >
          <!-- View mode -->
          <template v-if="editingId !== member.id">
            <div class="card-photo">
              <img v-if="member.photo" :src="photoUrl(member)" :alt="member.name" class="avatar-img" />
              <div v-else class="avatar-placeholder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" width="48" height="48">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
            </div>

            <h3 class="card-name">{{ member.name }}</h3>
            <span class="card-role">{{ member.role }}</span>
            <p class="card-bio">{{ member.bio }}</p>

            <div v-if="member.tags?.length" class="card-tags">
              <span v-for="tag in member.tags" :key="tag" class="tag-chip">{{ tag }}</span>
            </div>

            <div v-if="member.links?.length" class="card-links">
              <a
                v-for="link in member.links"
                :key="link.url"
                :href="link.url"
                target="_blank"
                rel="noopener"
                class="link-btn"
                :title="link.type === 'telegram' ? 'Telegram' : link.type === 'email' ? 'Email' : 'Сайт'"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                  <template v-if="link.type === 'telegram'">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                  </template>
                  <template v-else-if="link.type === 'email'">
                    <rect x="2" y="4" width="20" height="16" rx="2"/>
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7"/>
                  </template>
                  <template v-else>
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10"/>
                  </template>
                </svg>
              </a>
            </div>

            <!-- Admin edit/delete buttons -->
            <div v-if="auth.isSuperAdmin" class="card-admin">
              <button class="btn-edit" @click="startEdit(member)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Редактировать
              </button>
              <button class="btn-delete" @click="deleteMember(member)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                </svg>
                Удалить
              </button>
            </div>
          </template>

          <!-- Edit mode -->
          <template v-else>
            <div class="edit-form">
              <div class="edit-photo-section">
                <div class="edit-photo-circle" @click="editPhotoInput?.click()">
                  <img v-if="editPhotoDisplayUrl()" :src="editPhotoDisplayUrl()" alt="" />
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36">
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                </div>
                <input ref="editPhotoInput" type="file" accept="image/*" style="display:none" @change="handlePhotoSelect" />
                <span class="edit-photo-hint">Нажмите для замены</span>
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
                    <button class="btn-link-add" @click="addLink">+ добавить</button>
                  </div>
                  <div v-for="(link, li) in editForm.links" :key="li" class="edit-link-row">
                    <select v-model="link.type" class="edit-select">
                      <option value="telegram">Telegram</option>
                      <option value="email">Email</option>
                      <option value="site">Сайт</option>
                    </select>
                    <input v-model="link.url" placeholder="URL" class="edit-input edit-input--grow" />
                    <button class="btn-link-remove" @click="removeLink(li)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
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
          </template>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* ═══════ Hero ═══════ */
.team-hero {
  background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%);
  color: #fff;
  padding: 32px 0 40px;
}
.team-hero :deep(.bc) { opacity: 0.6; }
.team-hero :deep(.bc a) { color: #fff; }
.team-hero h1 {
  font-size: 32px;
  font-weight: 800;
  margin: 16px 0 12px;
  letter-spacing: -0.3px;
}
.hero-lead {
  font-size: 16px;
  line-height: 1.7;
  opacity: 0.85;
  max-width: 560px;
}

@media (min-width: 768px) {
  .team-hero { padding: 48px 0 56px; }
  .team-hero h1 { font-size: 40px; }
  .hero-lead { font-size: 17px; }
}

/* ═══════ Section ═══════ */
.team-section {
  padding: 32px 16px 64px;
}

/* ═══════ Admin bar ═══════ */
.admin-bar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 24px;
}
.btn-add {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: var(--primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.btn-add:hover { background: var(--primary-dark); }

/* ═══════ Loading / Empty ═══════ */
.loading-state,
.empty-state {
  text-align: center;
  padding: 64px 16px;
  color: var(--text-muted);
}
.loading-state p,
.empty-state p {
  margin-top: 16px;
  font-size: 15px;
}
.loading-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  margin: 0 auto;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ═══════ Grid ═══════ */
.members-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 24px;
}
@media (min-width: 768px) {
  .members-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 28px;
  }
}

/* ═══════ Card ═══════ */
.member-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 36px 28px 28px;
  background: #fff;
  border: 1px solid var(--border-light, #f0f4f0);
  border-radius: var(--radius);
  transition: box-shadow 0.25s, border-color 0.25s, transform 0.25s;
}
.member-card:hover {
  box-shadow: 0 8px 30px rgba(26, 86, 50, 0.1);
  border-color: var(--border);
  transform: translateY(-2px);
}
.member-card--editing {
  padding: 24px;
  text-align: left;
  align-items: stretch;
}
.member-card--editing:hover {
  transform: none;
  box-shadow: var(--shadow);
}

/* ═══════ Photo ═══════ */
.card-photo {
  width: 110px;
  height: 110px;
  border-radius: 50%;
  overflow: hidden;
  margin-bottom: 20px;
  flex-shrink: 0;
  background: var(--bg-alt);
  border: 3px solid var(--border-light, #f0f4f0);
  transition: border-color 0.2s;
}
.member-card:hover .card-photo {
  border-color: var(--primary-light);
}
.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.avatar-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  background: var(--bg-alt);
}

/* ═══════ Card content ═══════ */
.card-name {
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
  margin: 0 0 4px;
  letter-spacing: -0.2px;
}
.card-role {
  display: inline-block;
  font-size: 13px;
  font-weight: 600;
  color: var(--primary);
  letter-spacing: 0.3px;
  text-transform: uppercase;
}
.card-bio {
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-secondary);
  margin: 14px 0 0;
  max-width: 380px;
}

/* ═══════ Tags ═══════ */
.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 16px;
  justify-content: center;
}
.tag-chip {
  font-size: 11px;
  font-weight: 600;
  padding: 4px 12px;
  background: rgba(26, 86, 50, 0.07);
  color: var(--primary);
  border-radius: 20px;
  letter-spacing: 0.2px;
}

/* ═══════ Social links ═══════ */
.card-links {
  display: flex;
  gap: 8px;
  margin-top: 18px;
  justify-content: center;
}
.link-btn {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: var(--bg-alt);
  border: 1px solid var(--border-light, #f0f4f0);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  transition: all 0.2s;
}
.link-btn:hover {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
  transform: translateY(-1px);
}

/* ═══════ Admin buttons on card ═══════ */
.card-admin {
  display: flex;
  gap: 8px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border-light, #f0f4f0);
  width: 100%;
  justify-content: center;
}
.btn-edit,
.btn-delete {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  background: #fff;
  color: var(--text-secondary);
}
.btn-edit:hover {
  border-color: var(--primary);
  color: var(--primary);
  background: rgba(26, 86, 50, 0.04);
}
.btn-delete:hover {
  border-color: #d32f2f;
  color: #d32f2f;
  background: rgba(211, 47, 47, 0.04);
}

/* ═══════ Edit form ═══════ */
.edit-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.edit-photo-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.edit-photo-circle {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--bg-alt);
  border: 2px dashed var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-muted);
  transition: border-color 0.2s;
}
.edit-photo-circle:hover {
  border-color: var(--primary);
}
.edit-photo-circle img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.edit-photo-hint {
  font-size: 11px;
  color: var(--text-muted);
}

.edit-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.field-row {
  display: flex;
  gap: 12px;
}
.field-row .edit-input {
  flex: 1;
}
.edit-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  font-size: 14px;
  color: var(--text);
  background: #fff;
  transition: border-color 0.15s;
  font-family: inherit;
}
.edit-input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(26, 86, 50, 0.08);
}
.edit-input--grow {
  flex: 1;
  min-width: 0;
}
.edit-textarea {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  font-size: 14px;
  color: var(--text);
  background: #fff;
  font-family: inherit;
  resize: vertical;
  transition: border-color 0.15s;
}
.edit-textarea:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(26, 86, 50, 0.08);
}

.edit-select {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  font-size: 13px;
  color: var(--text);
  background: #fff;
  font-family: inherit;
  cursor: pointer;
  min-width: 100px;
}
.edit-select:focus {
  outline: none;
  border-color: var(--primary);
}

/* ═══════ Links editor ═══════ */
.edit-links-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.edit-links-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.edit-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}
.btn-link-add {
  font-size: 12px;
  font-weight: 600;
  color: var(--primary);
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: background 0.15s;
}
.btn-link-add:hover {
  background: rgba(26, 86, 50, 0.06);
}
.edit-link-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.btn-link-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s;
}
.btn-link-remove:hover {
  background: rgba(211, 47, 47, 0.08);
  color: #d32f2f;
}

/* ═══════ Edit actions ═══════ */
.edit-actions {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}
.btn-save {
  padding: 10px 24px;
  background: var(--primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-xs);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.btn-save:hover:not(:disabled) { background: var(--primary-dark); }
.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-cancel {
  padding: 10px 20px;
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}
.btn-cancel:hover {
  border-color: var(--text-muted);
  color: var(--text);
}

/* ═══════ Responsive ═══════ */
@media (max-width: 479px) {
  .field-row {
    flex-direction: column;
    gap: 10px;
  }
  .edit-link-row {
    flex-wrap: wrap;
  }
  .edit-select {
    width: 100%;
  }
  .card-admin {
    flex-direction: column;
    gap: 6px;
  }
  .card-admin .btn-edit,
  .card-admin .btn-delete {
    justify-content: center;
  }
}
</style>
