<script setup lang="ts">
useHead({ title: 'Контакты — Территория Хвойных' })

const form = reactive({
  name: '',
  phone: '',
  email: '',
  message: '',
})

const submitted = ref(false)

function submitForm() {
  // TODO: integrate with email service or Max bot
  submitted.value = true
}
</script>

<template>
  <div class="contacts-page container">
    <BreadCrumbs :items="[{ label: 'Главная', to: '/' }, { label: 'Контакты' }]" />
    <h1>Контакты</h1>

    <div class="contacts-layout">
      <div class="contacts-info">
        <div class="info-card">
          <h3>Телефон</h3>
          <a href="tel:+79074497500" class="info-value">+7 (907) 449-75-00</a>
        </div>
        <div class="info-card">
          <h3>Email</h3>
          <a href="mailto:info@terhvoy.ru" class="info-value">info@terhvoy.ru</a>
        </div>
        <div class="info-card">
          <h3>Мессенджеры</h3>
          <p class="info-value">Telegram, WhatsApp</p>
        </div>
      </div>

      <div class="contacts-form">
        <h2>Написать нам</h2>
        <div v-if="submitted" class="form-success">
          Спасибо! Мы свяжемся с вами в ближайшее время.
        </div>
        <form v-else @submit.prevent="submitForm">
          <div class="field">
            <label>Имя</label>
            <input v-model="form.name" type="text" required placeholder="Ваше имя">
          </div>
          <div class="field">
            <label>Телефон</label>
            <input v-model="form.phone" type="tel" placeholder="+7 (___) ___-__-__">
          </div>
          <div class="field">
            <label>Email</label>
            <input v-model="form.email" type="email" placeholder="email@example.com">
          </div>
          <div class="field">
            <label>Сообщение</label>
            <textarea v-model="form.message" rows="4" placeholder="Ваш вопрос или заказ..."></textarea>
          </div>
          <button type="submit" class="btn-submit">Отправить</button>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.contacts-page {
  padding: 32px 16px 64px;
}

h1 {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 32px;
}

.contacts-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 32px;
}

@media (min-width: 768px) {
  .contacts-layout { grid-template-columns: 1fr 1fr; }
}

.info-card {
  padding: 16px 0;
  border-bottom: 1px solid var(--border-light);
}

.info-card h3 {
  font-size: 13px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-bottom: 6px;
}

.info-value {
  font-size: 16px;
  font-weight: 500;
  color: var(--primary);
}

.contacts-form h2 {
  font-size: 20px;
  margin-bottom: 20px;
}

.field {
  margin-bottom: 16px;
}

.field label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 6px;
  color: var(--text-secondary);
}

.field input,
.field textarea {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--text);
  outline: none;
  transition: border-color 0.15s;
}

.field input:focus,
.field textarea:focus {
  border-color: var(--primary-light);
}

.btn-submit {
  padding: 12px 32px;
  background: var(--primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  font-weight: 600;
  font-size: 15px;
  transition: background 0.15s;
}

.btn-submit:hover { background: var(--primary-dark); }

.form-success {
  padding: 20px;
  background: #e8f5e9;
  border-radius: var(--radius-sm);
  color: #2e7d32;
  font-weight: 500;
}
</style>
