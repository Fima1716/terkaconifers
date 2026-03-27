<script setup lang="ts">
import { photoUrl } from '~/utils/photoUrl'
import { useCatalogStore } from '~/stores/catalog'
import { useFavoritesStore } from '~/stores/favorites'
import { useAuthStore } from '~/stores/auth'
import Fuse from 'fuse.js'

const catalog = useCatalogStore()
const pub = usePublicUrl()
const favorites = useFavoritesStore()
const auth = useAuthStore()
const route = useRoute()

// Auth
const userMenuOpen = ref(false)
const userMenuRef = ref<HTMLElement>()
onMounted(() => {
  auth.fetchMe()
  // Close dropdown on click outside
  document.addEventListener('click', (e) => {
    if (userMenuOpen.value && userMenuRef.value && !userMenuRef.value.contains(e.target as Node)) {
      userMenuOpen.value = false
    }
  })
})
// Close on route change
watch(() => route.path, () => { userMenuOpen.value = false })

async function doLogout() {
  userMenuOpen.value = false
  await auth.logout()
  navigateTo('/')
}

const showBack = computed(() => route.path !== '/')
const mobileMenuOpen = ref(false)
const searchQuery = ref('')
const searchFocused = ref(false)
const router = useRouter()
const searchRef = ref<HTMLInputElement>()

let _fuse: Fuse<any> | null = null
let _fuseCatalogLen = 0

function getFuse() {
  if (_fuse && _fuseCatalogLen === catalog.catalog.length) return _fuse
  _fuse = new Fuse(catalog.catalog, {
    keys: [
      { name: 'latin_full', weight: 1 },
      { name: 'cultivar', weight: 0.8 },
      { name: 'name_ru', weight: 0.7 },
      { name: 'species_ru', weight: 0.6 },
      { name: 'genus_ru', weight: 0.5 },
    ],
    threshold: 0.3, distance: 120, minMatchCharLength: 2,
  })
  _fuseCatalogLen = catalog.catalog.length
  return _fuse
}

const searchResults = computed(() => {
  const q = searchQuery.value.trim()
  if (q.length < 2 || !catalog.isLoaded) return { plants: [], genera: [], total: 0 }

  const genera = (catalog.filters?.genera ?? []).filter(g =>
    g.label.toLowerCase().includes(q.toLowerCase()) ||
    g.value.toLowerCase().includes(q.toLowerCase())
  ).slice(0, 3)

  const fuse = getFuse()
  const plants = fuse.search(q, { limit: 6 }).map(r => r.item)
  const totalResults = fuse.search(q, { limit: 500 }).length
  return { plants, genera, total: totalResults }
})

const showDropdown = computed(() => searchFocused.value && searchQuery.value.trim().length >= 2)

function onSearch() {
  if (searchQuery.value.trim().length >= 2) {
    catalog.setFilter('search', searchQuery.value.trim())
    router.push({ path: '/catalog', query: { q: searchQuery.value.trim() } })
    closeSearch()
  }
}

function clearSearch() {
  searchQuery.value = ''
  searchRef.value?.focus()
}

function goToPlant(id: number) { router.push(`/plant/${id}`); closeSearch() }
function goToGenus(genus: string) { router.push({ path: '/catalog', query: { genus } }); closeSearch() }

function goRandomPlant() {
  if (!catalog.catalog.length) return
  const random = catalog.catalog[Math.floor(Math.random() * catalog.catalog.length)]
  router.push(`/plant/${random.id}`)
}

function closeSearch() { searchFocused.value = false; searchRef.value?.blur() }
function onBlur() { setTimeout(() => { searchFocused.value = false }, 200) }
function toggleMobile() { mobileMenuOpen.value = !mobileMenuOpen.value }
</script>

