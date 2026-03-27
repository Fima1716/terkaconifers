import { defineStore } from 'pinia'
import type { Plant } from '~/stores/catalog'

interface AuthUser {
  username: string
  displayName: string
  role: 'super_admin' | 'admin'
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
    isAdmin: (state) => !!state.user,
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
