<script setup lang="ts">
import type { Plant } from '~/stores/catalog'

defineProps<{
  plants: Plant[]
  eagerCount?: number
}>()

// Load garden + per-plant buy links once (only if showBuyButtons enabled)
const buyLinks = ref<Record<string, string>>({})
const plantBuyLinks = ref<Record<string, string>>({})
const buyEnabled = ref(false)
onMounted(async () => {
  try {
    const data = await $fetch<any>(`/api/gardens?_=${Date.now()}`)
    if (!data.showBuyButtons) return
    buyEnabled.value = true
    const links: Record<string, string> = {}
    for (const [name, profile] of Object.entries(data.gardens || {})) {
      if ((profile as any).buyLink) links[name] = (profile as any).buyLink
    }
    buyLinks.value = links
    plantBuyLinks.value = data.plantBuyLinks || {}
  } catch {}
})
</script>

<template>
  <div class="plant-grid">
    <PlantCard v-for="(plant, i) in plants" :key="plant.id" :plant="plant" :eager="i < (eagerCount ?? 0)" :buy-link="buyEnabled ? (plantBuyLinks[String(plant.id)] || buyLinks[plant.garden_display] || undefined) : undefined" />
  </div>
</template>

<style scoped>
.plant-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

@media (min-width: 640px) {
  .plant-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
  }
}

@media (min-width: 1024px) {
  .plant-grid {
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
  }
}

@media (min-width: 1280px) {
  .plant-grid {
    grid-template-columns: repeat(5, 1fr);
  }
}
</style>
