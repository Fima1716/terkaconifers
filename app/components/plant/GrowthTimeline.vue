<script setup lang="ts">
const props = defineProps<{ plantId: number }>()

const publicUrl = usePublicUrl()

interface DiaryEntry {
  id: number
  plantId: number
  year: number
  photoFilename: string
  authorContact: string
  comment: string
  createdAt: string
}

const entries = ref<DiaryEntry[]>([])
const loading = ref(true)
const showForm = ref(false)
const submitting = ref(false)
const successMsg = ref('')
const errorMsg = ref('')
const fullPhoto = ref<string | null>(null)

// Form fields
const formYear = ref(new Date().getFullYear())
const formPhoto = ref<File | null>(null)
const formContact = ref('')
const formComment = ref('')
const fileInputRef = ref<HTMLInputElement>()

async function fetchEntries() {
  loading.value = true
  try {
    const data = await $fetch<{ entries: DiaryEntry[] }>(`/api/growth-diary`, {
      params: { plantId: props.plantId },
    })
    entries.value = data.entries
  } catch {
    entries.value = []
  } finally {
    loading.value = false
  }
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  formPhoto.value = input.files?.[0] || null
}

async function submit() {
  errorMsg.value = ''
  successMsg.value = ''

  if (!formPhoto.value) {
    errorMsg.value = 'Добавьте фото'
    return
  }

  submitting.value = true
  try {
    const fd = new FormData()
    fd.append('plantId', String(props.plantId))
    fd.append('year', String(formYear.value))
    fd.append('photo', formPhoto.value)
    fd.append('authorContact', formContact.value)
    fd.append('comment', formComment.value)

    await $fetch('/api/growth-diary', { method: 'POST', body: fd })

    successMsg.value = 'Фото добавлено!'
    showForm.value = false
    formPhoto.value = null
    formContact.value = ''
    formComment.value = ''
    formYear.value = new Date().getFullYear()
    if (fileInputRef.value) fileInputRef.value.value = ''

    await fetchEntries()
    setTimeout(() => successMsg.value = '', 3000)
  } catch (err: any) {
    errorMsg.value = err?.data?.message || 'Ошибка при загрузке'
  } finally {
    submitting.value = false
  }
}

function photoSrc(filename: string) {
  return publicUrl(`uploads/growth/${filename}`)
}

onMounted(fetchEntries)
</script>

<template>
  <div class="growth-timeline-wrap">
    <!-- Loading -->
    <div v-if="loading" class="gt-loading">Загрузка...</div>

    <!-- Timeline -->
    <template v-else>
      <div v-if="entries.length > 0" class="gt-timeline">
        <div class="gt-line" />
        <div class="gt-entries">
          <div v-for="entry in entries" :key="entry.id" class="gt-entry">
            <div class="gt-year">{{ entry.year }}</div>
            <div class="gt-dot" />
            <button class="gt-photo-btn" @click="fullPhoto = photoSrc(entry.photoFilename)">
              <img :src="photoSrc(entry.photoFilename)" :alt="`Фото ${entry.year}`" class="gt-thumb" />
            </button>
            <div v-if="entry.comment" class="gt-comment">{{ entry.comment }}</div>
          </div>
        </div>
      </div>

      <p v-else class="gt-empty">
        Помогите создать историю роста этого растения!
      </p>
    </template>

    <!-- Success message -->
    <Transition name="fade">
      <div v-if="successMsg" class="gt-success">{{ successMsg }}</div>
    </Transition>

    <!-- Toggle form button -->
    <button class="gt-add-btn" @click="showForm = !showForm">
      {{ showForm ? 'Отмена' : 'Добавить фото' }}
    </button>

    <!-- Submission form -->
    <Transition name="slide">
      <div v-if="showForm" class="gt-form">
        <label class="gt-field">
          <span class="gt-label">Фото *</span>
          <input ref="fileInputRef" type="file" accept="image/*" @change="onFileChange" />
        </label>
        <label class="gt-field">
          <span class="gt-label">Год съёмки *</span>
          <input v-model.number="formYear" type="number" min="1990" :max="new Date().getFullYear()" />
        </label>
        <label class="gt-field">
          <span class="gt-label">Контакт (необязательно)</span>
          <input v-model="formContact" type="text" maxlength="100" placeholder="Telegram, email..." />
        </label>
        <label class="gt-field">
          <span class="gt-label">Комментарий (необязательно)</span>
          <textarea v-model="formComment" maxlength="300" rows="2" placeholder="Условия, размер, заметки..." />
        </label>
        <div v-if="errorMsg" class="gt-error">{{ errorMsg }}</div>
        <button class="gt-submit" :disabled="submitting" @click="submit">
          {{ submitting ? 'Загрузка...' : 'Отправить' }}
        </button>
      </div>
    </Transition>

    <!-- Fullsize overlay -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="fullPhoto" class="gt-overlay" @click="fullPhoto = null">
          <img :src="fullPhoto" class="gt-full-img" />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.growth-timeline-wrap {
  margin-top: 16px;
}

