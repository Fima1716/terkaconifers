<script setup lang="ts">
useHead({ title: 'Обмен растениями — Территория Хвойных' })

interface ExchangePost {
  id: number
  type: 'looking' | 'offering'
  plantName: string
  region: string
  contact: string
  description: string
  createdAt: string
}

const posts = ref<ExchangePost[]>([])
const loading = ref(true)
const filter = ref<'all' | 'looking' | 'offering'>('all')
const showForm = ref(false)
const submitting = ref(false)
const error = ref('')
const success = ref('')

const form = reactive({
  type: 'offering' as 'looking' | 'offering',
  plantName: '',
  region: '',
  contact: '',
  description: '',
})

const filteredPosts = computed(() => {
  if (filter.value === 'all') return posts.value
  return posts.value.filter(p => p.type === filter.value)
})

async function fetchPosts() {
  loading.value = true
  try {
    const data = await $fetch<{ posts: ExchangePost[] }>('/api/exchange')
    posts.value = data.posts
  } catch (e) {
    console.error('Failed to fetch exchange posts', e)
  } finally {
    loading.value = false
  }
}

async function submit() {
  error.value = ''
  success.value = ''
  if (!form.plantName.trim()) { error.value = 'Укажите название растения'; return }
  if (!form.contact.trim()) { error.value = 'Укажите контакт для связи'; return }

  submitting.value = true
  try {
    await $fetch('/api/exchange', { method: 'POST', body: { ...form } })
    success.value = 'Объявление опубликовано!'
    form.plantName = ''
    form.region = ''
    form.contact = ''
    form.description = ''
    showForm.value = false
    await fetchPosts()
    setTimeout(() => { success.value = '' }, 3000)
  } catch (e: any) {
    error.value = e?.data?.message || 'Ошибка при публикации'
  } finally {
    submitting.value = false
  }
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
}

onMounted(fetchPosts)
</script>

<template>
  <div class="exchange-page container">
    <BreadCrumbs :items="[{ label: 'Главная', to: '/' }, { label: 'Обмен растениями' }]" />

    <div class="page-header">
      <h1>Обмен растениями</h1>
      <p class="page-desc">Доска объявлений для обмена, покупки и продажи хвойных растений между коллекционерами</p>
    </div>

    <!-- Success toast -->
    <Transition name="toast">
      <div v-if="success" class="toast-success">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        {{ success }}
      </div>
    </Transition>

    <!-- Filter tabs + Add button -->
    <div class="toolbar">
      <div class="filter-tabs">
        <button :class="['tab', { active: filter === 'all' }]" @click="filter = 'all'">Все</button>
        <button :class="['tab', { active: filter === 'looking' }]" @click="filter = 'looking'">Ищу</button>
        <button :class="['tab', { active: filter === 'offering' }]" @click="filter = 'offering'">Предлагаю</button>
      </div>
      <button class="add-btn" @click="showForm = !showForm">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span>Добавить объявление</span>
      </button>
    </div>

    <!-- Form -->
    <Transition name="slide-form">
      <div v-if="showForm" class="form-card">
        <h2 class="form-title">Новое объявление</h2>

        <div class="form-group">
          <label class="form-label">Тип объявления</label>
          <div class="radio-row">
            <label :class="['radio-option', { selected: form.type === 'looking' }]">
              <input v-model="form.type" type="radio" value="looking">
              <span class="radio-badge looking">Ищу</span>
            </label>
            <label :class="['radio-option', { selected: form.type === 'offering' }]">
              <input v-model="form.type" type="radio" value="offering">
              <span class="radio-badge offering">Предлагаю</span>
            </label>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="ex-plant">Название растения <span class="required">*</span></label>
          <input id="ex-plant" v-model="form.plantName" type="text" class="form-input" placeholder="Например: Picea pungens Hoopsii" maxlength="200">
        </div>

        <div class="form-group">
          <label class="form-label" for="ex-region">Регион</label>
          <input id="ex-region" v-model="form.region" type="text" class="form-input" placeholder="Москва, Санкт-Петербург..." maxlength="100">
        </div>

        <div class="form-group">
          <label class="form-label" for="ex-contact">Контакт (Telegram) <span class="required">*</span></label>
          <input id="ex-contact" v-model="form.contact" type="text" class="form-input" placeholder="@username" maxlength="100">
        </div>

        <div class="form-group">
          <label class="form-label" for="ex-desc">Описание</label>
          <textarea id="ex-desc" v-model="form.description" class="form-input form-textarea" placeholder="Размер, возраст, состояние, цена..." maxlength="500" rows="3" />
        </div>

        <div v-if="error" class="form-error">{{ error }}</div>

        <div class="form-actions">
          <button class="cancel-btn" @click="showForm = false">Отмена</button>
          <button class="submit-btn" :disabled="submitting" @click="submit">
            <template v-if="submitting">Отправка...</template>
            <template v-else>Опубликовать</template>
          </button>
        </div>
      </div>
    </Transition>

    <!-- Loading -->
    <div v-if="loading" class="loading-state">
      <div class="spinner" />
      <span>Загрузка объявлений...</span>
    </div>

    <!-- Posts list -->
    <div v-else-if="filteredPosts.length" class="posts-grid">
      <article v-for="post in filteredPosts" :key="post.id" class="post-card">
        <div class="post-top">
          <span :class="['type-badge', post.type]">
            {{ post.type === 'offering' ? 'Предлагаю' : 'Ищу' }}
          </span>
          <time class="post-date">{{ formatDate(post.createdAt) }}</time>
        </div>
        <h3 class="post-plant">{{ post.plantName }}</h3>
        <p v-if="post.description" class="post-desc">{{ post.description }}</p>
        <div class="post-footer">
          <span v-if="post.region" class="post-region">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
            {{ post.region }}
          </span>
          <span class="post-contact">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>
            {{ post.contact }}
          </span>
        </div>
      </article>
    </div>

    <!-- Empty state -->
    <div v-else class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>
      <p class="empty-title">Объявлений пока нет</p>
      <p class="empty-desc">Станьте первым — добавьте объявление об обмене растениями!</p>
      <button class="add-btn" @click="showForm = true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span>Добавить объявление</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.exchange-page {
  padding: 16px 16px 100px;
  max-width: 800px;
}

