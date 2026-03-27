<script setup lang="ts">
const pub = usePublicUrl()
</script>

<template>
  <footer class="footer">
    <div class="footer-inner container">
      <div class="footer-left">
        <span class="footer-copy">&copy; {{ new Date().getFullYear() }} Территория хвойных</span>
        <span class="footer-sep">·</span>
        <NuxtLink to="/privacy" class="footer-link">Политика конфиденциальности</NuxtLink>
      </div>
      <div class="footer-social">
        <a href="https://t.me/terka_conifers" target="_blank" rel="noopener" title="Telegram">
          <img :src="pub('images/telegram-logo.svg')" width="18" height="18" alt="Telegram" style="border-radius: 3px;">
        </a>
        <a href="https://max.ru/id592005855318_biz" target="_blank" rel="noopener" title="MAX">
          <img :src="pub('images/max-logo.svg')" width="18" height="18" alt="MAX" style="border-radius: 3px;">
        </a>
        <a href="https://dzen.ru/rusinovsad" target="_blank" rel="noopener" title="Дзен">
          <img :src="pub('images/dzen-light.svg')" height="18" style="width: auto;" alt="Дзен">
        </a>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.footer { background: var(--primary-dark); color: rgba(255,255,255,0.5); }
@media (max-width: 1023px) { .footer { display: none; } }
.footer-inner { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; }
.footer-left { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.footer-sep { opacity: 0.3; }
.footer-link { opacity: 0.7; transition: opacity 0.15s; }
.footer-link:hover { opacity: 1; }
.footer-social { display: flex; align-items: center; gap: 10px; }
.footer-social a { opacity: 0.5; transition: opacity 0.15s; display: flex; }
.footer-social a:hover { opacity: 1; }
</style>
