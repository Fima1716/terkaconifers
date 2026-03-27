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
    <div class="update-inner">
      <span class="update-dot" />
      <span class="update-text">
        Каталог обновлён {{ formattedDate }}
      </span>
      <span v-if="newCount > 0" class="update-new">
        +{{ newCount }} новых
      </span>
    </div>
  </div>
</template>

<style scoped>
.update-bar {
  padding: 8px 16px;
}

.update-inner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: var(--bg-alt);
  border-radius: 20px;
  width: fit-content;
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
  font-size: 11px;
  font-weight: 700;
  color: #ff6d00;
  background: #fff3e0;
  padding: 2px 8px;
  border-radius: 10px;
}
</style>