.page-header { margin-bottom: 24px; }
.page-header h1 { font-size: 24px; font-weight: 700; color: var(--text); margin: 0 0 6px; }
.page-desc { font-size: 14px; color: var(--text-muted); margin: 0; line-height: 1.5; }

/* Toolbar */
.toolbar {
  display: flex; flex-wrap: wrap; align-items: center; gap: 12px;
  margin-bottom: 20px;
}

.filter-tabs {
  display: flex; gap: 4px;
  background: var(--bg-alt);
  border-radius: var(--radius, 10px);
  padding: 3px;
}

.tab {
  padding: 7px 16px;
  border-radius: calc(var(--radius, 10px) - 2px);
  font-size: 13px; font-weight: 600;
  background: none; border: none;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
}
.tab:hover { color: var(--text); }
.tab.active {
  background: var(--bg, #fff);
  color: var(--primary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.add-btn {
  display: flex; align-items: center; gap: 6px;
  margin-left: auto;
  padding: 8px 16px;
  background: var(--primary);
  color: #fff;
  border: none; border-radius: var(--radius, 10px);
  font-size: 13px; font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}
.add-btn:hover { opacity: 0.9; }
.add-btn:active { opacity: 0.8; }

/* Form */
.form-card {
  background: var(--bg, #fff);
  border: 1px solid var(--border);
  border-radius: var(--radius, 10px);
  padding: 24px;
  margin-bottom: 24px;
}
.form-title { font-size: 18px; font-weight: 700; margin: 0 0 20px; color: var(--text); }

.form-group { margin-bottom: 16px; }
.form-label { display: block; font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 6px; }
.required { color: #e53935; }

.radio-row { display: flex; gap: 10px; }
.radio-option { cursor: pointer; }
.radio-option input { display: none; }
.radio-badge {
  display: inline-block;
  padding: 6px 16px;
  border-radius: 20px;
  font-size: 13px; font-weight: 600;
  border: 2px solid var(--border);
  transition: all 0.15s;
}
.radio-option.selected .radio-badge.looking {
  background: #fff3e0; border-color: #ff9800; color: #e65100;
}
.radio-option.selected .radio-badge.offering {
  background: #e8f5e9; border-color: #4caf50; color: #2e7d32;
}

.form-input {
  width: 100%;
  padding: 10px 14px;
  background: var(--bg-alt);
  border: 1.5px solid var(--border);
  border-radius: calc(var(--radius, 10px) - 2px);
  font-size: 14px; color: var(--text);
  outline: none;
  transition: border-color 0.15s;
}
.form-input:focus { border-color: var(--primary); }
.form-input::placeholder { color: var(--text-muted); }
.form-textarea { resize: vertical; min-height: 70px; font-family: inherit; }

.form-error {
  background: #ffeef0; color: #d32f2f;
  padding: 10px 14px; border-radius: 8px;
  font-size: 13px; font-weight: 500;
  margin-bottom: 16px;
}

.form-actions { display: flex; gap: 10px; justify-content: flex-end; }
.cancel-btn {
  padding: 10px 20px;
  background: var(--bg-alt); border: 1px solid var(--border);
  border-radius: var(--radius, 10px);
  font-size: 14px; font-weight: 500; color: var(--text-muted);
  cursor: pointer;
}
.cancel-btn:hover { color: var(--text); }
.submit-btn {
  padding: 10px 24px;
  background: var(--primary); color: #fff;
  border: none; border-radius: var(--radius, 10px);
  font-size: 14px; font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}
.submit-btn:hover { opacity: 0.9; }
.submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }

/* Posts */
.posts-grid {
  display: flex; flex-direction: column; gap: 12px;
}

.post-card {
  background: var(--bg, #fff);
  border: 1px solid var(--border);
  border-radius: var(--radius, 10px);
  padding: 16px 20px;
  transition: box-shadow 0.15s;
}
.post-card:hover { box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06); }

.post-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }

.type-badge {
  display: inline-flex; align-items: center;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.3px;
}
.type-badge.offering { background: #e8f5e9; color: #2e7d32; }
.type-badge.looking { background: #fff3e0; color: #e65100; }

.post-date { font-size: 12px; color: var(--text-muted); }

.post-plant { font-size: 16px; font-weight: 700; color: var(--text); margin: 0 0 6px; }
.post-desc { font-size: 14px; color: var(--text-secondary, var(--text-muted)); margin: 0 0 12px; line-height: 1.5; }

.post-footer { display: flex; flex-wrap: wrap; gap: 16px; }
.post-region, .post-contact {
  display: flex; align-items: center; gap: 4px;
  font-size: 13px; color: var(--text-muted);
}
.post-contact { color: var(--primary); font-weight: 500; }

/* Loading */
.loading-state {
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  padding: 60px 20px;
  color: var(--text-muted); font-size: 14px;
}
.spinner {
  width: 28px; height: 28px;
  border: 3px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Empty */
.empty-state {
  display: flex; flex-direction: column; align-items: center;
  padding: 60px 20px;
  text-align: center;
  color: var(--text-muted);
}
.empty-state svg { margin-bottom: 16px; opacity: 0.4; }
.empty-title { font-size: 18px; font-weight: 700; color: var(--text); margin: 0 0 6px; }
.empty-desc { font-size: 14px; margin: 0 0 20px; }

/* Toast */
.toast-success {
  display: flex; align-items: center; gap: 8px;
  background: #e8f5e9; color: #2e7d32;
  padding: 12px 16px; border-radius: var(--radius, 10px);
  font-size: 14px; font-weight: 500;
  margin-bottom: 16px;
}
.toast-enter-active { transition: all 0.3s ease; }
.toast-leave-active { transition: all 0.2s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(-8px); }

/* Form animation */
.slide-form-enter-active { transition: all 0.25s ease; }
.slide-form-leave-active { transition: all 0.15s ease; }
.slide-form-enter-from { opacity: 0; transform: translateY(-12px); }
.slide-form-leave-to { opacity: 0; transform: translateY(-8px); }

/* Mobile */
@media (max-width: 500px) {
  .toolbar { flex-direction: column; align-items: stretch; }
  .add-btn { margin-left: 0; justify-content: center; }
  .form-card { padding: 16px; }
  .form-actions { flex-direction: column; }
  .cancel-btn, .submit-btn { width: 100%; text-align: center; }
  .post-card { padding: 14px 16px; }
}
</style>
