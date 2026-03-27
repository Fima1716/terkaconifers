<script setup lang="ts">
import { useCartStore } from '~/stores/cart'
import { formatPrice } from '~/utils/formatPrice'

const cart = useCartStore()
const step = ref(1)
const submitted = ref(false)

const form = reactive({
  name: '',
  phone: '',
  email: '',
  delivery: 'pickup',
  comment: '',
})

useHead({ title: 'Оформление заказа — Территория Хвойных' })

function nextStep() {
  step.value++
}

function prevStep() {
  step.value--
}

async function submitOrder() {
  // TODO: Send to Max bot API / email
  submitted.value = true
  cart.clearCart()
}
</script>

<template>
  <div class="checkout-page container">
    <h1>Оформление заказа</h1>

    <div v-if="cart.isEmpty && !submitted" class="empty">
      <p>Корзина пуста</p>
      <NuxtLink to="/catalog" class="btn-link">В каталог</NuxtLink>
    </div>

    <div v-else-if="submitted" class="success">
      <div class="success-icon">&#10003;</div>
      <h2>Заказ оформлен!</h2>
      <p>Мы свяжемся с вами в ближайшее время для подтверждения.</p>
      <NuxtLink to="/catalog" class="btn-continue">Продолжить покупки</NuxtLink>
    </div>

    <div v-else class="checkout-layout">
      <!-- Steps indicator -->
      <div class="steps">
        <div class="step" :class="{ active: step >= 1, done: step > 1 }">
          <span class="step-num">1</span>
          <span class="step-label">Контакты</span>
        </div>
        <div class="step-line" :class="{ active: step > 1 }" />
        <div class="step" :class="{ active: step >= 2, done: step > 2 }">
          <span class="step-num">2</span>
          <span class="step-label">Доставка</span>
        </div>
        <div class="step-line" :class="{ active: step > 2 }" />
        <div class="step" :class="{ active: step >= 3 }">
          <span class="step-num">3</span>
          <span class="step-label">Подтверждение</span>
        </div>
      </div>

      <!-- Step 1: Contact info -->
      <div v-if="step === 1" class="step-content">
        <h2>Контактные данные</h2>
        <div class="field">
          <label>Имя *</label>
          <input v-model="form.name" type="text" required placeholder="Ваше имя">
        </div>
        <div class="field">
          <label>Телефон *</label>
          <input v-model="form.phone" type="tel" required placeholder="+7 (___) ___-__-__">
        </div>
        <div class="field">
          <label>Email</label>
          <input v-model="form.email" type="email" placeholder="email@example.com">
        </div>
        <button class="btn-next" :disabled="!form.name || !form.phone" @click="nextStep">
          Далее
        </button>
      </div>

      <!-- Step 2: Delivery -->
      <div v-if="step === 2" class="step-content">
        <h2>Способ получения</h2>
        <div class="delivery-options">
          <label class="delivery-option" :class="{ active: form.delivery === 'pickup' }">
            <input v-model="form.delivery" type="radio" value="pickup">
            <div>
              <strong>Самовывоз</strong>
              <p>Заберите заказ лично</p>
            </div>
          </label>
          <label class="delivery-option" :class="{ active: form.delivery === 'delivery' }">
            <input v-model="form.delivery" type="radio" value="delivery">
            <div>
              <strong>Доставка</strong>
              <p>Обсудим при подтверждении заказа</p>
            </div>
          </label>
        </div>
        <div class="field">
          <label>Комментарий к заказу</label>
          <textarea v-model="form.comment" rows="3" placeholder="Дополнительные пожелания..."></textarea>
        </div>
        <div class="btn-row">
          <button class="btn-back" @click="prevStep">Назад</button>
          <button class="btn-next" @click="nextStep">Далее</button>
        </div>
      </div>

      <!-- Step 3: Confirmation -->
      <div v-if="step === 3" class="step-content">
        <h2>Подтверждение заказа</h2>

        <div class="confirm-section">
          <h3>Ваши данные</h3>
          <p>{{ form.name }} &middot; {{ form.phone }}</p>
          <p v-if="form.email">{{ form.email }}</p>
          <p>{{ form.delivery === 'pickup' ? 'Самовывоз' : 'Доставка' }}</p>
        </div>

        <div class="confirm-section">
          <h3>Товары ({{ cart.totalItems }})</h3>
          <div v-for="item in cart.items" :key="item.plantId" class="confirm-item">
            <span>{{ item.plant.cultivar || item.plant.latin_full }} &times; {{ item.quantity }}</span>
            <span>{{ formatPrice(item.plant.price ? item.plant.price * item.quantity : null) }}</span>
          </div>
          <div class="confirm-total">
            <strong>Итого:</strong>
            <strong>{{ formatPrice(cart.totalPrice) }}</strong>
          </div>
        </div>

        <div class="btn-row">
          <button class="btn-back" @click="prevStep">Назад</button>
          <button class="btn-submit" @click="submitOrder">Оформить заказ</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.checkout-page { padding: 24px 16px 64px; max-width: 700px; }

