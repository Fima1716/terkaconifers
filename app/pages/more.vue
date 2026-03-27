<script setup lang="ts">
const pub = usePublicUrl()
useHead({ title: 'Профиль — Территория Хвойных' })
</script>

<template>
  <div class="more-page container">
    <!-- Social links -->
    <div class="social-row">
      <a href="https://t.me/terka_conifers" target="_blank" rel="noopener" class="social-circle">
        <img :src="pub('images/telegram-logo.svg')"  width="28" height="28" alt="Telegram" style="border-radius: 6px;">
      </a>
      <a href="https://max.ru/id592005855318_biz" target="_blank" rel="noopener" class="social-circle">
        <img :src="pub('images/max-logo.svg')"  width="28" height="28" alt="MAX" style="border-radius: 6px;">
      </a>
      <a href="https://dzen.ru/rusinovsad" target="_blank" rel="noopener" class="social-circle">
        <img :src="pub('images/zen-icon.svg')"  width="28" height="28" alt="Дзен" style="border-radius: 6px;">
      </a>
    </div>

    <!-- Pages -->
    <div class="nav-list">
      <NuxtLink to="/gardens" class="nav-card">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
        <span>Сады</span>
        <svg class="nav-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M9 18l6-6-6-6"/></svg>
      </NuxtLink>
      <!-- <NuxtLink to="/exchange" class="nav-card">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>
        <span>Обмен растениями</span>
        <svg class="nav-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M9 18l6-6-6-6"/></svg>
      </NuxtLink> -->
      <NuxtLink to="/privacy" class="nav-card">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        <span>Политика конфиденциальности</span>
        <svg class="nav-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M9 18l6-6-6-6"/></svg>
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.more-page { padding: 20px 16px 80px; }

/* Social row */
.social-row {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-bottom: 32px;
}

.social-circle {
  width: 56px; height: 56px;
  border-radius: 50%;
  background: var(--bg-alt);
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s;
}

.social-circle:active { background: var(--border); }

/* Nav list */
.nav-list { display: flex; flex-direction: column; gap: 2px; }

.nav-card {
  display: flex; align-items: center; gap: 12px;
  padding: 14px;
  border-radius: 12px;
  font-size: 15px; font-weight: 500;
  color: var(--text);
}

.nav-card:active { background: var(--bg-alt); }
.nav-card svg:first-child { color: var(--text-muted); flex-shrink: 0; }
.nav-card span { flex: 1; }
.nav-arrow { color: var(--border); flex-shrink: 0; }
</style>
