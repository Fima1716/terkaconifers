<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'

// ── Types (shared with editor) ──────────────
export interface BEl {
  id: string
  type: 'heading' | 'subheading' | 'button' | 'image' | 'shape'
  x: number   // % of canvas width
  y: number   // px from top
  content: string
  link?: string
  fontSize: number
  fontWeight: number
  color: string
  letterSpacing: number
  zIndex: number
  shadow?: boolean
  width?: number
  height?: number
  opacity?: number
  borderRadius?: number
}

export interface Slide {
  bgType: string; bgColor1: string; bgColor2: string; bgImage: string; overlay: number
  bgFit?: 'cover' | 'contain' | 'fill'
  elements: BEl[]
  clickLink?: string
  // Legacy
  title?: string; subtitle?: string; buttonText?: string; buttonLink?: string
  textAlign?: string; textColor?: string; type?: string
}

export interface BannerConfig {
  enabled: boolean; interval: number; canvasHeight: number; designWidth: number; slides: Slide[]
}

const props = defineProps<{ page?: string }>()
const auth = useAuthStore()
const bannerPage = computed(() => props.page || 'home')
function imgUrl(f: string) { return `/banner/${f}` }

// ── Migration ───────────────────────────────
let uid = 0
function genId() { return 'el_' + Date.now() + '_' + (uid++) }

function migrate(raw: any): BannerConfig {
  const slides = (raw.slides || []).map((s: any) => {
    if (s.bgImage && s.bgType !== 'image') s.bgType = 'image'
    if (s.elements) return s
    const els: BEl[] = []
    if (s.title) els.push({ id: genId(), type: 'heading', x: 4, y: 40, content: s.title, fontSize: 34, fontWeight: 800, color: s.textColor || '#ffffff', letterSpacing: 0, zIndex: 3 })
    if (s.subtitle) els.push({ id: genId(), type: 'subheading', x: 4, y: 100, content: s.subtitle, fontSize: 16, fontWeight: 400, color: s.textColor || '#ffffff', letterSpacing: 0, zIndex: 2 })
    if (s.buttonText) els.push({ id: genId(), type: 'button', x: 4, y: 160, content: s.buttonText, link: s.buttonLink || '/catalog', fontSize: 14, fontWeight: 700, color: '#1a5632', letterSpacing: 0, zIndex: 4 })
    return { bgType: s.bgType || 'gradient', bgColor1: s.bgColor1 || '#1a5632', bgColor2: s.bgColor2 || '#2d8b4e', bgImage: s.bgImage || '', overlay: s.overlay ?? 0.4, elements: els }
  })
  return { enabled: raw.enabled !== false, interval: raw.interval || 6000, canvasHeight: raw.canvasHeight || raw.layout?.bannerHeight || 280, designWidth: raw.designWidth || 960, slides }
}

// ── State ───────────────────────────────────
const config = ref<BannerConfig | null>(null)
const current = ref(0)
let timer: ReturnType<typeof setInterval> | null = null
const viewportRef = ref<HTMLElement>()
const s = ref(1)
let resizeObs: ResizeObserver | null = null

function updateScale() {
  if (!viewportRef.value || !config.value) return
  s.value = viewportRef.value.clientWidth / config.value.designWidth
}

const isMobileView = ref(false)
const showEditor = ref(false)

onMounted(async () => {
  isMobileView.value = window.innerWidth < 768
  try {
    let raw: any = null
    if (isMobileView.value) {
      try {
        const mRaw = await $fetch<any>(`/api/banner?page=${bannerPage.value}-mobile&_=${Date.now()}`)
        if (mRaw?.enabled && mRaw.slides?.length > 0) raw = mRaw
      } catch {}
    }
    if (!raw) {
      raw = await $fetch<any>(`/api/banner?page=${bannerPage.value}&_=${Date.now()}`)
    }
    if (raw?.enabled && raw.slides?.length > 0) {
      config.value = migrate(raw)
      if (raw.slides.length > 1) startAutoplay()
    }
  } catch {}
  nextTick(() => {
    if (viewportRef.value) {
      updateScale()
      resizeObs = new ResizeObserver(updateScale)
      resizeObs.observe(viewportRef.value)
    }
  })
})

onUnmounted(() => { stopAutoplay(); resizeObs?.disconnect() })

function startAutoplay() {
  timer = setInterval(() => {
    if (!config.value || showEditor.value) return
    current.value = (current.value + 1) % config.value.slides.length
  }, config.value?.interval || 6000)
}
function stopAutoplay() { if (timer) { clearInterval(timer); timer = null } }
function resetTimer() { stopAutoplay(); if (config.value && config.value.slides.length > 1 && !showEditor.value) startAutoplay() }
function prev() { if (!config.value) return; current.value = (current.value - 1 + config.value.slides.length) % config.value.slides.length; resetTimer() }
function next() { if (!config.value) return; current.value = (current.value + 1) % config.value.slides.length; resetTimer() }
function goTo(i: number) { current.value = i; resetTimer() }

