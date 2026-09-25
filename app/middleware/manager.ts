import { useAuthStore } from '~/stores/auth'

/** Менеджерская: доступна менеджерам и суперадминам, админ-панель при этом закрыта */
export default defineNuxtRouteMiddleware(async () => {
  if (import.meta.server) return

  const auth = useAuthStore()
  await auth.fetchMe()
  if (!auth.isLoggedIn) return navigateTo('/login')
  if (!auth.canManageContent) return navigateTo('/')
})
