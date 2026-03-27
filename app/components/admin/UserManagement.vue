<script setup lang="ts">
import { useCatalogStore } from '~/stores/catalog'

interface UserPublic {
  username: string
  displayName: string
  role: 'super_admin' | 'admin'
  gardens: string[]
  createdAt: string
  lastLogin: string
}

const catalog = useCatalogStore()
const users = ref<UserPublic[]>([])
const loading = ref(false)
const message = ref('')
const msgType = ref<'ok' | 'err'>('ok')

// New user form
const showForm = ref(false)
const form = reactive({
  username: '',
  password: '',
  displayName: '',
  role: 'admin' as 'admin' | 'super_admin',
  gardens: [] as string[],
})

// Edit mode
const editing = ref<string | null>(null)
const editForm = reactive({
  displayName: '',
  role: 'admin' as 'admin' | 'super_admin',
  gardens: [] as string[],
  password: '',
})

// Garden list from catalog
const gardenList = computed(() => {
  if (!catalog.isLoaded) return []
  const map = new Map<string, number>()
  for (const p of catalog.catalog) {
    if (p.garden_display) map.set(p.garden_display, (map.get(p.garden_display) || 0) + 1)
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }))
})

onMounted(async () => {
  if (!catalog.isLoaded) catalog.loadCatalog()
  await loadUsers()
})

async function loadUsers() {
  loading.value = true
  try {
    const data = await $fetch<{ users: UserPublic[] }>('/api/admin/users')
    users.value = data.users
  } catch {} finally { loading.value = false }
}

function showMsg(text: string, type: 'ok' | 'err' = 'ok') {
  message.value = text; msgType.value = type
  setTimeout(() => message.value = '', 4000)
}

async function createUser() {
  try {
    await $fetch('/api/admin/users', { method: 'POST', body: { ...form } })
    showMsg(`Пользователь ${form.username} создан`)
    showForm.value = false
    Object.assign(form, { username: '', password: '', displayName: '', role: 'admin', gardens: [] })
    await loadUsers()
  } catch (e: any) { showMsg(e?.data?.message || 'Ошибка', 'err') }
}

function startEdit(user: UserPublic) {
  editing.value = user.username
  editForm.displayName = user.displayName
  editForm.role = user.role
  editForm.gardens = [...user.gardens]
  editForm.password = ''
}

async function saveEdit() {
  if (!editing.value) return
  try {
    const body: any = { displayName: editForm.displayName, role: editForm.role, gardens: editForm.gardens }
    if (editForm.password) body.password = editForm.password
    await $fetch(`/api/admin/users/${editing.value}`, { method: 'PUT', body })
    showMsg('Пользователь обновлён')
    editing.value = null
    await loadUsers()
  } catch (e: any) { showMsg(e?.data?.message || 'Ошибка', 'err') }
}

async function deleteUser(username: string) {
  if (!confirm(`Удалить пользователя ${username}?`)) return
  try {
    await $fetch(`/api/admin/users/${username}`, { method: 'DELETE' })
    showMsg('Пользователь удалён')
    await loadUsers()
  } catch (e: any) { showMsg(e?.data?.message || 'Ошибка', 'err') }
}

function toggleGarden(list: string[], garden: string) {
  const idx = list.indexOf(garden)
  if (idx >= 0) list.splice(idx, 1)
  else list.push(garden)
}
</script>

