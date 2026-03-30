<script setup lang="ts">
import { thumbWebpUrl } from '~/utils/photoUrl'

const route = useRoute()
const gardenName = computed(() => (route.query.garden as string) || '')
const saving = ref(false)
const result = ref<'agreed' | 'declined' | 'revoke_requested' | null>(null)

const preview = ref<{
  plants: { latin_full: string; species_ru: string; thumb: string }[]
  count: number
  consent: boolean | null
  consentAt: string | null
}>({ plants: [], count: 0, consent: null, consentAt: null })

onMounted(async () => {
  if (gardenName.value) {
    try {
      preview.value = await $fetch<any>(`/api/consent-preview?garden=${encodeURIComponent(gardenName.value)}`)
    } catch {}
  }
})

useHead({ title: computed(() => gardenName.value ? `${gardenName.value} — Территория Хвойных` : 'Согласие — Территория Хвойных') })

async function submitAction(action: 'agree' | 'decline' | 'revoke') {
  saving.value = true
  try {
    const res = await $fetch<any>('/api/consent-public', {
      method: 'POST',
      body: { garden: gardenName.value, action },
    })
    result.value = res.action === 'revoke_requested' ? 'revoke_requested' : res.action === 'agreed' ? 'agreed' : 'declined'
    if (res.action === 'agreed') preview.value.consent = true
  } catch {}
  saving.value = false
}

// Contact form
const showContact = ref(false)
const contactSent = ref(false)
const contactForm = ref({ name: '', contact: '', message: '' })

async function sendContact() {
  saving.value = true
  try {
    await $fetch('/api/consent-public', {
      method: 'POST',
      body: {
        garden: gardenName.value,
        action: 'contact',
        name: contactForm.value.name,
        contact: contactForm.value.contact,
        message: contactForm.value.message,
      },
    })
    contactSent.value = true
    showContact.value = false
  } catch {}
  saving.value = false
}

