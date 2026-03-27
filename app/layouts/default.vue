<template>
  <div class="app-layout">
    <NuxtLoadingIndicator color="#2d8b4e" :height="3" />
    <AppHeader />
    <main class="main-content">
      <slot />
    </main>
    <AppFooter />
    <MobileTabBar />
    <ScrollToTop />
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}

.main-content {
  flex: 1;
  margin-top: var(--header-h);
  /* Space for mobile tab bar */
  padding-bottom: calc(56px + env(safe-area-inset-bottom, 0px));
}

@media (min-width: 1024px) {
  .main-content { padding-bottom: 0; }
}
</style>
