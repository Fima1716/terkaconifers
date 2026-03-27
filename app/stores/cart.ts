import { defineStore } from 'pinia'
import type { Plant } from './catalog'

interface CartItem {
  plantId: number
  quantity: number
  plant: Plant
}

export const useCartStore = defineStore('cart', {
  state: () => ({
    items: [] as CartItem[],
    isOpen: false,
  }),

  getters: {
    totalItems(state): number {
      return state.items.reduce((sum, item) => sum + item.quantity, 0)
    },

    totalPrice(state): number {
      return state.items.reduce((sum, item) => {
        return sum + (item.plant.price ?? 0) * item.quantity
      }, 0)
    },

    isEmpty(state): boolean {
      return state.items.length === 0
    },

    hasItemsWithPrice(state): boolean {
      return state.items.some(item => item.plant.price != null)
    },
  },

  actions: {
    addItem(plant: Plant, quantity = 1) {
      const existing = this.items.find(i => i.plantId === plant.id)
      if (existing) {
        existing.quantity = Math.min(existing.quantity + quantity, 99)
      } else {
        this.items.push({ plantId: plant.id, quantity, plant })
      }
      this.isOpen = true
    },

    removeItem(plantId: number) {
      this.items = this.items.filter(i => i.plantId !== plantId)
    },

    updateQuantity(plantId: number, quantity: number) {
      const item = this.items.find(i => i.plantId === plantId)
      if (item) {
        item.quantity = Math.max(1, Math.min(quantity, 99))
      }
    },

    clearCart() {
      this.items = []
    },

    toggleSidebar() {
      this.isOpen = !this.isOpen
    },

    closeSidebar() {
      this.isOpen = false
    },

    generateOrderText(): string {
      let text = '🌲 Заказ из каталога «Территория Хвойных»\n\n'
      this.items.forEach((item, i) => {
        text += `${i + 1}. ${item.plant.latin_full}`
        if (item.plant.price) {
          text += ` — ${new Intl.NumberFormat('ru-RU').format(item.plant.price)} ₽`
        }
        text += ` × ${item.quantity} шт.\n`
      })
      if (this.hasItemsWithPrice) {
        text += `\nИтого: ${new Intl.NumberFormat('ru-RU').format(this.totalPrice)} ₽`
      }
      return text
    },
  },

  persist: {
    pick: ['items'],
  },
})
