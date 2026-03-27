<script setup lang="ts">
const route = useRoute()
const { data: article, pending: loading } = await useFetch<any>(`/api/articles/${route.params.id}`)

useHead({
  title: computed(() => article.value ? `${article.value.title} — Территория Хвойных` : 'Статья'),
})

useSeoMeta({
  description: computed(() => article.value?.excerpt || ''),
  ogTitle: computed(() => article.value?.title || ''),
  ogDescription: computed(() => article.value?.excerpt || ''),
  ogImage: computed(() => article.value?.image || ''),
  ogType: 'article',
})
</script>

<template>
  <div class="article-page container">
    <div v-if="loading" class="loading">Загрузка...</div>

    <div v-else-if="!article" class="not-found">
      <p>Статья не найдена</p>
      <NuxtLink to="/articles">Все статьи</NuxtLink>
    </div>

    <template v-else>
      <nav class="breadcrumbs">
        <NuxtLink to="/">Главная</NuxtLink>
        <span class="sep">/</span>
        <NuxtLink to="/articles">Статьи</NuxtLink>
        <span class="sep">/</span>
        <span>{{ article.title }}</span>
      </nav>

      <article class="article">
        <span class="article-date">{{ article.date }}</span>
        <h1>{{ article.title }}</h1>

        <div v-if="article.image" class="article-hero">
          <img :src="article.image" :alt="article.title">
        </div>

        <div class="article-content" v-html="article.html" />

        <div class="article-footer">
          <NuxtLink to="/articles" class="back-link">← Все статьи</NuxtLink>
        </div>
      </article>
    </template>
  </div>
</template>

<style scoped>
.article-page { padding: 20px 16px 80px; max-width: 800px; }

.loading, .not-found { text-align: center; padding: 48px 0; color: var(--text-muted); }

.breadcrumbs { font-size: 12px; color: var(--text-muted); margin-bottom: 20px; overflow-x: auto; white-space: nowrap; }
.breadcrumbs a { color: var(--text-secondary); }
.sep { margin: 0 6px; color: var(--border); }

.article-date { font-size: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px; }

.article h1 { font-size: 26px; font-weight: 700; margin: 8px 0 20px; line-height: 1.3; }

.article-hero { border-radius: var(--radius); overflow: hidden; margin-bottom: 24px; }
.article-hero img { width: 100%; height: auto; }

.article-content { font-size: 15px; line-height: 1.8; color: var(--text-secondary); }
.article-content :deep(h2) { font-size: 20px; font-weight: 700; color: var(--text); margin: 28px 0 12px; }
.article-content :deep(h3) { font-size: 17px; font-weight: 600; color: var(--text); margin: 20px 0 8px; }
.article-content :deep(p) { margin-bottom: 14px; }
.article-content :deep(ul), .article-content :deep(ol) { padding-left: 20px; margin-bottom: 14px; }
.article-content :deep(li) { margin-bottom: 6px; }
.article-content :deep(img) { max-width: 100%; border-radius: 8px; margin: 16px 0; }
.article-content :deep(strong) { color: var(--text); }

.article-footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid var(--border-light); }
.back-link { color: var(--primary); font-weight: 600; font-size: 14px; }
</style>
