<script setup lang="ts">
import { useCatalogStore } from '~/stores/catalog'

const pub = usePublicUrl()
const catalog = useCatalogStore()

const plantCount = computed(() => catalog.catalog.length || 0)

const gardenCount = computed(() => {
  if (!catalog.isLoaded) return 0
  return new Set(catalog.catalog.map(p => p.garden_display).filter(Boolean)).size
})

const photoCount = computed(() => {
  if (!catalog.isLoaded) return 0
  return catalog.catalog.reduce((sum, p) => sum + (p.photos?.length || 0), 0)
})

function formatNum(s: string) {
  return s.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1 ')
}

const showBotModal = ref(false)
</script>

<template>
  <section class="hero" :style="{ backgroundImage: `url(${pub('images/hero-bg.png')})` }">
    <div class="hero-overlay" />
    <div class="hero-inner container">
      <div class="hero-grid">
        <!-- Left: title & CTA -->
        <div class="hero-left">
          <h1 class="hero-title">
            <span class="hero-title-big">Территория <span class="hero-highlight">хвойных</span> Каталог</span>
          </h1>
          <p class="hero-brand">ТЕРКА</p>
          <button class="hero-cta" @click="showBotModal = true">
            Добавить своё растение
          </button>
        </div>

        <!-- Right: about block -->
        <div class="hero-right">
          <div class="hero-about">
            <p class="about-text">
              Мы, коллекционеры и создатели садов, рады представить вам собрание декоративных хвойных растений с фотографиями и кратким описанием.
            </p>
            <p class="about-note">
              Просим вас уважать наш труд и не использовать информацию в корыстных целях.
            </p>
            <div class="about-stats">
              <div class="about-stat">
                <span class="about-stat-num">{{ formatNum(String(plantCount)) }}</span>
                <span class="about-stat-label">сортов</span>
              </div>
              <div class="about-stat">
                <span class="about-stat-num">{{ formatNum(String(gardenCount)) }}</span>
                <span class="about-stat-label">садов</span>
              </div>
              <div class="about-stat">
                <span class="about-stat-num">{{ formatNum(String(photoCount)) }}</span>
                <span class="about-stat-label">фото</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Bot selection modal -->
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="showBotModal" class="bot-overlay" @click.self="showBotModal = false">
        <div class="bot-modal">
          <button class="bot-close" @click="showBotModal = false">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <h2 class="bot-title">Добавить растение</h2>
          <p class="bot-desc">Отправьте фото и описание через бота — мы добавим ваше растение в каталог</p>
          <div class="bot-options">
            <a href="https://t.me/LeshiyTerkaBot" target="_blank" class="bot-option" @click="showBotModal = false">
              <img :src="pub('images/telegram-logo.svg')" width="36" height="36" alt="Telegram" class="bot-logo">
              <div class="bot-option-info">
                <span class="bot-option-name">Telegram</span>
                <span class="bot-option-handle">@LeshiyTerkaBot</span>
              </div>
              <svg class="bot-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </a>
            <a href="https://max.ru/id592005855318_1_bot" target="_blank" class="bot-option" @click="showBotModal = false">
              <img :src="pub('images/max-logo.svg')" width="36" height="36" alt="MAX" class="bot-logo">
              <div class="bot-option-info">
                <span class="bot-option-name">MAX</span>
                <span class="bot-option-handle">Леший</span>
              </div>
              <svg class="bot-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </a>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.hero {
  background-size: cover; background-position: center; background-repeat: no-repeat;
  padding: 40px 0;
  color: #fff;
  position: relative;
  overflow: hidden;
  min-height: 320px;
  display: flex;
  align-items: center;
}

@media (min-width: 480px) {
  .hero { padding: 56px 0; min-height: 380px; }
}

.hero-overlay {
  position: absolute; inset: 0;
  background: linear-gradient(to right, rgba(10, 30, 18, 0.82) 0%, rgba(10, 30, 18, 0.55) 50%, rgba(10, 30, 18, 0.35) 100%);
  z-index: 0;
}

.hero-inner { position: relative; z-index: 1; width: 100%; }

.hero-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 40px;
  align-items: center;
}

@media (min-width: 768px) {
  .hero-grid { grid-template-columns: 1fr 1fr; gap: 48px; }
}

/* Left */
.hero-left { display: flex; flex-direction: column; align-items: flex-start; }

.hero-left { display: flex; flex-direction: column; align-items: flex-start; }

.hero-title { margin: 0; }

