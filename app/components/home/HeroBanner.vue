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
          <a href="https://max.ru/id592005855318_1_bot" target="_blank" class="hero-cta">
            Добавить своё растение
          </a>
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
</style>
