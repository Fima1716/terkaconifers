import { defineStore } from 'pinia'
import type { Plant } from '~/stores/catalog'

export type Role = 'super_admin' | 'manager' | 'admin'

/** Подписи ролей для интерфейса */
export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Администратор',
  manager: 'Менеджер',
  admin: 'Садовод',
}

/** Куда ведём пользователя после входа */
export const ROLE_HOME: Record<Role, string> = {
  super_admin: '/admin',
  manager: '/manage',
  admin: '/',
}

interface AuthUser {
  username: string
  displayName: string
  role: Role
  gardens: string[]
  createdAt: string
  lastLogin: string
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as AuthUser | null,
    checked: false,
  }),

  getters: {
    isLoggedIn: (state) => !!state.user,
    isSuperAdmin: (state) => state.user?.role === 'super_admin',
    isManager: (state) => state.user?.role === 'manager',
    isAdmin: (state) => !!state.user,
    /** Менеджерский доступ: карточки растений + текст постов в MAX (без админ-панели) */
    canManageContent: (state) =>
      state.user?.role === 'super_admin' || state.user?.role === 'manager',
    roleLabel: (state) => (state.user ? ROLE_LABELS[state.user.role] : ''),
    homePath: (state) => (state.user ? ROLE_HOME[state.user.role] : '/'),
    canEditPlant(): boolean {
      return !!this.user
    },
    canEditGarden() {
      return (gardenId: string) => {
        if (!this.user) return false
        if (this.user.role === 'super_admin') return true
        return this.user.gardens.includes(gardenId)
      }
    },
  },

  actions: {
    async fetchMe() {
      if (this.checked) return
      try {
        const data = await $fetch<{ user: AuthUser }>('/api/auth/me')
        this.user = data.user
      } catch {
        this.user = null
      }
      this.checked = true
    },

    async login(username: string, password: string) {
      const data = await $fetch<{ user: AuthUser }>('/api/auth/login', {
        method: 'POST',
        body: { username, password },
      })
      this.user = data.user
      this.checked = true
      return data.user
    },

    async logout() {
      await $fetch('/api/auth/logout', { method: 'POST' })
      this.user = null
    },
  },
})
