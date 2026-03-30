<script setup lang="ts">
import { photoUrl, thumbWebpUrl } from '~/utils/photoUrl'

const route = useRoute()
const gardenName = computed(() => (route.query.garden as string) || '')
const status = ref<'pending' | 'agreed' | 'declined' | 'error'>('pending')
const saving = ref(false)

// Preview data
const preview = ref<{ plants: { latin_full: string; species_ru: string; thumb: string }[]; count: number }>({ plants: [], count: 0 })

onMounted(async () => {
  if (gardenName.value) {
    try {
      preview.value = await $fetch<any>(`/api/consent-preview?garden=${encodeURIComponent(gardenName.value)}`)
    } catch {}
  }
})

useHead({ title: computed(() => gardenName.value ? `Согласие — ${gardenName.value}` : 'Согласие — Территория Хвойных') })

async function submitConsent(agreed: boolean) {
  saving.value = true
  try {
    await $fetch('/api/consent-public', {
      method: 'POST',
      body: { garden: gardenName.value, agreed },
    })
    status.value = agreed ? 'agreed' : 'declined'
  } catch {
    status.value = 'error'
  }
  saving.value = false
}
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

      <!-- No garden specified -->
      <div v-if="!gardenName" class="consent-body">
        <p>Ссылка недействительна — не указан сад.</p>
      </div>

      <!-- Pending -->
      <template v-else-if="status === 'pending'">
        <div class="consent-body">
          <p class="consent-garden">{{ gardenName }}</p>

          <!-- Garden preview -->
          <div v-if="preview.count > 0" class="preview">
            <p class="preview-count">
              В каталоге <strong>{{ preview.count }}</strong> {{ preview.count === 1 ? 'растение' : preview.count < 5 ? 'растения' : 'растений' }} из вашего сада
            </p>
            <div class="preview-mosaic">
              <div v-for="p in preview.plants" :key="p.latin_full" class="preview-cell">
                <img v-if="p.thumb" :src="thumbWebpUrl(p.thumb)" :alt="p.latin_full" loading="lazy">
                <div v-else class="preview-empty" />
              </div>
            </div>
            <p v-if="preview.count > 12" class="preview-more">
              и ещё {{ preview.count - 12 }}
            </p>
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
            Вы можете отозвать согласие в любой момент, обратившись к администратору.
          </p>
        </div>
        <div class="consent-buttons">
          <button class="btn-agree" :disabled="saving" @click="submitConsent(true)">
            Даю согласие
          </button>
          <button class="btn-decline" :disabled="saving" @click="submitConsent(false)">
            Не согласен
          </button>
        </div>
      </template>

      <!-- Agreed -->
      <div v-else-if="status === 'agreed'" class="consent-body consent-result">
        <div class="result-icon result-ok">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="32" height="32"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <p class="result-title">Спасибо!</p>
        <p>Согласие для <strong>{{ gardenName }}</strong> получено. Ваши растения будут отображаться на сайте.</p>
        <p v-if="preview.count > 0" class="result-hint">{{ preview.count }} растений уже в каталоге</p>
      </div>

      <!-- Declined -->
      <div v-else-if="status === 'declined'" class="consent-body consent-result">
        <div class="result-icon result-no">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="32" height="32"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </div>
        <p class="result-title">Понятно</p>
        <p>Растения из <strong>{{ gardenName }}</strong> не будут отображаться на сайте.</p>
      </div>

      <!-- Error -->
      <div v-else class="consent-body consent-result">
        <p class="result-title">Ошибка</p>
        <p>Что-то пошло не так. Попробуйте позже или свяжитесь с администратором.</p>
      </div>
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
.consent-garden {
  font-size: 18px; font-weight: 700; color: #1a5632;
  text-align: center; margin-bottom: 16px;
  padding: 10px 16px; background: #e8f5e9; border-radius: 10px;
}

/* Preview mosaic */
.preview { margin-bottom: 20px; }
.preview-count { font-size: 14px; color: #333; text-align: center; margin-bottom: 12px; }

.preview-mosaic {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  border-radius: 12px;
  overflow: hidden;
}

.preview-cell {
  aspect-ratio: 1;
  overflow: hidden;
  background: #f0f4f0;
}
.preview-cell img {
  width: 100%; height: 100%;
  object-fit: cover;
  display: block;
}
.preview-empty { width: 100%; height: 100%; background: #e8ece8; }

.preview-more { font-size: 12px; color: #999; text-align: center; margin-top: 8px; }

.consent-text { font-size: 14px; color: #333; line-height: 1.6; margin-bottom: 12px; }
.consent-text a { color: #1a5632; font-weight: 600; }
.consent-note { font-size: 12px; color: #999; font-style: italic; }

.consent-list {
  font-size: 14px; color: #333; line-height: 1.8;
  padding-left: 20px; margin-bottom: 16px;
}
.consent-list li::marker { color: #1a5632; }

.consent-buttons {
  display: flex; flex-direction: column; gap: 10px;
  margin-top: 24px;
}

.btn-agree {
  width: 100%; padding: 14px;
  background: #1a5632; color: #fff;
  border: none; border-radius: 12px;
  font-size: 16px; font-weight: 700;
  cursor: pointer; transition: background 0.15s;
}
.btn-agree:hover { background: #0f3a20; }
.btn-agree:disabled { opacity: 0.6; }

.btn-decline {
  width: 100%; padding: 12px;
  background: none; color: #999;
  border: 1.5px solid #ddd; border-radius: 12px;
  font-size: 14px; font-weight: 500;
  cursor: pointer; transition: all 0.15s;
}
.btn-decline:hover { border-color: #999; color: #666; }
.btn-decline:disabled { opacity: 0.6; }

.consent-result { text-align: center; padding: 20px 0; }
.result-icon { width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; }
.result-ok { background: #e8f5e9; color: #2e7d32; }
.result-no { background: #fce4ec; color: #c62828; }
.result-title { font-size: 20px; font-weight: 700; margin-bottom: 8px; color: #333; }
.result-hint { font-size: 13px; color: #999; margin-top: 12px; }
</style>