<template>
  <header class="header">
    <div class="header-inner container">
      <!-- Back button (mobile, non-home pages) -->
      <button v-if="showBack" class="back-btn" @click="router.back()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20"><path d="M15 18l-6-6 6-6"/></svg>
      </button>

      <!-- Logo -->
      <NuxtLink to="/" class="logo">
        <img :src="pub('images/logo.png')" alt="Территория Хвойных" class="logo-img">
      </NuxtLink>

      <!-- Desktop Nav -->
      <nav class="nav-desktop">
        <NuxtLink to="/catalog" class="nav-link">Каталог</NuxtLink>
        <NuxtLink to="/gardens" class="nav-link">Сады</NuxtLink>
        <NuxtLink to="/articles" class="nav-link">Статьи</NuxtLink>
        <NuxtLink to="/team" class="nav-link">Команда</NuxtLink>
      </nav>

      <!-- Search -->
      <div class="search-wrap" :class="{ active: showDropdown }">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
        </svg>
        <input
          ref="searchRef"
          v-model="searchQuery"
          type="text"
          class="search-input"
          placeholder="Picea, ель колючая, Nana..."
          autocomplete="off"
          @focus="searchFocused = true"
          @blur="onBlur"
          @keydown.enter="onSearch"
          @keydown.escape="closeSearch"
        >
        <button v-if="searchQuery" class="search-clear" @mousedown.prevent="clearSearch">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <!-- Autocomplete dropdown -->
        <Transition name="dropdown">
          <div v-if="showDropdown" class="search-dropdown">
            <div v-if="searchResults.plants.length === 0 && searchResults.genera.length === 0" class="dd-empty">
              Ничего не найдено по запросу «{{ searchQuery }}»
            </div>
            <template v-else>
              <div v-if="searchResults.genera.length > 0" class="dd-section">
                <div class="dd-section-title">Категории</div>
                <button v-for="g in searchResults.genera" :key="g.value" class="dd-genus" @mousedown.prevent="goToGenus(g.value)">
                  <img v-if="g.cover_thumb" :src="photoUrl(g.cover_thumb)" class="dd-genus-img" alt="">
                  <div class="dd-genus-info">
                    <span class="dd-genus-name">{{ g.label }}</span>
                    <span class="dd-genus-latin">{{ g.value }}</span>
                  </div>
                  <span class="dd-genus-count">{{ g.count }}</span>
                </button>
              </div>
              <div v-if="searchResults.plants.length > 0" class="dd-section">
                <div class="dd-section-title">Растения</div>
                <button v-for="p in searchResults.plants" :key="p.id" class="dd-plant" @mousedown.prevent="goToPlant(p.id)">
                  <img v-if="p.thumbs[0]" :src="photoUrl(p.thumbs[0])" class="dd-plant-img" alt="">
                  <div v-else class="dd-plant-img dd-plant-img-empty" />
                  <div class="dd-plant-info">
                    <span class="dd-plant-name">{{ p.cultivar || p.latin_full }}</span>
                    <span class="dd-plant-species">{{ p.species_ru }}</span>
                  </div>
                  <div class="dd-plant-meta">
                    <span v-if="p.form_ru" class="dd-tag">{{ p.form_ru }}</span>
                    <!-- color tag temporarily hidden -->
                    <span v-if="false" class="dd-tag dd-tag-color">{{ p.color_ru }}</span>
                  </div>
                </button>
              </div>
              <button v-if="searchResults.total > 6" class="dd-showall" @mousedown.prevent="onSearch">
                Показать все результаты ({{ searchResults.total }})
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </button>
            </template>
          </div>
        </Transition>
      </div>

      <!-- Social links -->
      <div class="social-links">
        <a href="https://t.me/terka_conifers" target="_blank" rel="noopener" class="social-btn" title="Telegram">
          <img :src="pub('images/telegram-logo.svg')" width="20" height="20" alt="Telegram" style="border-radius: 4px;">
        </a>
        <a href="https://max.ru/id592005855318_biz" target="_blank" rel="noopener" class="social-btn" title="MAX">
          <img :src="pub('images/max-logo.svg')" width="20" height="20" alt="MAX" style="border-radius: 4px;">
        </a>
        <a href="https://dzen.ru/rusinovsad" target="_blank" rel="noopener" class="social-btn dzen-btn" title="Дзен">
          <img :src="pub('images/dzen-dark.svg')" height="14" style="width: auto;" alt="Дзен">
          <span class="dzen-label">ДЗЕН</span>
        </a>
      </div>

      <!-- Favorites (desktop only — mobile uses tab bar) -->
      <NuxtLink to="/favorites" class="fav-btn desktop-only" title="Избранное">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
          <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
        </svg>
        <span v-if="favorites.count > 0" class="fav-badge">{{ favorites.count }}</span>
      </NuxtLink>

      <!-- User menu -->
      <div ref="userMenuRef" class="user-menu-wrap desktop-only">
        <NuxtLink v-if="auth.checked && !auth.isLoggedIn" to="/login" class="user-btn" title="Войти">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </NuxtLink>
        <button v-else-if="auth.isLoggedIn" class="user-btn user-btn-active" @click="userMenuOpen = !userMenuOpen">
          <span class="user-avatar">{{ auth.user?.displayName?.charAt(0)?.toUpperCase() }}</span>
        </button>
        <Transition name="dropdown">
          <div v-if="userMenuOpen && auth.isLoggedIn" class="user-dropdown">
            <div class="ud-header">
              <span class="ud-name">{{ auth.user?.displayName }}</span>
              <span class="ud-role">{{ auth.isSuperAdmin ? 'Администратор' : 'Садовод' }}</span>
            </div>
            <div class="ud-divider" />
            <NuxtLink v-for="g in (auth.user?.gardens || [])" :key="g" :to="`/garden/${encodeURIComponent(g)}`" class="ud-item" @click="userMenuOpen = false">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              {{ g }}
            </NuxtLink>
            <NuxtLink v-if="auth.isSuperAdmin" to="/admin" class="ud-item" @click="userMenuOpen = false">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82 1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
              Админ-панель
            </NuxtLink>
            <div class="ud-divider" />
            <button class="ud-item ud-logout" @click="doLogout">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Выйти
            </button>
          </div>
        </Transition>
      </div>

      <!-- Random plant button -->
      <button class="random-btn" @click="goRandomPlant" title="Случайное растение">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="20" height="20">
          <path d="M12 2L7 8h3l-4 6h3l-5 8h16l-5-8h3l-4-6h3z"/>
        </svg>
        <span class="random-label">Случайное растение</span>
      </button>

      <!-- Hamburger (tablet only — mobile has tab bar, desktop has nav) -->
      <button class="burger" @click="toggleMobile">
        <span :class="{ open: mobileMenuOpen }" />
      </button>
    </div>

    <!-- Slide menu for tablets -->
    <Transition name="slide">
      <div v-if="mobileMenuOpen" class="mobile-menu" @click="mobileMenuOpen = false">
        <nav class="mobile-nav">
          <NuxtLink to="/catalog" class="mobile-link">Каталог</NuxtLink>
          <NuxtLink to="/team" class="mobile-link">Команда</NuxtLink>
          <NuxtLink to="/about" class="mobile-link">О нас</NuxtLink>
          <NuxtLink to="/contacts" class="mobile-link">Контакты</NuxtLink>
        </nav>
        <a href="tel:+79074497500" class="mobile-phone">+7 (907) 449-75-00</a>
      </div>
    </Transition>
  </header>
