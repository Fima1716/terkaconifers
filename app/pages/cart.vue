<script setup lang="ts">
import { useCartStore } from '~/stores/cart'
import { formatPrice } from '~/utils/formatPrice'

const cart = useCartStore()

useHead({ title: 'Корзина — Территория Хвойных' })
</script>

<template>
  <div class="cart-page container">
    <h1 class="page-title">Корзина</h1>

    <div v-if="cart.isEmpty" class="empty">
      <p>Корзина пуста</p>
      <NuxtLink to="/catalog" class="btn-catalog">Перейти в каталог</NuxtLink>
    </div>

    <div v-else class="cart-layout">
      <div class="cart-items">
        <div v-for="item in cart.items" :key="item.plantId" class="cart-item">
          <NuxtLink :to="`/plant/${item.plantId}`" class="item-img-link">
            <img v-if="item.plant.thumbs[0]" :src="'/' + item.plant.thumbs[0]" :alt="item.plant.latin_full">
          </NuxtLink>
          <div class="item-info">
            <NuxtLink :to="`/plant/${item.plantId}`" class="item-name">
              {{ item.plant.cultivar || item.plant.latin_full }}
            </NuxtLink>
            <div class="item-species">{{ item.plant.species_ru }}</div>
            <div class="item-meta">
              <span v-if="item.plant.region_normalized">{{ item.plant.region_normalized }}</span>
              <span v-if="item.plant.age_display">{{ item.plant.age_display }}</span>
            </div>
          </div>
          <div class="item-qty">
            <div class="qty-control">
              <button @click="cart.updateQuantity(item.plantId, item.quantity - 1)">−</button>
              <span>{{ item.quantity }}</span>
              <button @click="cart.updateQuantity(item.plantId, item.quantity + 1)">+</button>
            </div>
          </div>
          <div class="item-price">
            {{ formatPrice(item.plant.price) }}
          </div>
          <button class="item-remove" @click="cart.removeItem(item.plantId)">✕</button>
        </div>
      </div>

      <div class="cart-summary">
        <div class="summary-card">
          <h3>Итого</h3>
          <div class="summary-row">
            <span>Товаров: {{ cart.totalItems }}</span>
          </div>
          <div class="summary-total">
            <span>Сумма:</span>
            <strong>{{ formatPrice(cart.totalPrice) }}</strong>
          </div>
          <NuxtLink to="/checkout" class="btn-checkout">
            Оформить заказ
          </NuxtLink>
          <button class="btn-clear" @click="cart.clearCart()">Очистить корзину</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cart-page { padding: 24px 16px 48px; }

.page-title {
  font-size: 26px;
  font-weight: 700;
  margin-bottom: 24px;
}

.empty {
  text-align: center;
  padding: 60px 0;
  color: var(--text-muted);
}

.btn-catalog {
  display: inline-block;
  margin-top: 16px;
  padding: 12px 32px;
  background: var(--primary);
  color: #fff;
  border-radius: var(--radius-sm);
  font-weight: 600;
}

.cart-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 24px;
}

@media (min-width: 768px) {
  .cart-layout { grid-template-columns: 1fr 300px; }
}

.cart-item {
  display: grid;
  grid-template-columns: 80px 1fr auto auto auto;
  gap: 12px;
  align-items: center;
  padding: 16px 0;
  border-bottom: 1px solid var(--border-light);
}

.item-img-link img {
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: var(--radius-sm);
}

.item-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--text);
}

.item-name:hover { color: var(--primary); }

.item-species {
  font-size: 12px;
  color: var(--text-secondary);
  font-style: italic;
}

.item-meta {
  display: flex;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 4px;
}

.qty-control {
  display: flex;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
}

.qty-control button {
  width: 30px;
  height: 30px;
  background: none;
  border: none;
  font-size: 14px;
}

.qty-control span {
  width: 30px;
  text-align: center;
  font-size: 13px;
  font-weight: 600;
}

.item-price {
  font-weight: 700;
  font-size: 15px;
  color: var(--primary);
  white-space: nowrap;
}

.item-remove {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 16px;
  padding: 4px 8px;
}

.item-remove:hover { color: var(--danger); }

/* Summary */
.summary-card {
  background: var(--bg-alt);
  border-radius: var(--radius);
  padding: 20px;
  position: sticky;
  top: calc(var(--header-h) + 16px);
}

.summary-card h3 {
  font-size: 18px;
  margin-bottom: 12px;
}

.summary-row {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.summary-total {
  display: flex;
  justify-content: space-between;
  font-size: 18px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
  margin-bottom: 16px;
}

.summary-total strong { color: var(--primary); }

.btn-checkout {
  display: block;
  text-align: center;
  padding: 14px;
  background: var(--primary);
  color: #fff;
  border-radius: var(--radius-sm);
  font-weight: 700;
  font-size: 16px;
  transition: background 0.15s;
}

.btn-checkout:hover { background: var(--primary-dark); }

.btn-clear {
  display: block;
  width: 100%;
  margin-top: 10px;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 13px;
}

.btn-clear:hover { color: var(--danger); }

@media (max-width: 767px) {
  .cart-item {
    grid-template-columns: 60px 1fr;
    gap: 8px;
  }
  .item-qty, .item-price, .item-remove {
    grid-column: 2;
  }
}
</style>