.gt-loading {
  color: var(--text-muted);
  font-size: 14px;
}

/* Timeline */
.gt-timeline {
  position: relative;
  padding: 16px 0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.gt-timeline::-webkit-scrollbar { height: 4px; }
.gt-timeline::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

.gt-line {
  position: absolute;
  top: 50px;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--primary), var(--primary-dark, #1a5632));
  border-radius: 2px;
  z-index: 0;
}

.gt-entries {
  display: flex;
  gap: 24px;
  position: relative;
  z-index: 1;
  padding-bottom: 8px;
}

.gt-entry {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 120px;
  flex-shrink: 0;
}

.gt-year {
  font-size: 13px;
  font-weight: 700;
  color: var(--primary);
  margin-bottom: 8px;
}

.gt-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--primary);
  border: 3px solid var(--bg);
  box-shadow: 0 0 0 2px var(--primary);
  margin-bottom: 10px;
  flex-shrink: 0;
}

.gt-photo-btn {
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: 10px;
  overflow: hidden;
  transition: transform 0.15s, box-shadow 0.15s;
}

.gt-photo-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

.gt-thumb {
  width: 120px;
  height: 120px;
  object-fit: cover;
  border-radius: 10px;
  display: block;
}

.gt-comment {
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-muted);
  text-align: center;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gt-empty {
  color: var(--text-muted);
  font-size: 14px;
  font-style: italic;
  padding: 16px 0;
}

/* Add button */
.gt-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 16px;
  padding: 10px 20px;
  background: var(--bg);
  border: 1.5px solid var(--primary);
  border-radius: var(--radius-sm);
  color: var(--primary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.gt-add-btn:hover {
  background: var(--primary);
  color: #fff;
}

/* Form */
.gt-form {
  margin-top: 16px;
  padding: 20px;
  background: var(--bg-alt);
  border-radius: var(--radius);
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 400px;
}

.gt-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.gt-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.gt-form input[type="text"],
.gt-form input[type="number"],
.gt-form textarea {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  background: var(--bg);
  font-size: 14px;
  color: var(--text);
  font-family: inherit;
  resize: vertical;
}

.gt-form input[type="file"] {
  font-size: 13px;
  color: var(--text-secondary);
}

.gt-submit {
  padding: 12px 24px;
  background: var(--primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s;
}

.gt-submit:hover:not(:disabled) {
  background: var(--primary-dark, #1a5632);
}

.gt-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.gt-error {
  color: #c62828;
  font-size: 13px;
  font-weight: 500;
}

.gt-success {
  margin-top: 12px;
  padding: 10px 16px;
  background: #e8f5e9;
  color: #2e7d32;
  border-radius: var(--radius-xs);
  font-size: 13px;
  font-weight: 600;
}

/* Fullsize overlay */
.gt-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.gt-full-img {
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
  border-radius: 8px;
}

/* Transitions */
.fade-enter-active, .fade-leave-active { transition: opacity 0.25s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.slide-enter-active { transition: all 0.25s ease-out; }
.slide-leave-active { transition: all 0.2s ease-in; }
.slide-enter-from { opacity: 0; transform: translateY(-8px); }
.slide-leave-to { opacity: 0; transform: translateY(-8px); }
</style>