function bgStyle(slide: Slide): Record<string, string> {
  if (slide.bgType === 'gradient') return { background: `linear-gradient(135deg, ${slide.bgColor1}, ${slide.bgColor2})` }
  if (slide.bgType === 'color') return { background: slide.bgColor1 }
  if (slide.bgType === 'image' && slide.bgImage) {
    const src = slide.bgImage.startsWith('data:') ? slide.bgImage : imgUrl(slide.bgImage)
    return { backgroundImage: `url(${src})` }
  }
  return {}
}

const hasMultiple = computed(() => (config.value?.slides.length ?? 0) > 1)
let sx = 0, sy = 0
function onSwipeStart(e: TouchEvent) { if (showEditor.value) return; sx = e.touches[0].clientX; sy = e.touches[0].clientY }
function onSwipeEnd(e: TouchEvent) {
  if (showEditor.value) return
  const dx = sx - e.changedTouches[0].clientX
  if (Math.abs(dx) > 50 && Math.abs(sy - e.changedTouches[0].clientY) < 80) dx > 0 ? next() : prev()
}

function createBanner() {
  config.value = {
    enabled: true, interval: 6000, canvasHeight: 280, designWidth: 960,
    slides: [{
      bgType: 'gradient', bgColor1: '#1a5632', bgColor2: '#2d8b4e', bgImage: '', overlay: 0.4,
      elements: [
        { id: genId(), type: 'heading', x: 5, y: 40, content: 'Заголовок', fontSize: 32, fontWeight: 800, color: '#ffffff', letterSpacing: 0, zIndex: 3, shadow: false },
        { id: genId(), type: 'subheading', x: 5, y: 90, content: 'Подзаголовок', fontSize: 16, fontWeight: 400, color: '#ffffff', letterSpacing: 0, zIndex: 2, shadow: false },
      ],
    }],
  }
  showEditor.value = true
}

function startEdit() {
  if (!config.value) return
  stopAutoplay()
  showEditor.value = true
}

function onEditorSave(newConfig: BannerConfig) {
  config.value = newConfig
  showEditor.value = false
  current.value = 0
  resetTimer()
}

function onEditorClose() {
  showEditor.value = false
  resetTimer()
}
</script>

<template>
  <!-- Create button -->
  <div v-if="!config && !showEditor && auth.isSuperAdmin" class="banner-create" @click="createBanner">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M12 5v14M5 12h14"/></svg>
    <span>Создать баннер</span>
  </div>

  <section v-if="config" class="promo-banner">
    <!-- Edit FAB -->
    <button v-if="auth.isSuperAdmin && !showEditor" class="edit-fab" @click="startEdit" title="Редактировать баннер">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
    </button>

    <!-- Carousel -->
    <div ref="viewportRef" class="display-viewport" @touchstart.passive="onSwipeStart" @touchend.passive="onSwipeEnd">
      <div class="display-track" :style="{ transform: `translateX(-${current * 100}%)`, willChange: 'transform' }">
        <component
          v-for="(slide, i) in config.slides" :key="i"
          :is="slide.clickLink ? 'a' : 'div'"
          :href="slide.clickLink || undefined"
          :target="slide.clickLink?.startsWith('http') ? '_blank' : undefined"
          :rel="slide.clickLink?.startsWith('http') ? 'noopener noreferrer' : undefined"
          :class="['display-slide', { 'slide-clickable': !!slide.clickLink }]"
        >
          <div class="slide-wrapper" :style="{ height: config.canvasHeight * s + 'px' }">
            <div
              class="slide-inner"
              :style="{
                transform: `scale(${s})`,
                transformOrigin: 'top left',
                width: config.designWidth + 'px',
                height: config.canvasHeight + 'px',
              }"
            >
              <div
                class="slide-bg"
                :style="{
                  ...bgStyle(slide),
                  backgroundSize: slide.bgFit === 'contain' ? 'contain' : slide.bgFit === 'fill' ? '100% 100%' : 'cover',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'center',
                }"
              >
                <div v-if="slide.bgType === 'image' && slide.bgImage" class="slide-overlay" :style="{ opacity: slide.overlay }" />
              </div>

              <template v-for="el in slide.elements" :key="el.id">
                <div
                  v-if="el.type === 'shape'"
                  class="display-el"
                  :style="{
                    left: el.x + '%', top: el.y + 'px',
                    width: (el.width || 200) + 'px', height: (el.height || 100) + 'px',
                    background: el.color, opacity: el.opacity ?? 0.5,
                    borderRadius: (el.borderRadius || 0) + 'px', zIndex: el.zIndex,
                    pointerEvents: 'none',
                  }"
                />
                <img
                  v-else-if="el.type === 'image' && el.content"
                  :src="el.content.startsWith('data:') || el.content.startsWith('http') ? el.content : imgUrl(el.content)"
                  class="display-el display-image"
                  :style="{
                    left: el.x + '%', top: el.y + 'px',
                    width: (el.width || 200) + 'px',
                    height: el.height ? el.height + 'px' : 'auto',
                    objectFit: el.height ? 'cover' : 'contain',
                    zIndex: el.zIndex,
                  }"
                  draggable="false"
                />
                <a
                  v-else-if="el.type === 'button' && el.link"
                  :href="el.link"
                  :target="el.link.startsWith('http') ? '_blank' : undefined"
                  :rel="el.link.startsWith('http') ? 'noopener noreferrer' : undefined"
                  class="display-el display-button"
                  :style="{
                    left: el.x + '%', top: el.y + 'px',
                    fontSize: el.fontSize + 'px', fontWeight: el.fontWeight,
                    color: el.color, letterSpacing: el.letterSpacing + 'px',
                    zIndex: el.zIndex, textShadow: el.shadow ? '0 2px 10px rgba(0,0,0,0.3)' : 'none',
                  }"
                >{{ el.content }}</a>
                <div
                  v-else
                  :class="['display-el', el.type === 'heading' ? 'display-heading' : 'display-subheading']"
                  :style="{
                    left: el.x + '%', top: el.y + 'px',
                    fontSize: el.fontSize + 'px', fontWeight: el.fontWeight,
                    color: el.color, letterSpacing: el.letterSpacing + 'px',
                    zIndex: el.zIndex, textShadow: el.shadow ? '0 2px 10px rgba(0,0,0,0.3)' : 'none',
                  }"
                >{{ el.content }}</div>
              </template>
            </div>
          </div>
        </component>
      </div>
    </div>

    <!-- Navigation -->
    <div v-if="hasMultiple" class="nav-bar">
      <button class="nav-arrow" @click="prev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><path d="M15 18l-6-6 6-6"/></svg></button>
      <div class="nav-dots">
        <button v-for="(_, i) in config.slides" :key="i" class="dot" :class="{ active: i === current }" @click="goTo(i)" />
      </div>
      <button class="nav-arrow" @click="next"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><path d="M9 18l6-6-6-6"/></svg></button>
    </div>
  </section>

  <!-- Editor (lazy-loaded) -->
  <PromoBannerEditor
    v-if="showEditor && config"
    :config="config"
    :page="bannerPage"
    @save="onEditorSave"
    @close="onEditorClose"
  />
