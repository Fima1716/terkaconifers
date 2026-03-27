<script setup lang="ts">
defineProps<{
  items: { label: string; to?: string }[]
}>()
</script>

<template>
  <nav class="bc">
    <template v-for="(item, i) in items" :key="i">
      <NuxtLink v-if="item.to" :to="item.to" class="bc-link">{{ item.label }}</NuxtLink>
      <span v-else class="bc-current">{{ item.label }}</span>
      <span v-if="i < items.length - 1" class="bc-sep">/</span>
    </template>
  </nav>
</template>

<style scoped>
.bc {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 16px;
  overflow-x: auto;
  white-space: nowrap;
  scrollbar-width: none;
}
.bc::-webkit-scrollbar { display: none; }
.bc-link { color: var(--text-secondary); }
.bc-link:hover { color: var(--primary); }
.bc-sep { margin: 0 6px; color: var(--border); }
.bc-current { color: var(--text-muted); }
@media (min-width: 768px) { .bc { font-size: 13px; } }
</style>
