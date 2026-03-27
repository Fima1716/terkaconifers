import { defineStore } from 'pinia'

export const useFavoritesStore = defineStore('favorites', {
  state: () => ({
    ids: [] as number[],
  }),

  getters: {
    count: (state) => state.ids.length,
    isFavorite: (state) => (id: number) => state.ids.includes(id),
  },

  actions: {
    toggle(id: number) {
      const idx = this.ids.indexOf(id)
      if (idx >= 0) this.ids.splice(idx, 1)
      else this.ids.push(id)
    },
  },

  persist: {
    pick: ['ids'],
  },
})
