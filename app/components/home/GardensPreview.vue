<script setup lang="ts">
import { useCatalogStore } from '~/stores/catalog'

const catalog = useCatalogStore()
onMounted(() => { if (!catalog.isLoaded) catalog.loadCatalog() })

const gardens = computed(() => {
  const map = new Map<string, { display: string; type_ru: string; count: number; region: string }>()
  for (const p of catalog.catalog) {
    if (!p.garden_display) continue
    const existing = map.get(p.garden_display)
    if (existing) {
      existing.count++
    } else {
      map.set(p.garden_display, {
        display: p.garden_display,
        type_ru: p.garden_type_ru,
        count: 1,
        region: p.region_normalized || '',
      })
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 18)
})
</script>

<template>
  <section class="gardens-section">
    <div class="container">
      <div class="section-header">
        <h2 class="section-title">Сады и коллекции</h2>
        <NuxtLink to="/gardens" class="see-all">
          Все сады
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M9 18l6-6-6-6"/></svg>
        </NuxtLink>
      </div>

      <!-- Mobile: horizontal scroll tags -->
      <div class="gardens-scroll mobile-only">
        <NuxtLink
          v-for="g in gardens"
          :key="g.display"
          :to="`/garden/${encodeURIComponent(g.display)}`"
          class="garden-tag"
        >
          <span class="gt-name">{{ g.display }}</span>
          <span class="gt-count">{{ g.count }}</span>
        </NuxtLink>
      </div>

      <!-- Desktop: grid -->
      <div class="gardens-grid desktop-only">
        <NuxtLink
          v-for="g in gardens"
          :key="g.display"
          :to="`/garden/${encodeURIComponent(g.display)}`"
          class="garden-chip"
        >
          <span class="garden-icon" :class="g.type_ru === 'Питомник' ? 'nursery' : ''">
            <svg v-if="g.type_ru === 'Питомник'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M12 2L7 8h3l-4 6h3l-5 8h16l-5-8h3l-4-6h3z"/></svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </span>
          <span class="garden-name">{{ g.display }}</span>
          <span class="garden-count">{{ g.count }}</span>
        </NuxtLink>
      </div>
    </div>
  </section>
</template>

<style scoped>
.gardens-section { padding: 32px 0; }

.section-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 14px;
}

.section-title { font-size: 20px; font-weight: 700; color: var(--text); }

.see-all {
  display: flex; align-items: center; gap: 4px;
  font-size: 13px; font-weight: 600; color: var(--primary);
}

/* Mobile: horizontal scroll */
.mobile-only { display: block; }
.desktop-only { display: none; }

@media (min-width: 1024px) {
  .mobile-only { display: none; }
  .desktop-only { display: grid; }
}

.gardens-scroll {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  padding-bottom: 4px;
  margin: 0 -16px;
  padding-left: 16px;
  padding-right: 16px;
}

.gardens-scroll::-webkit-scrollbar { display: none; }

.garden-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1.5px solid var(--border);
  border-radius: 20px;
  background: var(--bg);
  white-space: nowrap;
  flex-shrink: 0;
}

.gt-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.gt-count {
  font-size: 11px;
  font-weight: 700;
  background: var(--bg-alt);
  color: var(--text-muted);
  padding: 1px 6px;
  border-radius: 8px;
}

/* Desktop: grid */
.gardens-grid {
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.garden-chip {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; border-radius: 12px;
  border: 1px solid var(--border-light);
  transition: background 0.1s, border-color 0.1s;
}

.garden-chip:hover { background: var(--bg-alt); border-color: var(--primary); }

.garden-icon {
  width: 32px; height: 32px; border-radius: 8px;
  background: var(--bg-alt); color: var(--primary);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.garden-icon.nursery { background: #e8f5e9; color: #2e7d32; }

.garden-name {
  flex: 1; min-width: 0;
  font-size: 13px; font-weight: 600; color: var(--text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.garden-count {
  font-size: 12px; font-weight: 600; color: var(--text-muted);
  background: var(--bg-alt); padding: 2px 8px; border-radius: 8px;
  flex-shrink: 0;
}

@media (min-width: 768px) {
  .gardens-section { padding: 48px 0; }
  .section-title { font-size: 26px; }
}
</style>
