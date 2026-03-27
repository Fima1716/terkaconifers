<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'

const auth = useAuthStore()
const router = useRouter()

const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

// If already logged in, redirect
onMounted(async () => {
  await auth.fetchMe()
  if (auth.isLoggedIn) {
    router.replace(auth.isSuperAdmin ? '/admin' : '/')
  }
})

async function submit() {
  error.value = ''
  loading.value = true
  try {
    const user = await auth.login(username.value, password.value)
    router.replace(user.role === 'super_admin' ? '/admin' : '/')
  } catch (e: any) {
    error.value = e?.data?.message || e?.message || 'Ошибка авторизации'
  } finally {
    loading.value = false
  }
}

useHead({ title: 'Вход — Территория Хвойных' })
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-logo">
        <svg viewBox="0 0 60 80" fill="none" xmlns="http://www.w3.org/2000/svg" width="48" height="64">
          <path d="M30 4 L18 24 H42 Z" fill="var(--primary)" opacity="0.9"/>
          <path d="M30 14 L14 38 H46 Z" fill="var(--primary)" opacity="0.7"/>
          <path d="M30 28 L10 54 H50 Z" fill="var(--primary)" opacity="0.5"/>
          <rect x="27" y="54" width="6" height="14" rx="2" fill="var(--primary)" opacity="0.6"/>
        </svg>
      </div>
      <h1>Вход в систему</h1>
      <form @submit.prevent="submit">
        <div class="field">
          <label for="username">Имя пользователя</label>
          <input id="username" v-model="username" type="text" autocomplete="username" autofocus required>
        </div>
        <div class="field">
          <label for="password">Пароль</label>
          <input id="password" v-model="password" type="password" autocomplete="current-password" required>
        </div>
        <div v-if="error" class="error">{{ error }}</div>
        <button type="submit" class="btn-login" :disabled="loading">
          {{ loading ? 'Вход...' : 'Войти' }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-alt);
  padding: 16px;
}

.login-card {
  width: 100%;
  max-width: 380px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 32px 28px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.06);
}

.login-logo {
  text-align: center;
  margin-bottom: 20px;
}

h1 {
  font-size: 20px;
  font-weight: 700;
  text-align: center;
  margin-bottom: 24px;
  color: var(--text);
}

.field {
  margin-bottom: 16px;
}

.field label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.field input {
  width: 100%;
  height: 44px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 15px;
  color: var(--text);
  background: var(--bg);
  outline: none;
  transition: border-color 0.15s;
  box-sizing: border-box;
}

.field input:focus {
  border-color: var(--primary);
}

.error {
  background: #fce4ec;
  color: #c62828;
  font-size: 13px;
  padding: 10px 14px;
  border-radius: 8px;
  margin-bottom: 16px;
}

.btn-login {
  width: 100%;
  height: 48px;
  background: var(--primary);
  color: #fff;
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-login:hover { background: var(--primary-dark); }
.btn-login:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
