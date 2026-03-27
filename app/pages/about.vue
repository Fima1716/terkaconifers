<script setup lang="ts">
useHead({ title: 'О нас — Территория Хвойных' })
</script>

<template>
  <div class="about-page container">
    <BreadCrumbs :items="[{ label: 'Главная', to: '/' }, { label: 'О нас' }]" />
    <h1>О нас</h1>
    <div class="content">
      <p class="lead">
        Мы, коллекционеры и создатели садов, рады представить вам собрание
        декоративных хвойных растений с фотографиями и кратким описанием.
      </p>
      <p>
        В нашем каталоге представлено более 2 300 сортов из 18 родов хвойных растений.
        Каждое растение — это реальный экземпляр, растущий в частном саду или питомнике
        на территории России, с документальным подтверждением в виде фотографий.
      </p>
      <p class="note">
        Просим вас уважать наш труд и не использовать информацию в корыстных целях.
      </p>

      <h2>Что мы предлагаем</h2>
      <ul>
        <li>Обширный каталог с детальной ботанической информацией</li>
        <li>Фотографии реальных растений из частных коллекций</li>
        <li>Информация о зимостойкости и регионах произрастания</li>
        <li>Прямая связь с коллекционерами и питомниками</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.about-page { padding: 32px 16px 64px; max-width: 800px; }
h1 { font-size: 28px; font-weight: 700; margin-bottom: 24px; }
.content h2 { font-size: 20px; font-weight: 600; margin: 24px 0 12px; }
.lead { font-size: 17px; line-height: 1.7; color: var(--text); font-weight: 500; margin-bottom: 16px; }
.content p { margin-bottom: 16px; line-height: 1.7; color: var(--text-secondary); }
.note { font-style: italic; color: var(--text-muted); font-size: 14px; border-left: 3px solid var(--primary); padding-left: 16px; }
.content ul { padding-left: 20px; margin-bottom: 16px; }
.content li { margin-bottom: 8px; line-height: 1.6; color: var(--text-secondary); }
</style>
