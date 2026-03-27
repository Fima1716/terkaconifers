import { useAuthStore } from '~/stores/auth'

export default defineNuxtRouteMiddleware(async () => {
  if (import.meta.server) return // Auth check runs client-side only

  const auth = useAuthStore()
  await auth.fetchMe()

  if (!auth.isLoggedIn) return navigateTo('/login')
  if (!auth.isSuperAdmin) return navigateTo('/')
})
