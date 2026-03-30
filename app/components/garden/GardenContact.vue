<script setup lang="ts">
const props = defineProps<{ gardenName: string }>()

const showForm = ref(false)
const sent = ref(false)
const saving = ref(false)
const error = ref('')

const form = ref({
  name: '',
  contact: '',
  requestType: 'other',
  message: '',
})

const requestTypes = [
  { value: 'edit', label: 'Изменить информацию о саде' },
  { value: 'photos', label: 'Обновить или удалить фото' },
  { value: 'remove', label: 'Убрать сад с сайта' },
  { value: 'other', label: 'Другой вопрос' },
]

async function submit() {
  error.value = ''
  saving.value = true
  try {
    await $fetch('/api/garden-contact', {
      method: 'POST',
      body: { garden: props.gardenName, ...form.value },
    })
    sent.value = true
  } catch (e: any) {
    error.value = e?.data?.message || 'Ошибка отправки. Попробуйте позже.'
  }
  saving.value = false
}
</script>

<template>
  <div class="gc-wrap">
    <!-- Collapsed state -->
    <div v-if="!showForm && !sent" class="gc-banner" @click="showForm = true">
      <div class="gc-banner-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="24" height="24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
      </div>
      <div class="gc-banner-text">
        <span class="gc-banner-title">Это ваш сад? Хотите что-то изменить?</span>
        <span class="gc-banner-desc">Обновить фото, изменить описание или убрать сад с сайта</span>
      </div>
      <svg class="gc-banner-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M9 18l6-6-6-6"/></svg>
    </div>

    <!-- Expanded form -->
    <div v-if="showForm && !sent" class="gc-form">
      <div class="gc-form-header">
        <h3>Связаться с командой</h3>
        <button class="gc-close" @click="showForm = false">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <p class="gc-form-desc">Напишите нам — мы свяжемся с вами для подтверждения.</p>

      <div class="gc-field">
        <label>Тип обращения</label>
        <div class="gc-types">
          <button
            v-for="t in requestTypes"
            :key="t.value"
            class="gc-type"
            :class="{ active: form.requestType === t.value }"
            @click="form.requestType = t.value"
          >
            {{ t.label }}
          </button>
        </div>
      </div>

      <div class="gc-row">
        <div class="gc-field">
          <label>Ваше имя</label>
          <input v-model="form.name" type="text" placeholder="Иван Петров">
        </div>
        <div class="gc-field">
          <label>Ваш профиль в MAX *</label>
          <input v-model="form.contact" type="text" placeholder="@username или ссылка max.ru/...">
        </div>
      </div>

      <div class="gc-field">
        <label>Сообщение *</label>
        <textarea v-model="form.message" rows="3" :placeholder="form.requestType === 'remove' ? 'Расскажите почему хотите убрать сад...' : 'Что хотите изменить...'" />
      </div>

      <p v-if="error" class="gc-error">{{ error }}</p>

      <div class="gc-actions">
        <button class="gc-submit" :disabled="saving || !form.contact.trim() || !form.message.trim()" @click="submit">
          {{ saving ? 'Отправка...' : 'Отправить' }}
        </button>
        <button class="gc-cancel" @click="showForm = false">Отмена</button>
      </div>
    </div>

    <!-- Success -->
    <div v-if="sent" class="gc-sent">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20"><polyline points="20 6 9 17 4 12"/></svg>
      <div>
        <span class="gc-sent-title">Сообщение отправлено</span>
        <span class="gc-sent-desc">Команда свяжется с вами для подтверждения</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gc-wrap { margin-top: 32px; }

/* Banner (collapsed) */
.gc-banner {
  display: flex; align-items: center; gap: 14px;
  padding: 16px 18px; border-radius: 14px;
  border: 1.5px solid var(--border, #e0e0e0);
  background: var(--bg, #fff);
  cursor: pointer; transition: all 0.15s;
  -webkit-tap-highlight-color: transparent;
}
.gc-banner:hover { border-color: var(--primary, #1a5632); }
.gc-banner-icon { color: var(--text-muted, #999); flex-shrink: 0; }
.gc-banner-text { flex: 1; }
.gc-banner-title { display: block; font-size: 14px; font-weight: 600; color: var(--text, #333); }
.gc-banner-desc { display: block; font-size: 12px; color: var(--text-muted, #999); margin-top: 2px; }
.gc-banner-arrow { color: var(--border, #ccc); flex-shrink: 0; transition: color 0.15s; }
.gc-banner:hover .gc-banner-arrow { color: var(--primary, #1a5632); }

/* Form */
.gc-form {
  padding: 20px; border-radius: 14px;
  border: 1.5px solid var(--border, #e0e0e0);
  background: var(--bg, #fff);
}
.gc-form-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.gc-form-header h3 { font-size: 16px; font-weight: 700; }
.gc-close { background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 4px; }
.gc-form-desc { font-size: 13px; color: var(--text-muted); margin-bottom: 16px; }

.gc-field { margin-bottom: 12px; }
.gc-field label { display: block; font-size: 12px; font-weight: 600; color: var(--text-secondary, #666); margin-bottom: 4px; }
.gc-field input, .gc-field textarea {
  width: 100%; padding: 10px 14px;
  background: var(--bg-alt, #f5f7f5); border: 1.5px solid var(--border, #e0e0e0);
  border-radius: 10px; font-size: 14px; color: var(--text, #333);
  outline: none; font-family: inherit; resize: vertical;
  transition: border-color 0.15s;
}
.gc-field input:focus, .gc-field textarea:focus { border-color: var(--primary, #1a5632); }

.gc-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
@media (max-width: 500px) { .gc-row { grid-template-columns: 1fr; } }

/* Request types */
.gc-types { display: flex; flex-wrap: wrap; gap: 6px; }
.gc-type {
  padding: 7px 14px; border-radius: 20px;
  border: 1.5px solid var(--border, #e0e0e0); background: var(--bg, #fff);
  font-size: 12px; font-weight: 600; color: var(--text-secondary, #666);
  cursor: pointer; transition: all 0.15s; white-space: nowrap;
}
.gc-type.active { background: var(--primary, #1a5632); color: #fff; border-color: var(--primary, #1a5632); }

.gc-error { font-size: 13px; color: #e53935; margin-bottom: 8px; }

.gc-actions { display: flex; gap: 8px; margin-top: 4px; }
.gc-submit {
  padding: 11px 28px; background: var(--primary, #1a5632); color: #fff;
  border: none; border-radius: 10px; font-size: 14px; font-weight: 600;
  cursor: pointer; transition: opacity 0.15s;
}
.gc-submit:hover { opacity: 0.85; }
.gc-submit:disabled { opacity: 0.5; cursor: default; }
.gc-cancel {
  padding: 11px 20px; background: none;
  border: 1.5px solid var(--border, #e0e0e0); border-radius: 10px;
  font-size: 14px; color: var(--text-muted, #999); cursor: pointer;
}

/* Success */
.gc-sent {
  display: flex; align-items: center; gap: 12px;
  padding: 16px 18px; border-radius: 14px;
  background: #e8f5e9; border: 1.5px solid #a5d6a7;
}
.gc-sent svg { color: #2e7d32; flex-shrink: 0; }
.gc-sent-title { display: block; font-size: 14px; font-weight: 600; color: #2e7d32; }
.gc-sent-desc { display: block; font-size: 12px; color: #66bb6a; margin-top: 2px; }
</style>