.hero-title-big {
  font-size: 28px; font-weight: 800; letter-spacing: -0.3px; line-height: 1.15;
}
@media (min-width: 480px) { .hero-title-big { font-size: 36px; } }
@media (min-width: 768px) { .hero-title-big { font-size: 48px; } }
@media (min-width: 1024px) { .hero-title-big { font-size: 56px; } }

.hero-highlight { color: var(--accent-light); }

.hero-brand {
  margin: 8px 0 0 0;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 7px;
  color: rgba(255, 255, 255, 0.35);
}
@media (min-width: 480px) { .hero-brand { font-size: 21px; letter-spacing: 9px; } }
@media (min-width: 768px) { .hero-brand { font-size: 24px; letter-spacing: 10px; } }

.hero-cta {
  display: inline-flex; align-items: center;
  margin-top: 16px; padding: 9px 18px;
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.85);
  border-radius: 20px; font-weight: 600; font-size: 12px;
  transition: all 0.15s; letter-spacing: 0.3px;
}
.hero-cta:hover { background: rgba(255, 255, 255, 0.15); color: #fff; border-color: rgba(255, 255, 255, 0.25); }
@media (min-width: 1024px) { .hero-cta:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.2); } }

/* Right — about block */
.hero-right { display: none; }

@media (min-width: 768px) { .hero-right { display: block; } }

.hero-about {
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  padding: 28px;
}

.about-text {
  font-size: 14px; line-height: 1.7;
  color: rgba(255, 255, 255, 0.85);
  margin-bottom: 12px;
}

.about-note {
  font-size: 12px; line-height: 1.6;
  color: rgba(255, 255, 255, 0.5);
  font-style: italic;
  margin-bottom: 20px;
}

.about-stats {
  display: flex; gap: 24px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
}

.about-stat { text-align: center; }

.about-stat-num {
  display: block;
  font-size: 22px; font-weight: 800;
  color: var(--accent-light);
}

.about-stat-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

@media (min-width: 768px) {
  .hero { padding: 100px 0; min-height: 540px; }
  .hero-title-big, .hero-title-accent { font-size: 44px; }
  .hero-sub { font-size: 16px; margin-top: 14px; }
}

@media (min-width: 1024px) {
  .hero { padding: 110px 0; min-height: 580px; }
  .hero-title-big, .hero-title-accent { font-size: 52px; }
  .hero-about { padding: 32px; }
  .about-title { font-size: 20px; }
  .about-text { font-size: 14px; }
  .about-feature { font-size: 14px; }
}

/* Bot modal */
.bot-overlay {
  position: fixed; inset: 0; z-index: 500;
  background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
}
.bot-modal {
  background: #fff; border-radius: 20px;
  max-width: 400px; width: 100%;
  padding: 28px 24px; position: relative;
  box-shadow: 0 16px 48px rgba(0,0,0,0.15);
}
.bot-close { position: absolute; top: 16px; right: 16px; background: none; border: none; color: #999; cursor: pointer; }
.bot-title { font-size: 20px; font-weight: 700; color: #1a1a1a; text-align: center; margin-bottom: 6px; }
.bot-desc { font-size: 13px; color: #999; text-align: center; margin-bottom: 20px; line-height: 1.5; }

.bot-options { display: flex; flex-direction: column; gap: 10px; }
.bot-option {
  display: flex; align-items: center; gap: 14px;
  padding: 14px 16px; border-radius: 14px;
  border: 1.5px solid #e8e8e8; background: #fff;
  text-decoration: none; transition: all 0.15s;
  -webkit-tap-highlight-color: transparent;
}
.bot-option:hover { border-color: #1a5632; background: #f5faf7; }
.bot-logo { border-radius: 10px; flex-shrink: 0; }
.bot-option-info { flex: 1; }
.bot-option-name { display: block; font-size: 16px; font-weight: 700; color: #1a1a1a; }
.bot-option-handle { display: block; font-size: 12px; color: #999; margin-top: 1px; }
.bot-arrow { color: #ccc; flex-shrink: 0; transition: color 0.15s; }
.bot-option:hover .bot-arrow { color: #1a5632; }

.modal-enter-active { transition: opacity 0.2s; }
.modal-enter-active .bot-modal { transition: transform 0.25s ease; }
.modal-leave-active { transition: opacity 0.15s; }
.modal-enter-from { opacity: 0; }
.modal-enter-from .bot-modal { transform: translateY(16px) scale(0.97); }
.modal-leave-to { opacity: 0; }
</style>
