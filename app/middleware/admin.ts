import { useAuthStore } from '~/stores/auth'

export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return

  // For my-garden routes, also check garden cookie session
  if (to.path.startsWith('/my-garden')) {
    const auth = useAuthStore()
    await auth.fetchMe()
    if (auth.isSuperAdmin) return // admin always OK

    // Check garden session
    try {
      await $fetch('/api/garden-me')
      return // has valid garden session
    } catch {}

    // Neither admin nor garden owner — page will show code entry
    return
  }

  // Other admin routes — require JWT
  const auth = useAuthStore()
  await auth.fetchMe()
  if (!auth.isLoggedIn) return navigateTo('/login')
  if (!auth.isSuperAdmin) return navigateTo('/')
})
