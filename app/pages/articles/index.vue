<script setup lang="ts">
useHead({ title: 'Статьи о хвойных растениях — Территория Хвойных' })

useSeoMeta({
  description: 'Полезные статьи о хвойных растениях: уход, выбор сортов, ландшафтный дизайн, зимостойкость. Опыт коллекционеров из частных садов России.',
})

const { data: articles, pending: loading } = await useFetch<any[]>('/api/articles')
</script>

<template>
  <div class="articles-page container">
    <BreadCrumbs :items="[{ label: 'Главная', to: '/' }, { label: 'Статьи' }]" />
    <h1>Статьи</h1>
    <p class="page-desc">Полезные материалы о хвойных растениях, уходе и ландшафтном дизайне</p>

    <div v-if="loading" class="loading">Загрузка...</div>

    <div v-else-if="!articles || articles.length === 0" class="empty">
      <p>Статьи скоро появятся</p>
      <p class="empty-hint">Мы готовим интересные материалы о хвойных растениях</p>
    </div>

    <div v-else class="articles-grid">
      <NuxtLink
        v-for="article in articles"
        :key="article.id"
        :to="`/articles/${article.id}`"
        class="article-card"
      >
        <div v-if="article.image" class="article-img">
          <img :src="article.image" :alt="article.title" loading="lazy">
        </div>
        <div class="article-body">
          <span class="article-date">{{ article.date }}</span>
          <h2 class="article-title">{{ article.title }}</h2>
          <p v-if="article.excerpt" class="article-excerpt">{{ article.excerpt }}</p>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.articles-page { padding: 20px 16px 80px; }
h1 { font-size: 24px; font-weight: 700; }
.page-desc { font-size: 14px; color: var(--text-muted); margin: 4px 0 24px; }

.loading, .empty { text-align: center; padding: 48px 0; color: var(--text-muted); }
.empty-hint { font-size: 13px; margin-top: 4px; }

.articles-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

@media (min-width: 640px) { .articles-grid { grid-template-columns: repeat(2, 1fr); } }
@media (min-width: 1024px) { .articles-grid { grid-template-columns: repeat(3, 1fr); } }

.article-card {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  transition: box-shadow 0.2s;
}

@media (min-width: 1024px) { .article-card:hover { box-shadow: var(--shadow-card-hover); } }

.article-img {
  aspect-ratio: 16/9;
  overflow: hidden;
  background: var(--bg-alt);
}

.article-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.article-body { padding: 14px 16px 18px; }

.article-date {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.article-title {
  font-size: 16px;
  font-weight: 700;
  margin-top: 4px;
  line-height: 1.3;
  color: var(--text);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.article-excerpt {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 6px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
