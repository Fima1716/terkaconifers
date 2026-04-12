<script setup lang="ts">
const lastSync = ref<string>('')
const newCount = ref(0)

onMounted(async () => {
  try {
    const state = await $fetch<any>('/api/sync-status')
    lastSync.value = state.last_sync
    newCount.value = state.new_count
  } catch {}
})

const formattedDate = computed(() => {
  if (!lastSync.value) return ''
  const d = new Date(lastSync.value)
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
})
</script>

<template>
  <div v-if="formattedDate" class="update-bar container">
    <NuxtLink :to="newCount > 0 ? '/catalog?new=1' : '/catalog'" class="update-inner">
      <span class="update-dot" />
      <span class="update-text">
        Каталог обновлён {{ formattedDate }}
      </span>
      <span v-if="newCount > 0" class="update-new">
        +{{ newCount }} новых
      </span>
    </NuxtLink>
  </div>
</template>

<style scoped>
.update-bar {
  padding: 8px 16px;
}

.update-inner {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: var(--bg-alt);
  border-radius: 20px;
  width: fit-content;
  text-decoration: none;
  color: inherit;
  transition: background 0.15s, box-shadow 0.15s;
  cursor: pointer;
}

.update-inner:hover {
  background: var(--border-light);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.update-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--success);
  flex-shrink: 0;
}

.update-text {
  font-size: 12px;
  color: var(--text-muted);
}

.update-new {
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  background: #ff6d00;
  padding: 5px 14px;
  border-radius: 14px;
  box-shadow: 0 2px 8px rgba(255, 109, 0, 0.3);
  transition: background 0.15s, transform 0.15s, box-shadow 0.15s;
}

.update-inner:hover .update-new {
  background: #e65100;
  transform: scale(1.05);
  box-shadow: 0 3px 12px rgba(255, 109, 0, 0.4);
}
</style>