<template>
  <div class="user-mgmt">
    <div class="section-header">
      <h2>Пользователи ({{ users.length }})</h2>
      <button class="btn-primary" @click="showForm = !showForm">
        {{ showForm ? 'Отмена' : '+ Добавить' }}
      </button>
    </div>

    <div v-if="message" class="msg" :class="msgType">{{ message }}</div>

    <!-- Create form -->
    <div v-if="showForm" class="form-card">
      <h3>Новый пользователь</h3>
      <div class="form-grid">
        <div class="field">
          <label>Username</label>
          <input v-model="form.username" type="text" placeholder="username">
        </div>
        <div class="field">
          <label>Пароль</label>
          <input v-model="form.password" type="password" placeholder="Минимум 4 символа">
        </div>
        <div class="field">
          <label>Имя</label>
          <input v-model="form.displayName" type="text" placeholder="Отображаемое имя">
        </div>
        <div class="field">
          <label>Роль</label>
          <select v-model="form.role">
            <option value="admin">Админ</option>
            <option value="super_admin">Суперадмин</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label>Сады (атрибуция)</label>
        <div class="garden-chips">
          <button
            v-for="g in gardenList.slice(0, 30)"
            :key="g.name"
            class="garden-chip"
            :class="{ selected: form.gardens.includes(g.name) }"
            @click="toggleGarden(form.gardens, g.name)"
          >
            {{ g.name }} <span class="chip-count">{{ g.count }}</span>
          </button>
        </div>
      </div>
      <button class="btn-primary" @click="createUser" :disabled="!form.username || !form.password">Создать</button>
    </div>

    <!-- Users list -->
    <div v-for="user in users" :key="user.username" class="user-card">
      <template v-if="editing === user.username">
        <!-- Edit mode -->
        <div class="form-grid">
          <div class="field">
            <label>Имя</label>
            <input v-model="editForm.displayName" type="text">
          </div>
          <div class="field">
            <label>Роль</label>
            <select v-model="editForm.role">
              <option value="admin">Админ</option>
              <option value="super_admin">Суперадмин</option>
            </select>
          </div>
          <div class="field">
            <label>Новый пароль (пустое = не менять)</label>
            <input v-model="editForm.password" type="password" placeholder="Оставить пустым">
          </div>
        </div>
        <div class="field">
          <label>Сады</label>
          <div class="garden-chips">
            <button
              v-for="g in gardenList.slice(0, 30)"
              :key="g.name"
              class="garden-chip"
              :class="{ selected: editForm.gardens.includes(g.name) }"
              @click="toggleGarden(editForm.gardens, g.name)"
            >
              {{ g.name }}
            </button>
          </div>
        </div>
        <div class="user-actions">
          <button class="btn-primary" @click="saveEdit">Сохранить</button>
          <button class="btn-secondary" @click="editing = null">Отмена</button>
        </div>
      </template>
      <template v-else>
        <!-- View mode -->
        <div class="user-info">
          <div class="user-main">
            <strong>{{ user.displayName }}</strong>
            <span class="user-username">@{{ user.username }}</span>
            <span class="role-badge" :class="user.role">{{ user.role === 'super_admin' ? 'Суперадмин' : 'Админ' }}</span>
          </div>
          <div v-if="user.gardens.length" class="user-gardens">
            <span v-for="g in user.gardens" :key="g" class="garden-tag">{{ g }}</span>
          </div>
          <div class="user-meta">
            Создан: {{ new Date(user.createdAt).toLocaleDateString('ru') }}
            <template v-if="user.lastLogin"> · Последний вход: {{ new Date(user.lastLogin).toLocaleDateString('ru') }}</template>
          </div>
        </div>
        <div class="user-actions">
          <button class="btn-edit" @click="startEdit(user)">Изменить</button>
          <button class="btn-delete" @click="deleteUser(user.username)">Удалить</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
h2 { font-size: 18px; font-weight: 700; }
h3 { font-size: 15px; font-weight: 600; margin-bottom: 12px; }

.msg { padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 12px; }
.msg.ok { background: #e8f5e9; color: #2e7d32; }
.msg.err { background: #fce4ec; color: #c62828; }

.form-card { background: var(--bg-alt); border: 1px solid var(--border); border-radius: 12px; padding: 16px; margin-bottom: 16px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
@media (max-width: 640px) { .form-grid { grid-template-columns: 1fr; } }

.field { margin-bottom: 8px; }
.field label { display: block; font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 4px; }
.field input, .field select { width: 100%; height: 40px; padding: 0 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; background: var(--bg); color: var(--text); box-sizing: border-box; }

.garden-chips { display: flex; flex-wrap: wrap; gap: 6px; max-height: 200px; overflow-y: auto; }
.garden-chip { padding: 4px 10px; border: 1px solid var(--border); border-radius: 16px; font-size: 12px; background: var(--bg); cursor: pointer; transition: all 0.15s; }
.garden-chip.selected { background: var(--primary); color: #fff; border-color: var(--primary); }
.chip-count { opacity: 0.6; margin-left: 2px; }

.user-card { background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.user-info { flex: 1; min-width: 200px; }
.user-main { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.user-username { font-size: 13px; color: var(--text-muted); }
.role-badge { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 10px; text-transform: uppercase; letter-spacing: 0.3px; }
.role-badge.super_admin { background: #e8f5e9; color: #2e7d32; }
.role-badge.admin { background: #e3f2fd; color: #1565c0; }
.user-gardens { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px; }
.garden-tag { font-size: 11px; padding: 2px 8px; background: var(--bg-alt); border-radius: 8px; color: var(--primary); }
.user-meta { font-size: 11px; color: var(--text-muted); margin-top: 4px; }
.user-actions { display: flex; gap: 6px; align-items: flex-start; }

.btn-primary { padding: 8px 16px; background: var(--primary); color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.btn-primary:disabled { opacity: 0.5; }
.btn-secondary { padding: 8px 16px; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; font-size: 13px; cursor: pointer; color: var(--text); }
.btn-edit { padding: 6px 12px; background: var(--bg-alt); border: 1px solid var(--border); border-radius: 8px; font-size: 12px; cursor: pointer; color: var(--text-secondary); }
.btn-delete { padding: 6px 12px; background: none; border: 1px solid #e57373; border-radius: 8px; font-size: 12px; cursor: pointer; color: #e57373; }
</style>