</template>

<style scoped>
.header {
  position: fixed; top: 0; left: 0; right: 0; z-index: 100;
  height: var(--header-h);
  background: rgba(255, 255, 255, 0.97);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--border-light);
}

.header-inner {
  display: flex; align-items: center; gap: 16px; height: 100%;
}

/* Back button */
.back-btn {
  display: flex; align-items: center; justify-content: center;
  width: 36px; height: 36px;
  background: none; border: none; color: var(--text);
  flex-shrink: 0; cursor: pointer; margin-right: -8px;
}
@media (min-width: 1024px) { .back-btn { display: none; } }


.logo { display: flex; align-items: center; flex-shrink: 0; }
.logo-img { height: 56px; width: auto; object-fit: contain; }
@media (min-width: 768px) { .logo-img { height: 72px; } }

/* Nav */
.nav-desktop { display: none; gap: 24px; }
.nav-link { font-size: 14px; font-weight: 500; color: var(--text); transition: color 0.15s; }
.nav-link:hover, .nav-link.router-link-active { color: var(--primary); }
@media (min-width: 1024px) { .nav-desktop { display: flex; } }

/* ── Search ───────────────────────── */
.search-wrap { flex: 1; max-width: 520px; position: relative; }

.search-input {
  width: 100%; height: 44px;
  padding: 0 40px 0 42px;
  background: var(--bg-alt);
  border: 2px solid var(--primary-light);
  border-radius: 22px;
  color: var(--text); font-size: 15px; outline: none;
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
}
.search-input:focus {
  border-color: var(--primary); background: var(--bg);
  box-shadow: 0 0 0 4px rgba(26, 86, 50, 0.1);
}
.search-wrap.active .search-input {
  border-radius: 22px 22px 0 0; border-color: var(--primary); background: var(--bg);
}
.search-input::placeholder { color: var(--text-muted); font-size: 13px; }

