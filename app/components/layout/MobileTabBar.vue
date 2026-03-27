<script setup lang="ts">
import { useFavoritesStore } from '~/stores/favorites'

const route = useRoute()
const favorites = useFavoritesStore()

const tabs = [
  { path: '/', icon: 'home', label: 'Главная' },
  { path: '/favorites', icon: 'heart', label: 'Избранное' },
  { path: '/catalog', icon: 'catalog', label: 'Каталог' },
  { path: '/gardens', icon: 'gardens', label: 'Сады' },
  { path: '/more', icon: 'more', label: 'Профиль' },
]

function isActive(path: string) {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}
</script>

<template>
  <nav class="tab-bar">
    <NuxtLink
      v-for="tab in tabs"
      :key="tab.path"
      :to="tab.path"
      class="tab"
      :class="{ active: isActive(tab.path) }"
    >
      <span class="tab-icon">
        <!-- Home -->
        <svg v-if="tab.icon === 'home'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        <!-- Heart -->
        <template v-if="tab.icon === 'heart'">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22">
            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
          </svg>
          <span v-if="favorites.count > 0" class="tab-badge">{{ favorites.count }}</span>
        </template>
        <!-- Catalog -->
        <svg v-if="tab.icon === 'catalog'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
        </svg>
        <!-- Gardens -->
        <svg v-if="tab.icon === 'gardens'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
        </svg>
        <!-- Profile/More -->
        <svg v-if="tab.icon === 'more'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22">
          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
        </svg>
      </span>
      <span class="tab-label">{{ tab.label }}</span>
    </NuxtLink>
  </nav>
</template>

<style scoped>
.tab-bar {
  display: flex;
  position: fixed;
  bottom: 0; left: 0; right: 0;
  z-index: 100;
  background: #fff;
  border-top: 1px solid var(--border-light);
  padding-bottom: env(safe-area-inset-bottom, 0px);
  height: calc(56px + env(safe-area-inset-bottom, 0px));
}

@media (min-width: 1024px) {
  .tab-bar { display: none; }
}

.tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: var(--text-muted);
  text-decoration: none;
  position: relative;
  padding-top: 6px;
  -webkit-tap-highlight-color: transparent;
}

.tab.active {
  color: var(--primary);
}


.tab-icon {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 24px;
}

.tab-badge {
  position: absolute;
  top: -4px; right: -10px;
  background: #e53935;
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 3px;
}

.tab-label {
  font-size: 10px;
  font-weight: 500;
  line-height: 1;
}
</style>