h1 { font-size: 26px; font-weight: 700; margin-bottom: 24px; }

.empty, .success { text-align: center; padding: 48px 0; }

.success-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--success);
  color: #fff;
  font-size: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
}

.success h2 { margin-bottom: 8px; }
.success p { color: var(--text-secondary); margin-bottom: 20px; }

.btn-link, .btn-continue {
  display: inline-block;
  padding: 12px 32px;
  background: var(--primary);
  color: #fff;
  border-radius: var(--radius-sm);
  font-weight: 600;
}

/* Steps */
.steps {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 32px;
}

.step {
  display: flex;
  align-items: center;
  gap: 8px;
}

.step-num {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--border);
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
}

.step.active .step-num {
  background: var(--primary);
  color: #fff;
}

.step.done .step-num {
  background: var(--success);
  color: #fff;
}

.step-label {
  font-size: 13px;
  color: var(--text-muted);
}

.step.active .step-label { color: var(--text); font-weight: 500; }

.step-line {
  flex: 1;
  height: 2px;
  background: var(--border);
}

.step-line.active { background: var(--primary); }

/* Form */
.step-content h2 { font-size: 20px; margin-bottom: 20px; }

.field {
  margin-bottom: 16px;
}

.field label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.field input, .field textarea {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--text);
  outline: none;
}

.field input:focus, .field textarea:focus { border-color: var(--primary-light); }

/* Delivery */
.delivery-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}

.delivery-option {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px;
  border: 2px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: border-color 0.15s;
}

.delivery-option.active { border-color: var(--primary); }

.delivery-option input { margin-top: 2px; accent-color: var(--primary); }

.delivery-option strong { font-size: 14px; }
.delivery-option p { font-size: 13px; color: var(--text-muted); margin-top: 2px; }

/* Confirmation */
.confirm-section {
  padding: 16px 0;
  border-bottom: 1px solid var(--border-light);
}

.confirm-section h3 {
  font-size: 14px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-bottom: 8px;
}

.confirm-section p {
  font-size: 14px;
  margin-bottom: 2px;
}

.confirm-item {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  padding: 4px 0;
}

.confirm-total {
  display: flex;
  justify-content: space-between;
  font-size: 16px;
  padding-top: 8px;
  margin-top: 8px;
  border-top: 1px solid var(--border-light);
}

.confirm-total strong { color: var(--primary); }

/* Buttons */
.btn-row {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.btn-back {
  padding: 12px 24px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-weight: 500;
  color: var(--text-secondary);
}

.btn-next, .btn-submit {
  flex: 1;
  padding: 12px 24px;
  background: var(--primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  font-weight: 700;
  font-size: 15px;
}

.btn-next:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-submit { background: var(--success); }
.btn-submit:hover { background: #1b7a3a; }
</style>