const consentDate = computed(() => {
  if (!preview.value.consentAt) return ''
  return new Date(preview.value.consentAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
})

const isConsented = computed(() => preview.value.consent === true && !result.value)
const isNew = computed(() => preview.value.consent === null && !result.value)
const isDeclined = computed(() => preview.value.consent === false && !result.value)
</script>

<template>
  <div class="consent-page">
    <div class="consent-card">
      <div class="consent-logo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48" style="color: #1a5632;">
          <path d="M12 2L7 8h3l-4 6h3l-5 8h16l-5-8h3l-4-6h3z"/>
        </svg>
      </div>
      <h1 class="consent-title">Территория Хвойных</h1>

      <!-- No garden -->
      <div v-if="!gardenName" class="consent-body center">
        <p>Ссылка недействительна — не указан сад.</p>
      </div>

      <!-- ══════ Result screens ══════ -->
      <div v-else-if="result === 'agreed'" class="consent-body center">
        <div class="result-icon result-ok">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="32" height="32"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <p class="result-title">Спасибо!</p>
        <p>Согласие для <strong>{{ gardenName }}</strong> получено.</p>
        <p class="result-hint">Ваши растения будут отображаться на сайте <a href="https://terkaconifers.ru" target="_blank">terkaconifers.ru</a></p>
      </div>

      <div v-else-if="result === 'declined'" class="consent-body center">
        <div class="result-icon result-no">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="32" height="32"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </div>
        <p class="result-title">Понятно</p>
        <p>Растения из <strong>{{ gardenName }}</strong> не будут размещены.</p>
      </div>

      <div v-else-if="result === 'revoke_requested'" class="consent-body center">
        <div class="result-icon result-pending">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="32" height="32"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
        <p class="result-title">Запрос отправлен</p>
        <p>Команда получила ваш запрос на отзыв публикации <strong>{{ gardenName }}</strong>. Мы свяжемся с вами для подтверждения.</p>
      </div>

      <!-- ══════ Already consented — status card ══════ -->
      <template v-else-if="isConsented">
        <div class="status-card status-active">
          <div class="status-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          </div>
          <div class="status-info">
            <p class="status-label">Сад размещён на сайте</p>
            <p class="status-garden">{{ gardenName }}</p>
            <p v-if="consentDate" class="status-date">Согласие получено {{ consentDate }}</p>
          </div>
        </div>

        <!-- Preview -->
        <div v-if="preview.count > 0" class="preview">
          <p class="preview-count"><strong>{{ preview.count }}</strong> растений в каталоге</p>
          <div class="preview-mosaic">
            <div v-for="p in preview.plants" :key="p.latin_full" class="preview-cell">
              <img v-if="p.thumb" :src="thumbWebpUrl(p.thumb)" :alt="p.latin_full" loading="lazy">
              <div v-else class="preview-empty" />
            </div>
          </div>
          <a href="https://terkaconifers.ru/catalog" target="_blank" class="preview-link">Смотреть на сайте</a>
        </div>

        <!-- Contact / Revoke section -->
        <div class="contact-section">
          <p class="contact-title">Связаться с командой</p>
          <p class="contact-desc">Изменить информацию, обновить фото или убрать сад с сайта</p>

          <div v-if="!showContact && !contactSent" class="contact-actions">
            <button class="btn-contact" @click="showContact = true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
              Написать
            </button>
            <button class="btn-revoke" :disabled="saving" @click="submitAction('revoke')">
              Отозвать публикацию
            </button>
          </div>

          <!-- Contact form -->
          <div v-if="showContact && !contactSent" class="contact-form">
            <div class="cf-field">
              <label>Ваше имя</label>
              <input v-model="contactForm.name" type="text" placeholder="Иван Петров">
            </div>
            <div class="cf-field">
              <label>Как с вами связаться *</label>
              <input v-model="contactForm.contact" type="text" placeholder="Telegram, телефон или email">
            </div>
            <div class="cf-field">
              <label>Сообщение *</label>
              <textarea v-model="contactForm.message" rows="3" placeholder="Что хотите изменить или сообщить..." />
            </div>
            <div class="cf-actions">
              <button class="btn-agree" style="font-size: 14px; padding: 12px;" :disabled="saving || !contactForm.contact.trim() || !contactForm.message.trim()" @click="sendContact">
                {{ saving ? 'Отправка...' : 'Отправить' }}
              </button>
              <button class="btn-decline" style="font-size: 13px; padding: 10px;" @click="showContact = false">Отмена</button>
            </div>
          </div>

          <!-- Contact sent -->
          <div v-if="contactSent" class="contact-sent">
            <svg viewBox="0 0 24 24" fill="none" stroke="#2e7d32" stroke-width="2" width="20" height="20"><polyline points="20 6 9 17 4 12"/></svg>
            <span>Сообщение отправлено! Команда свяжется с вами.</span>
          </div>
        </div>
      </template>

      <!-- ══════ Previously declined ══════ -->
      <template v-else-if="isDeclined">
        <p class="consent-garden">{{ gardenName }}</p>
        <div class="consent-body center">
          <p>Ранее вы отклонили размещение. Если передумали — можете дать согласие сейчас.</p>
        </div>
        <div v-if="preview.count > 0" class="preview">
          <p class="preview-count"><strong>{{ preview.count }}</strong> растений готовы к публикации</p>
          <div class="preview-mosaic">
            <div v-for="p in preview.plants" :key="p.latin_full" class="preview-cell">
              <img v-if="p.thumb" :src="thumbWebpUrl(p.thumb)" :alt="p.latin_full" loading="lazy">
              <div v-else class="preview-empty" />
            </div>
          </div>
        </div>
        <div class="consent-buttons">
          <button class="btn-agree" :disabled="saving" @click="submitAction('agree')">Даю согласие</button>
        </div>
      </template>

      <!-- ══════ New — first visit ══════ -->
      <template v-else-if="isNew">
        <div class="consent-body">
          <p class="consent-garden">{{ gardenName }}</p>

          <div v-if="preview.count > 0" class="preview">
            <p class="preview-count">В каталоге <strong>{{ preview.count }}</strong> растений из вашего сада</p>
            <div class="preview-mosaic">
              <div v-for="p in preview.plants" :key="p.latin_full" class="preview-cell">
                <img v-if="p.thumb" :src="thumbWebpUrl(p.thumb)" :alt="p.latin_full" loading="lazy">
                <div v-else class="preview-empty" />
              </div>
            </div>
            <p v-if="preview.count > 12" class="preview-more">и ещё {{ preview.count - 12 }}</p>
          </div>

          <p class="consent-text">
            Вы даёте согласие на размещение фотографий и информации о растениях из вашего сада
            в каталоге <strong>«Территория хвойных»</strong> на сайте
            <a href="https://terkaconifers.ru" target="_blank">terkaconifers.ru</a>
            и в канале MAX.
          </p>
          <p class="consent-text">Вы подтверждаете, что:</p>
          <ul class="consent-list">
            <li>Фотографии принадлежат вам</li>
            <li>Растения действительно произрастают в вашем саду</li>
            <li>Вы согласны на публикацию на сайте и в каналах проекта</li>
          </ul>
          <p class="consent-text consent-note">
            Вы можете отозвать согласие в любой момент по этой же ссылке.
          </p>
        </div>
        <div class="consent-buttons">
          <button class="btn-agree" :disabled="saving" @click="submitAction('agree')">Даю согласие</button>
          <button class="btn-decline" :disabled="saving" @click="submitAction('decline')">Не согласен</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.consent-page {
  min-height: 100dvh;
  display: flex; align-items: center; justify-content: center;
  padding: 24px 16px;
  background: linear-gradient(135deg, #e8f5e9 0%, #f1f8e9 50%, #e0f2f1 100%);
}
.consent-card {
  background: #fff; border-radius: 20px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.08);
  max-width: 520px; width: 100%;
  padding: 32px 28px; text-align: center;
}
.consent-logo { margin-bottom: 12px; }
.consent-title { font-size: 20px; font-weight: 700; color: #1a5632; margin-bottom: 24px; }

.consent-body { text-align: left; }
.center { text-align: center; }
.consent-garden {
  font-size: 18px; font-weight: 700; color: #1a5632;
  text-align: center; margin-bottom: 16px;
  padding: 10px 16px; background: #e8f5e9; border-radius: 10px;
}

/* Status card (consented state) */
.status-card {
  display: flex; align-items: center; gap: 16px;
  padding: 18px 20px; border-radius: 14px; margin-bottom: 20px;
  text-align: left;
}
.status-active { background: #e8f5e9; border: 1.5px solid #a5d6a7; }
.status-icon { color: #2e7d32; flex-shrink: 0; }
.status-info { flex: 1; }
.status-label { font-size: 12px; font-weight: 600; color: #2e7d32; text-transform: uppercase; letter-spacing: 0.5px; }
.status-garden { font-size: 17px; font-weight: 700; color: #1a5632; margin-top: 2px; }
.status-date { font-size: 12px; color: #66bb6a; margin-top: 2px; }

/* Preview mosaic */
.preview { margin-bottom: 20px; }
.preview-count { font-size: 14px; color: #333; text-align: center; margin-bottom: 12px; }
.preview-mosaic { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; border-radius: 12px; overflow: hidden; }
.preview-cell { aspect-ratio: 1; overflow: hidden; background: #f0f4f0; }
.preview-cell img { width: 100%; height: 100%; object-fit: cover; display: block; }
.preview-empty { width: 100%; height: 100%; background: #e8ece8; }
.preview-more { font-size: 12px; color: #999; text-align: center; margin-top: 8px; }
.preview-link {
  display: inline-block; margin-top: 10px;
  font-size: 13px; font-weight: 600; color: #1a5632;
}

/* Contact / Revoke section */
.contact-section {
  margin-top: 24px; padding-top: 20px;
  border-top: 1px solid #e8e8e8; text-align: center;
}
.contact-title { font-size: 15px; font-weight: 700; color: #333; margin-bottom: 4px; }
.contact-desc { font-size: 13px; color: #999; margin-bottom: 14px; }

.contact-actions { display: flex; gap: 8px; }
.btn-contact {
  flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 12px; background: #1a5632; color: #fff;
  border: none; border-radius: 12px; font-size: 14px; font-weight: 600;
  cursor: pointer; transition: background 0.15s;
}
.btn-contact:hover { background: #0f3a20; }
.btn-revoke {
  flex: 1; padding: 12px;
  background: none; color: #999; border: 1.5px solid #ddd; border-radius: 12px;
  font-size: 13px; font-weight: 500; cursor: pointer;
  transition: all 0.15s;
}
.btn-revoke:hover { border-color: #e53935; color: #e53935; }

/* Contact form */
.contact-form { text-align: left; }
.cf-field { margin-bottom: 12px; }
.cf-field label { display: block; font-size: 12px; font-weight: 600; color: #666; margin-bottom: 4px; }
.cf-field input, .cf-field textarea {
  width: 100%; padding: 10px 14px;
  background: #f9faf9; border: 1.5px solid #ddd; border-radius: 10px;
  font-size: 14px; color: #333; outline: none;
  font-family: inherit; resize: vertical;
  transition: border-color 0.15s;
}
.cf-field input:focus, .cf-field textarea:focus { border-color: #1a5632; }
.cf-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }

.contact-sent {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 14px; background: #e8f5e9; border-radius: 10px;
  font-size: 13px; font-weight: 600; color: #2e7d32;
}

/* Text */
.consent-text { font-size: 14px; color: #333; line-height: 1.6; margin-bottom: 12px; }
.consent-text a { color: #1a5632; font-weight: 600; }
.consent-note { font-size: 12px; color: #999; font-style: italic; }
.consent-list { font-size: 14px; color: #333; line-height: 1.8; padding-left: 20px; margin-bottom: 16px; }
.consent-list li::marker { color: #1a5632; }

/* Buttons */
.consent-buttons { display: flex; flex-direction: column; gap: 10px; margin-top: 24px; }
.btn-agree {
  width: 100%; padding: 14px; background: #1a5632; color: #fff;
  border: none; border-radius: 12px; font-size: 16px; font-weight: 700;
  cursor: pointer; transition: background 0.15s;
}
.btn-agree:hover { background: #0f3a20; }
.btn-agree:disabled { opacity: 0.6; }
.btn-decline {
  width: 100%; padding: 12px; background: none; color: #999;
  border: 1.5px solid #ddd; border-radius: 12px;
  font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.15s;
}
.btn-decline:hover { border-color: #999; color: #666; }

/* Results */
.result-icon { width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; }
.result-ok { background: #e8f5e9; color: #2e7d32; }
.result-no { background: #fce4ec; color: #c62828; }
.result-pending { background: #fff3e0; color: #e65100; }
.result-title { font-size: 20px; font-weight: 700; margin-bottom: 8px; color: #333; }
.result-hint { font-size: 13px; color: #999; margin-top: 8px; }
.result-hint a { color: #1a5632; font-weight: 600; }
</style>
