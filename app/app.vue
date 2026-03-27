<script setup lang="ts">
const splashVisible = ref(true)
const splashFading = ref(false)

// Maintenance mode
const maintenance = ref<{ enabled: boolean; message: string }>({ enabled: false, message: '' })
const route = useRoute()

const isAdminOrLogin = computed(() => {
  const path = route.path
  return path.startsWith('/admin') || path.startsWith('/login')
})

onMounted(async () => {
  // Dismiss splash as soon as page is interactive — no artificial delay
  splashFading.value = true
  setTimeout(() => { splashVisible.value = false }, 400)

  // Check maintenance status
  try {
    maintenance.value = await $fetch('/api/maintenance')
  } catch {}
})
</script>

<template>
  <!-- Splash screen -->
  <Teleport to="body">
    <div v-if="splashVisible" class="splash" :class="{ 'splash--fade': splashFading }">
      <div class="splash__glow" />
      <div class="splash__content">
        <!-- Animated conifer tree drawing itself -->
        <svg class="splash__tree" viewBox="0 0 60 80" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Tree layers -->
          <path d="M30 4 L18 24 H42 Z" stroke="rgba(127,212,196,0.8)" stroke-width="1.5" stroke-linejoin="round" class="splash__tree-line" style="--d:0s"/>
          <path d="M30 14 L14 38 H46 Z" stroke="rgba(127,212,196,0.6)" stroke-width="1.5" stroke-linejoin="round" class="splash__tree-line" style="--d:0.3s"/>
          <path d="M30 28 L10 54 H50 Z" stroke="rgba(127,212,196,0.4)" stroke-width="1.5" stroke-linejoin="round" class="splash__tree-line" style="--d:0.6s"/>
          <!-- Trunk -->
          <line x1="30" y1="54" x2="30" y2="68" stroke="rgba(127,212,196,0.5)" stroke-width="2" stroke-linecap="round" class="splash__tree-line" style="--d:0.9s"/>
        </svg>
      </div>
    </div>
  </Teleport>

  <!-- Maintenance overlay (skip for admin/login pages) -->
  <div v-if="maintenance.enabled && !isAdminOrLogin" class="maintenance">
    <div class="maintenance__glow" />
    <div class="maintenance__content">
      <svg class="maintenance__tree" viewBox="0 0 60 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M30 4 L18 24 H42 Z" stroke="rgba(127,212,196,0.6)" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="M30 14 L14 38 H46 Z" stroke="rgba(127,212,196,0.4)" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="M30 28 L10 54 H50 Z" stroke="rgba(127,212,196,0.3)" stroke-width="1.5" stroke-linejoin="round"/>
        <line x1="30" y1="54" x2="30" y2="68" stroke="rgba(127,212,196,0.4)" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <h1 class="maintenance__title">Сайт временно закрыт</h1>
      <p v-if="maintenance.message" class="maintenance__msg">{{ maintenance.message }}</p>
      <p v-else class="maintenance__msg">Проводятся технические работы. Пожалуйста, зайдите позже.</p>
    </div>
  </div>

  <NuxtLayout v-else>
    <NuxtPage />
  </NuxtLayout>
</template>

<style>
.splash {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(145deg, #0f3a20 0%, #1a5632 50%, #0f3a20 100%);
  transition: opacity 0.6s ease, transform 0.6s ease;
}

.splash--fade {
  opacity: 0;
  transform: scale(1.02);
  pointer-events: none;
}

.splash__glow {
  position: absolute;
  width: 300px;
  height: 300px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(77, 184, 164, 0.2) 0%, transparent 70%);
  animation: splash-pulse 2.5s ease-in-out infinite;
}

.splash__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28px;
  animation: splash-enter 0.6s ease-out both;
}

@keyframes splash-enter {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (min-width: 768px) {
  .splash__glow { width: 400px; height: 400px; }
}

.splash__tree {
  width: 60px;
  height: 80px;
}

@media (min-width: 768px) {
  .splash__tree { width: 72px; height: 96px; }
}

.splash__tree-line {
  stroke-dasharray: 200;
  stroke-dashoffset: 200;
  animation: tree-draw 1.2s ease-out forwards, tree-glow 2s ease-in-out 1.2s infinite;
  animation-delay: var(--d), calc(var(--d) + 1.2s);
}

@keyframes tree-draw {
  to { stroke-dashoffset: 0; }
}

@keyframes tree-glow {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

/* ── Maintenance page ─────────────── */
.maintenance {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(145deg, #0f3a20 0%, #1a5632 50%, #0f3a20 100%);
}

.maintenance__glow {
  position: absolute;
  width: 400px;
  height: 400px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(77, 184, 164, 0.15) 0%, transparent 70%);
  animation: splash-pulse 3s ease-in-out infinite;
}

@keyframes splash-pulse {
  0%, 100% { transform: scale(1); opacity: 0.5; }
  50% { transform: scale(1.1); opacity: 1; }
}

.maintenance__content {
  position: relative;
  text-align: center;
  padding: 32px;
  max-width: 480px;
}

.maintenance__tree {
  width: 64px;
  height: 86px;
  margin-bottom: 32px;
  opacity: 0.8;
}

.maintenance__title {
  font-size: 28px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.95);
  margin-bottom: 16px;
  letter-spacing: -0.3px;
}

.maintenance__msg {
  font-size: 16px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.6);
}

@media (min-width: 768px) {
  .maintenance__title { font-size: 36px; }
  .maintenance__tree { width: 80px; height: 108px; }
}
</style>
