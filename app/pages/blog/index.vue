<script setup lang="ts">
useHead({ title: 'Блог — Территория Хвойных' })
</script>

<template>
  <div class="blog-page container">
    <h1>Блог</h1>
    <p class="coming-soon">Скоро здесь появятся статьи о хвойных растениях, уходе и ландшафтном дизайне.</p>
  </div>
</template>

<style scoped>
.blog-page { padding: 32px 16px 64px; }
h1 { font-size: 28px; font-weight: 700; margin-bottom: 16px; }
.coming-soon { color: var(--text-muted); font-size: 15px; }
</style>