.search-icon {
  position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
  width: 18px; height: 18px; color: var(--primary-light); pointer-events: none;
  transition: color 0.15s;
}
.search-input:focus ~ .search-icon { color: var(--primary); }

.search-clear {
  position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
  width: 26px; height: 26px; border-radius: 50%;
  background: var(--border); border: none; color: var(--text-secondary);
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s;
}
.search-clear:hover { background: var(--text-muted); color: #fff; }

/* ── Dropdown ─────────────────────── */
.search-dropdown {
  position: absolute; top: 100%; left: 0; right: 0;
  background: var(--bg);
  border: 1.5px solid var(--primary); border-top: 1px solid var(--border-light);
  border-radius: 0 0 16px 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  max-height: min(460px, calc(100dvh - var(--header-h) - 20px));
  overflow-y: auto; z-index: 200;
}
.dd-empty { padding: 20px 16px; text-align: center; color: var(--text-muted); font-size: 13px; }
.dd-section { padding: 6px 0; }
.dd-section-title { padding: 6px 16px 4px; font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.8px; }

.dd-genus { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 16px; min-height: 48px; background: none; border: none; text-align: left; cursor: pointer; transition: background 0.1s; }
.dd-genus:hover { background: var(--bg-alt); }
.dd-genus-img { width: 36px; height: 36px; border-radius: 8px; object-fit: cover; flex-shrink: 0; }
.dd-genus-info { flex: 1; min-width: 0; }
.dd-genus-name { display: block; font-size: 14px; font-weight: 600; color: var(--text); }
.dd-genus-latin { display: block; font-size: 11px; color: var(--text-muted); font-style: italic; }
.dd-genus-count { font-size: 12px; color: var(--text-muted); background: var(--bg-alt); padding: 2px 8px; border-radius: 10px; font-weight: 600; flex-shrink: 0; }

.dd-plant { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 16px; min-height: 52px; background: none; border: none; text-align: left; cursor: pointer; transition: background 0.1s; }
.dd-plant:hover { background: var(--bg-alt); }
.dd-plant-img { width: 44px; height: 44px; border-radius: 8px; object-fit: cover; flex-shrink: 0; }
.dd-plant-img-empty { background: var(--bg-alt); }
.dd-plant-info { flex: 1; min-width: 0; }
.dd-plant-name { display: block; font-size: 13px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dd-plant-species { display: block; font-size: 11px; color: var(--text-secondary); font-style: italic; }
.dd-plant-meta { display: flex; gap: 4px; flex-shrink: 0; }
.dd-tag { font-size: 9px; font-weight: 600; padding: 2px 6px; border-radius: 6px; background: #e8f5e9; color: #2e7d32; white-space: nowrap; }
.dd-tag-color { background: #e3f2fd; color: #1565c0; }

.dd-showall { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; padding: 12px 16px; background: none; border: none; border-top: 1px solid var(--border-light); color: var(--primary); font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.1s; }
.dd-showall:hover { background: var(--bg-alt); }

.dropdown-enter-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.dropdown-leave-active { transition: opacity 0.1s ease; }
.dropdown-enter-from { opacity: 0; transform: translateY(-4px); }
.dropdown-leave-to { opacity: 0; }

/* Social links — desktop only */
.social-links { display: none; align-items: center; gap: 4px; flex-shrink: 0; }
@media (min-width: 1024px) { .social-links { display: flex; } }

/* Desktop-only helper */
.desktop-only { display: none !important; }
@media (min-width: 1024px) { .desktop-only { display: flex !important; } }

.social-btn {
  display: flex; align-items: center; justify-content: center;
  color: var(--text-secondary); transition: opacity 0.15s;
  opacity: 0.7;
}
.social-btn:hover { opacity: 1; }
.dzen-btn { gap: 3px; }
.dzen-label { font-size: 11px; font-weight: 800; color: var(--text-secondary); letter-spacing: 0.5px; }

/* Favorites */
.fav-btn {
  position: relative;
  display: flex; align-items: center; justify-content: center;
  width: 34px; height: 34px; flex-shrink: 0;
  color: var(--text-secondary); transition: color 0.15s;
}
.fav-btn:hover { color: #e53935; }

.fav-badge {
  position: absolute; top: 0; right: -2px;
  background: #e53935; color: #fff;
  font-size: 10px; font-weight: 700;
  min-width: 16px; height: 16px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  padding: 0 3px;
}

/* Random plant button */
.random-btn {
  display: none; align-items: center; gap: 6px;
  padding: 8px 16px;
  background: var(--bg-alt); border: 1.5px solid var(--border);
  border-radius: 20px;
  color: var(--primary); font-weight: 600; font-size: 13px;
  white-space: nowrap; flex-shrink: 0; margin-left: auto;
  cursor: pointer; transition: border-color 0.15s, background 0.15s;
}
.random-btn:hover { border-color: var(--primary); background: rgba(26, 86, 50, 0.04); }
.random-label { display: none; }
@media (min-width: 768px) { .random-btn { display: flex; } }
@media (min-width: 1024px) { .random-label { display: inline; } }

/* Burger */
/* Hide burger on mobile (tab bar) and desktop (nav links) — show only on tablet */
.burger { display: none; align-items: center; justify-content: center; width: 44px; height: 44px; background: none; border: none; flex-shrink: 0; }
@media (min-width: 768px) and (max-width: 1023px) { .burger { display: flex; } }
.burger span { display: block; width: 20px; height: 2px; background: var(--text); position: relative; transition: all 0.2s; }
.burger span::before, .burger span::after { content: ''; position: absolute; left: 0; width: 100%; height: 2px; background: var(--text); transition: all 0.2s; }
.burger span::before { top: -6px; }
.burger span::after { top: 6px; }
.burger span.open { background: transparent; }
.burger span.open::before { top: 0; transform: rotate(45deg); }
.burger span.open::after { top: 0; transform: rotate(-45deg); }
/* burger visibility managed above */

/* Mobile menu */
.mobile-menu {
  position: fixed; top: var(--header-h); left: 0; right: 0; bottom: 0;
  background: #fff;
  padding: 0; z-index: 99;
  overflow-y: auto;
}
.mobile-nav { display: flex; flex-direction: column; padding: 8px 0; }
.mobile-link {
  display: flex; align-items: center;
  font-size: 17px; font-weight: 600; padding: 16px 20px;
  color: var(--text); border-bottom: 1px solid var(--border-light);
}
.mobile-link:active { background: var(--bg-alt); }
.mobile-phone {
  display: flex; align-items: center; gap: 10px;
  margin: 0; padding: 16px 20px;
  font-size: 17px; font-weight: 700; color: var(--primary);
  border-bottom: 1px solid var(--border-light);
}

.slide-enter-active, .slide-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.slide-enter-from, .slide-leave-to { opacity: 0; transform: translateY(-10px); }

/* ── User Menu ────────────────────── */
.user-menu-wrap { position: relative; flex-shrink: 0; }
.user-btn { display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 50%; background: none; border: 1.5px solid var(--border); color: var(--text-muted); cursor: pointer; transition: all 0.15s; }
.user-btn:hover { border-color: var(--primary); color: var(--primary); }
.user-btn-active { border: none; background: var(--primary); color: #fff; }
.user-avatar { font-size: 14px; font-weight: 700; }
.user-dropdown { position: absolute; top: calc(100% + 8px); right: 0; width: 240px; background: var(--bg); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.12); z-index: 300; overflow: hidden; }
.ud-header { padding: 14px 16px 10px; }
.ud-name { display: block; font-size: 14px; font-weight: 700; color: var(--text); }
.ud-role { display: block; font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.ud-divider { height: 1px; background: var(--border-light); }
.ud-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 16px; font-size: 13px; font-weight: 500; color: var(--text); background: none; border: none; text-align: left; cursor: pointer; transition: background 0.1s; }
.ud-item:hover { background: var(--bg-alt); }
.ud-item svg { color: var(--text-muted); flex-shrink: 0; }
.ud-logout { color: #e53935; }
.ud-logout svg { color: #e53935; }
.dropdown-enter-active, .dropdown-leave-active { transition: opacity 0.15s, transform 0.15s; }
.dropdown-enter-from, .dropdown-leave-to { opacity: 0; transform: translateY(-6px); }
</style>
