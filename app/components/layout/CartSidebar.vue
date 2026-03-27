<script setup lang="ts">
import { useCartStore } from '~/stores/cart'
import { formatPrice } from '~/utils/formatPrice'

const cart = useCartStore()
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="cart.isOpen" class="overlay" @click="cart.closeSidebar()" />
    </Transition>
    <Transition name="slide-right">
      <aside v-if="cart.isOpen" class="sidebar">
        <div class="sidebar-header">
          <h3>Корзина <span v-if="cart.totalItems">({{ cart.totalItems }})</span></h3>
          <button class="close-btn" @click="cart.closeSidebar()">✕</button>
        </div>

        <div v-if="cart.isEmpty" class="sidebar-empty">
          <p>Корзина пуста</p>
          <NuxtLink to="/catalog" class="btn-browse" @click="cart.closeSidebar()">
            Перейти в каталог
          </NuxtLink>
        </div>

        <div v-else class="sidebar-body">
          <div class="sidebar-items">
            <div v-for="item in cart.items" :key="item.plantId" class="cart-item">
              <img
                v-if="item.plant.thumbs[0]"
                :src="'/' + item.plant.thumbs[0]"
                :alt="item.plant.latin_full"
                class="item-img"
              >
              <div class="item-info">
                <div class="item-name">{{ item.plant.cultivar || item.plant.latin_full }}</div>
                <div class="item-species">{{ item.plant.species_ru }}</div>
                <div class="item-price">{{ formatPrice(item.plant.price) }}</div>
              </div>
              <div class="item-actions">
                <div class="qty-control">
                  <button @click="cart.updateQuantity(item.plantId, item.quantity - 1)">−</button>
                  <span>{{ item.quantity }}</span>
                  <button @click="cart.updateQuantity(item.plantId, item.quantity + 1)">+</button>
                </div>
                <button class="remove-btn" @click="cart.removeItem(item.plantId)">Удалить</button>
              </div>
            </div>
          </div>

          <div class="sidebar-footer">
            <div class="total-row">
              <span>Итого:</span>
              <strong>{{ formatPrice(cart.totalPrice) }}</strong>
            </div>
            <NuxtLink to="/cart" class="btn-cart" @click="cart.closeSidebar()">
              Перейти в корзину
            </NuxtLink>
          </div>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 150;
}

.sidebar {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  max-width: 420px;
  background: var(--bg);
  z-index: 200;
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.1);
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.sidebar-header h3 {
  font-size: 18px;
  font-weight: 700;
}

.sidebar-header h3 span {
  color: var(--text-muted);
  font-weight: 400;
}

.close-btn {
  background: none;
  border: none;
  font-size: 20px;
  color: var(--text-muted);
  padding: 4px 8px;
}

.sidebar-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--text-muted);
}

.btn-browse {
  padding: 10px 24px;
  background: var(--primary);
  color: #fff;
  border-radius: var(--radius-sm);
  font-weight: 600;
  font-size: 14px;
}

.sidebar-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-items {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.cart-item {
  display: grid;
  grid-template-columns: 60px 1fr auto;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-light);
}

.item-img {
  width: 60px;
  height: 60px;
  object-fit: cover;
  border-radius: var(--radius-xs);
}

.item-name {
  font-size: 13px;
  font-weight: 600;
}

.item-species {
  font-size: 12px;
  color: var(--text-muted);
}

.item-price {
  font-size: 13px;
  font-weight: 600;
  color: var(--primary);
  margin-top: 4px;
}

.item-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.qty-control {
  display: flex;
  align-items: center;
  gap: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
}

.qty-control button {
  width: 28px;
  height: 28px;
  background: none;
  border: none;
  font-size: 14px;
  color: var(--text);
}

.qty-control span {
  width: 28px;
  text-align: center;
  font-size: 13px;
  font-weight: 600;
}

.remove-btn {
  background: none;
  border: none;
  font-size: 11px;
  color: var(--danger);
}

.sidebar-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--border);
}

.total-row {
  display: flex;
  justify-content: space-between;
  font-size: 16px;
  margin-bottom: 12px;
}

.total-row strong {
  color: var(--primary);
}

.btn-cart {
  display: block;
  text-align: center;
  padding: 12px;
  background: var(--primary);
  color: #fff;
  border-radius: var(--radius-sm);
  font-weight: 600;
  font-size: 15px;
}

/* Transitions */
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.slide-right-enter-active, .slide-right-leave-active { transition: transform 0.25s ease; }
.slide-right-enter-from, .slide-right-leave-to { transform: translateX(100%); }
</style>
