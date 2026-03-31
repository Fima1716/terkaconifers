<script setup lang="ts">
const pub = usePublicUrl()
const { catalog } = useCatalogStore()

useHead({ title: 'Ещё — Территория Хвойных' })

const plantCount = computed(() => catalog.length || 0)
const gardenCount = computed(() => new Set(catalog.map(p => p.garden_display).filter(Boolean)).size)
</script>

<template>
  <div class="more-page container">
    <!-- Stats banner -->
    <div class="stats-banner">
      <div class="stats-row">
        <div class="stat"><span class="stat-num">{{ plantCount }}</span><span class="stat-label">растений</span></div>
        <div class="stat-div" />
        <div class="stat"><span class="stat-num">{{ gardenCount }}</span><span class="stat-label">садов</span></div>
      </div>
    </div>

    <!-- Main navigation -->
    <div class="nav-section">
      <div class="nav-section-title">Каталог</div>
      <div class="nav-list">
        <NuxtLink to="/catalog" class="nav-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <span>Каталог растений</span>
          <svg class="nav-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M9 18l6-6-6-6"/></svg>
        </NuxtLink>
        <NuxtLink to="/gardens" class="nav-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <span>Сады и коллекции</span>
          <svg class="nav-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M9 18l6-6-6-6"/></svg>
        </NuxtLink>
        <NuxtLink to="/map" class="nav-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
          <span>Карта садов</span>
          <svg class="nav-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M9 18l6-6-6-6"/></svg>
        </NuxtLink>
        <NuxtLink to="/favorites" class="nav-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
          <span>Избранное</span>
          <svg class="nav-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M9 18l6-6-6-6"/></svg>
        </NuxtLink>
      </div>
    </div>

    <div class="nav-section">
      <div class="nav-section-title">О проекте</div>
      <div class="nav-list">
        <NuxtLink to="/team" class="nav-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
          <span>Команда</span>
          <svg class="nav-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M9 18l6-6-6-6"/></svg>
        </NuxtLink>
        <NuxtLink to="/articles" class="nav-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
          <span>Статьи</span>
          <svg class="nav-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M9 18l6-6-6-6"/></svg>
        </NuxtLink>
        <NuxtLink to="/about" class="nav-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          <span>О нас</span>
          <svg class="nav-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M9 18l6-6-6-6"/></svg>
        </NuxtLink>
        <NuxtLink to="/privacy" class="nav-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <span>Конфиденциальность</span>
          <svg class="nav-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M9 18l6-6-6-6"/></svg>
        </NuxtLink>
      </div>
    </div>

    <!-- Social links -->
    <div class="nav-section">
      <div class="nav-section-title">Мы в соцсетях</div>
      <div class="social-row">
        <a href="https://t.me/terka_conifers" target="_blank" rel="noopener" class="social-card">
          <img :src="pub('images/telegram-logo.svg')" width="28" height="28" alt="Telegram" style="border-radius: 6px;">
          <span>Telegram</span>
        </a>
        <a href="https://max.ru/id592005855318_biz" target="_blank" rel="noopener" class="social-card">
          <img :src="pub('images/max-logo.svg')" width="28" height="28" alt="MAX" style="border-radius: 6px;">
          <span>MAX</span>
        </a>
        <a href="https://dzen.ru/rusinovsad" target="_blank" rel="noopener" class="social-card">
          <img :src="pub('images/zen-icon.svg')" width="28" height="28" alt="Дзен" style="border-radius: 6px;">
          <span>Дзен</span>
        </a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.more-page { padding: 16px 16px 100px; }

/* Stats banner */
.stats-banner {
  text-align: center; padding: 20px 16px;
  background: var(--bg-alt); border-radius: 16px;
  margin-bottom: 24px;
}
.stats-row { display: flex; justify-content: center; gap: 24px; align-items: center; }
.stat { display: flex; flex-direction: column; align-items: center; }
.stat-num { font-size: 20px; font-weight: 700; color: var(--primary); }
.stat-label { font-size: 11px; color: var(--text-muted); }
.stat-div { width: 1px; height: 28px; background: var(--border); }

/* Sections */
.nav-section { margin-bottom: 20px; }
.nav-section-title { font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.8px; padding: 0 4px; margin-bottom: 6px; }

/* Nav list */
.nav-list { display: flex; flex-direction: column; gap: 2px; }
.nav-card {
  display: flex; align-items: center; gap: 14px;
  padding: 14px 12px; border-radius: 12px;
  font-size: 15px; font-weight: 500; color: var(--text);
  transition: background 0.1s;
}
.nav-card:active { background: var(--bg-alt); }
.nav-card svg:first-child { color: var(--text-muted); flex-shrink: 0; }
.nav-card span { flex: 1; }
.nav-arrow { color: var(--border); flex-shrink: 0; }

/* Social */
.social-row { display: flex; gap: 10px; }
.social-card {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 16px 8px; border-radius: 14px;
  background: var(--bg-alt); font-size: 12px; font-weight: 600;
  color: var(--text-secondary); transition: background 0.1s;
}
.social-card:active { background: var(--border); }
</style>