</template>

<style scoped>
.banner-create {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 24px; margin: 8px 16px; border: 2px dashed var(--border);
  border-radius: var(--radius); color: var(--text-muted); cursor: pointer;
  font-size: 14px; font-weight: 500; transition: all 0.15s;
}
.banner-create:hover { border-color: var(--primary); color: var(--primary); background: rgba(26,86,50,0.03); }

.promo-banner { position: relative; }

.edit-fab {
  position: absolute; top: 12px; right: 12px; z-index: 10;
  width: 36px; height: 36px; border-radius: 50%;
  background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.2);
  color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer;
}
.edit-fab:hover { background: rgba(0,0,0,0.7); }

.display-viewport { position: relative; overflow: hidden; }
.slide-clickable { cursor: pointer; text-decoration: none; color: inherit; }
.display-track { display: flex; transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1); }
.display-slide { min-width: 100%; flex-shrink: 0; }
.slide-wrapper { position: relative; overflow: hidden; }
.slide-inner { position: absolute; top: 0; left: 0; }
.slide-bg { position: absolute; inset: 0; }
.slide-overlay { position: absolute; inset: 0; background: #000; pointer-events: none; }

.display-el {
  position: absolute; line-height: 1.2; text-decoration: none;
  direction: ltr; unicode-bidi: plaintext; max-width: 90%;
}
.display-heading { font-weight: 800; }
.display-subheading { opacity: 0.9; }
.display-image { pointer-events: none; }
.display-button {
  display: inline-block; padding: 11px 28px;
  background: rgba(255,255,255,0.95); border-radius: 24px;
  font-weight: 700; cursor: pointer; transition: transform 0.15s, box-shadow 0.15s;
}
.display-button:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(0,0,0,0.15); }

.nav-bar { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 10px 0; }
.nav-arrow {
  width: 28px; height: 28px; border-radius: 50%;
  background: #f0f0f0; border: 1px solid #ddd; color: #555;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  flex-shrink: 0; transition: all 0.15s;
}
.nav-arrow:hover { background: #e0e0e0; color: #222; }
.nav-dots { display: flex; gap: 8px; align-items: center; }
.dot { width: 9px; height: 9px; border-radius: 50%; background: #ccc; border: none; cursor: pointer; padding: 0; transition: all 0.15s; }
.dot.active { background: var(--primary, #1a5632); transform: scale(1.25); }
</style>
