<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'

// ── Types ──────────────────────────────────
interface BEl {
  id: string
  type: 'heading' | 'subheading' | 'button' | 'image'
  x: number   // % of canvas width
  y: number   // px from top
  content: string  // text content, or image filename/URL for type=image
  link?: string
  fontSize: number
  fontWeight: number
  color: string
  letterSpacing: number
  zIndex: number
  shadow?: boolean  // text shadow (default false)
  width?: number    // image width in px (for type=image)
  height?: number   // image height in px (for type=image, undefined = auto)
}

interface Slide {
  bgType: string; bgColor1: string; bgColor2: string; bgImage: string; overlay: number
  elements: BEl[]
  clickLink?: string  // entire slide acts as a link
  // Legacy fields
  title?: string; subtitle?: string; buttonText?: string; buttonLink?: string
  textAlign?: string; textColor?: string; type?: string
}

interface BannerConfig {
  enabled: boolean; interval: number; canvasHeight: number; designWidth: number; slides: Slide[]
}

const props = defineProps<{ page?: string }>()

const auth = useAuthStore()
const bannerPage = computed(() => props.page || 'home')
function imgUrl(f: string) { return `/banner/${f}` }

let uid = 0
function genId() { return 'el_' + Date.now() + '_' + (uid++) }

// ── Migrate old format ─────────────────────
function migrate(raw: any): BannerConfig {
  const slides = (raw.slides || []).map((s: any) => {
    // Fix: if bgImage exists but bgType is not 'image', correct it
    if (s.bgImage && s.bgType !== 'image') s.bgType = 'image'

    if (s.elements) return s
    // Convert legacy slide to element-based
    const els: BEl[] = []
    if (s.title) els.push({ id: genId(), type: 'heading', x: 4, y: 40, content: s.title, fontSize: 34, fontWeight: 800, color: s.textColor || '#ffffff', letterSpacing: 0, zIndex: 3 })
    if (s.subtitle) els.push({ id: genId(), type: 'subheading', x: 4, y: 100, content: s.subtitle, fontSize: 16, fontWeight: 400, color: s.textColor || '#ffffff', letterSpacing: 0, zIndex: 2 })
    if (s.buttonText) els.push({ id: genId(), type: 'button', x: 4, y: 160, content: s.buttonText, link: s.buttonLink || '/catalog', fontSize: 14, fontWeight: 700, color: '#1a5632', letterSpacing: 0, zIndex: 4 })
    return { bgType: s.bgType || 'gradient', bgColor1: s.bgColor1 || '#1a5632', bgColor2: s.bgColor2 || '#2d8b4e', bgImage: s.bgImage || '', overlay: s.overlay ?? 0.4, elements: els }
  })
  return { enabled: raw.enabled !== false, interval: raw.interval || 6000, canvasHeight: raw.canvasHeight || raw.layout?.bannerHeight || 280, designWidth: raw.designWidth || 960, slides }
}

// ── State ──────────────────────────────────
const config = ref<BannerConfig | null>(null)
const current = ref(0)
let timer: ReturnType<typeof setInterval> | null = null
const viewportRef = ref<HTMLElement>()
const canvasAreaRef = ref<HTMLElement>()
const canvasAreaWidth = ref(800)
const s = ref(1)
let resizeObs: ResizeObserver | null = null
let canvasAreaObs: ResizeObserver | null = null

function updateScale() {
  if (!viewportRef.value || !config.value) return
  s.value = Math.min(1, viewportRef.value.clientWidth / config.value.designWidth)
}

const isMobileView = ref(false)

onMounted(async () => {
  isMobileView.value = window.innerWidth < 768
  try {
    let raw: any = null
    // On mobile, try mobile-specific config first
    if (isMobileView.value) {
      try {
        const mRaw = await $fetch<any>(`/api/banner?page=${bannerPage.value}-mobile&_=${Date.now()}`)
        if (mRaw?.enabled && mRaw.slides?.length > 0) raw = mRaw
      } catch {}
    }
    // Fall back to default config
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
onUnmounted(() => { stopAutoplay(); resizeObs?.disconnect(); canvasAreaObs?.disconnect(); window.removeEventListener('keydown', onKey); disposeFabric() })

function startAutoplay() { timer = setInterval(() => { if (!config.value || editMode.value) return; current.value = (current.value + 1) % config.value.slides.length }, config.value?.interval || 6000) }
function stopAutoplay() { if (timer) { clearInterval(timer); timer = null } }
function resetTimer() { stopAutoplay(); if (config.value && config.value.slides.length > 1 && !editMode.value) startAutoplay() }
function prev() { if (!config.value) return; current.value = (current.value - 1 + config.value.slides.length) % config.value.slides.length; resetTimer() }
function next() { if (!config.value) return; current.value = (current.value + 1) % config.value.slides.length; resetTimer() }
function goTo(i: number) { current.value = i; resetTimer() }

function bgStyle(slide: Slide, h: number): Record<string, string> {
  const st: Record<string, string> = {}
  if (slide.bgType === 'gradient') st.background = `linear-gradient(135deg, ${slide.bgColor1}, ${slide.bgColor2})`
  else if (slide.bgType === 'color') st.background = slide.bgColor1
  else if (slide.bgType === 'image' && slide.bgImage) {
    const src = slide.bgImage.startsWith('data:') ? slide.bgImage : imgUrl(slide.bgImage)
    st.backgroundImage = `url(${src})`
  }
  return st
}

const hasMultiple = computed(() => (config.value?.slides.length ?? 0) > 1)
let sx = 0, sy = 0
function onSwipeStart(e: TouchEvent) { if (editMode.value) return; sx = e.touches[0].clientX; sy = e.touches[0].clientY }
function onSwipeEnd(e: TouchEvent) { if (editMode.value) return; const dx = sx - e.changedTouches[0].clientX; if (Math.abs(dx) > 50 && Math.abs(sy - e.changedTouches[0].clientY) < 80) dx > 0 ? next() : prev() }

// ── Editor ─────────────────────────────────
const editMode = ref(false)
const editConfig = ref<BannerConfig | null>(null)
const editVariant = ref<'desktop' | 'mobile'>('desktop')
const mobileConfig = ref<BannerConfig | null>(null)
const desktopConfigCache = ref<BannerConfig | null>(null)
const selectedId = ref('')
const saving = ref(false)
const saveError = ref('')
const bgFile = ref<File | null>(null)
const bgFileSlideIndex = ref(-1)

// Device presets for mobile preview
const DEVICES = [
  { name: 'iPhone SE', w: 375, h: 200 },
  { name: 'iPhone 14', w: 390, h: 210 },
  { name: 'iPhone 14 Pro Max', w: 430, h: 220 },
  { name: 'Galaxy S24', w: 412, h: 215 },
  { name: 'Pixel 8', w: 393, h: 210 },
] as const
const selectedDevice = ref(0)

const editSlide = computed(() => editConfig.value?.slides[current.value] || null)
const selectedEl = computed(() => editSlide.value?.elements.find(e => e.id === selectedId.value) || null)

// Editor scale: fit canvas to workspace without exceeding 1:1
const editorScale = computed(() => {
  if (!editConfig.value || !editMode.value) return 1
  const available = canvasAreaWidth.value - 80
  const natural = available / editConfig.value.designWidth
  return Math.min(1, Math.max(0.4, natural))
})

// ── Fabric.js ──────────────────────────────
const fabricCanvasRef = ref<HTMLCanvasElement>()
let fabricCanvas: InstanceType<typeof import('fabric').Canvas> | null = null
let fabricModule: typeof import('fabric') | null = null
let suppressFabricSync = false

async function ensureFabricModule() {
  if (!fabricModule) {
    fabricModule = await import('fabric')
  }
  return fabricModule
}

function disposeFabric() {
  if (fabricCanvas) {
    fabricCanvas.dispose()
    fabricCanvas = null
  }
}

async function initFabricCanvas() {
  if (!process.client) return
  const fabric = await ensureFabricModule()
  disposeFabric()

  await nextTick()
  const el = fabricCanvasRef.value
  if (!el || !editConfig.value) return

  const dw = editConfig.value.designWidth
  const ch = editConfig.value.canvasHeight

  fabricCanvas = new fabric.Canvas(el, {
    width: dw,
    height: ch,
    selection: true,
    preserveObjectStacking: true,
    backgroundColor: 'transparent',
  })

  renderSlideToCanvas()

  fabricCanvas.on('selection:created', onFabricSelect)
  fabricCanvas.on('selection:updated', onFabricSelect)
  fabricCanvas.on('selection:cleared', () => { selectedId.value = '' })
  fabricCanvas.on('object:modified', onFabricModified)
  fabricCanvas.on('text:changed', onFabricTextChanged)
}

function onFabricSelect(e: any) {
  const obj = e.selected?.[0]
  if (obj && obj.data?.belId) {
    selectedId.value = obj.data.belId
  }
}

function onFabricModified(e: any) {
  const obj = e.target
  if (!obj || !obj.data?.belId || !editSlide.value || !editConfig.value) return
  const el = editSlide.value.elements.find(b => b.id === obj.data.belId)
  if (!el) return

  const dw = editConfig.value.designWidth

  if (el.type === 'image') {
    el.x = (obj.left / dw) * 100
    el.y = obj.top
    el.width = Math.round(obj.getScaledWidth())
    el.height = Math.round(obj.getScaledHeight())
  } else if (el.type === 'button') {
    // Button is a group
    el.x = (obj.left / dw) * 100
    el.y = obj.top
    const scale = obj.scaleX || 1
    el.fontSize = Math.round((el.fontSize || 14) * scale)
    obj.scaleX = 1
    obj.scaleY = 1
  } else {
    // Textbox
    el.x = (obj.left / dw) * 100
    el.y = obj.top
    el.fontSize = Math.round(obj.fontSize * (obj.scaleX || 1))
    obj.scaleX = 1
    obj.scaleY = 1
    obj.set('fontSize', el.fontSize)
  }
}

function onFabricTextChanged(e: any) {
  const obj = e.target
  if (!obj || !obj.data?.belId || !editSlide.value) return
  const el = editSlide.value.elements.find(b => b.id === obj.data.belId)
  if (!el) return
  el.content = obj.text || ''
}

async function renderSlideToCanvas() {
  if (!fabricCanvas || !editConfig.value || !editSlide.value) return
  const fabric = await ensureFabricModule()
  const dw = editConfig.value.designWidth
  const ch = editConfig.value.canvasHeight
  const slide = editSlide.value

  suppressFabricSync = true
  fabricCanvas.clear()
  fabricCanvas.setDimensions({ width: dw, height: ch })

  // Background
  if (slide.bgType === 'gradient') {
    const grad = new fabric.Gradient({
      type: 'linear',
      coords: { x1: 0, y1: 0, x2: dw, y2: ch },
      colorStops: [
        { offset: 0, color: slide.bgColor1 },
        { offset: 1, color: slide.bgColor2 },
      ],
    })
    fabricCanvas.backgroundColor = grad as any
  } else if (slide.bgType === 'color') {
    fabricCanvas.backgroundColor = slide.bgColor1
  } else if (slide.bgType === 'image' && slide.bgImage) {
    const src = slide.bgImage.startsWith('data:') ? slide.bgImage : imgUrl(slide.bgImage)
    try {
      const img = await fabric.FabricImage.fromURL(src, { crossOrigin: 'anonymous' })
      img.scaleToWidth(dw)
      if (img.getScaledHeight() < ch) img.scaleToHeight(ch)
      img.set({
        left: dw / 2,
        top: ch / 2,
        originX: 'center',
        originY: 'center',
        selectable: false,
        evented: false,
      })
      fabricCanvas.add(img)
      fabricCanvas.sendObjectToBack(img)
      // Overlay
      if (slide.overlay > 0) {
        const overlay = new fabric.Rect({
          left: 0, top: 0, width: dw, height: ch,
          fill: `rgba(0,0,0,${slide.overlay})`,
          selectable: false, evented: false,
        })
        fabricCanvas.add(overlay)
        // Keep overlay behind elements but in front of bg image
      }
    } catch {
      fabricCanvas.backgroundColor = '#333'
    }
  }

  // Sort elements by zIndex
  const sorted = [...slide.elements].sort((a, b) => a.zIndex - b.zIndex)

  for (const el of sorted) {
    const left = (el.x / 100) * dw
    const top = el.y

    if (el.type === 'image' && el.content) {
      const src = el.content.startsWith('data:') || el.content.startsWith('http') ? el.content : imgUrl(el.content)
      try {
        const img = await fabric.FabricImage.fromURL(src, { crossOrigin: 'anonymous' })
        const targetW = el.width || 200
        img.scaleToWidth(targetW)
        if (el.height) {
          img.scaleToHeight(el.height)
        }
        img.set({
          left, top,
          data: { belId: el.id, belType: el.type },
          cornerColor: '#ff6d00',
          cornerStrokeColor: '#fff',
          cornerSize: 10,
          transparentCorners: false,
          borderColor: '#ff6d00',
        })
        fabricCanvas.add(img)
      } catch {
        // skip broken image
      }
    } else if (el.type === 'button') {
      const padH = 28, padV = 11
      const textObj = new fabric.Textbox(el.content || 'Button', {
        fontSize: el.fontSize,
        fontWeight: String(el.fontWeight),
        fill: el.color,
        fontFamily: 'inherit',
        charSpacing: el.letterSpacing * 1000 / (el.fontSize || 14),
        editable: true,
        textAlign: 'center',
        splitByGrapheme: false,
      })
      const tw = textObj.width || 80
      const th = textObj.height || 20
      const bgRect = new fabric.Rect({
        width: tw + padH * 2,
        height: th + padV * 2,
        rx: 24, ry: 24,
        fill: 'rgba(255,255,255,0.95)',
        originX: 'center', originY: 'center',
      })
      textObj.set({ originX: 'center', originY: 'center' })
      const group = new fabric.Group([bgRect, textObj], {
        left, top,
        data: { belId: el.id, belType: el.type },
        cornerColor: '#ff6d00',
        cornerStrokeColor: '#fff',
        cornerSize: 10,
        transparentCorners: false,
        borderColor: '#ff6d00',
        subTargetCheck: true,
      })
      if (el.shadow) {
        group.shadow = new fabric.Shadow({ color: 'rgba(0,0,0,0.3)', blur: 10, offsetX: 0, offsetY: 2 })
      }
      fabricCanvas.add(group)
    } else {
      // heading or subheading => Textbox
      const tb = new fabric.Textbox(el.content || '', {
        left, top,
        fontSize: el.fontSize,
        fontWeight: String(el.fontWeight),
        fill: el.color,
        fontFamily: 'inherit',
        charSpacing: el.letterSpacing * 1000 / (el.fontSize || 16),
        width: dw * 0.9,
        editable: true,
        splitByGrapheme: false,
        data: { belId: el.id, belType: el.type },
        cornerColor: '#ff6d00',
        cornerStrokeColor: '#fff',
        cornerSize: 10,
        transparentCorners: false,
        borderColor: '#ff6d00',
      })
      if (el.shadow) {
        tb.shadow = new fabric.Shadow({ color: 'rgba(0,0,0,0.3)', blur: 10, offsetX: 0, offsetY: 2 })
      }
      fabricCanvas.add(tb)
    }
  }

  fabricCanvas.renderAll()
  suppressFabricSync = false
}

// Sync from sidebar property change into fabric object
function syncElToFabric(el: BEl) {
  if (!fabricCanvas || suppressFabricSync) return
  const obj = fabricCanvas.getObjects().find((o: any) => o.data?.belId === el.id)
  if (!obj) return
  const dw = editConfig.value!.designWidth
  obj.set({ left: (el.x / 100) * dw, top: el.y })

  if (el.type === 'image') {
    if ('scaleToWidth' in obj) {
      (obj as any).scaleToWidth(el.width || 200)
      if (el.height) (obj as any).scaleToHeight(el.height)
    }
  } else if (el.type === 'button') {
    // re-render button group
    renderSlideToCanvas()
    return
  } else {
    const tb = obj as any
    tb.set({
      fontSize: el.fontSize,
      fontWeight: String(el.fontWeight),
      fill: el.color,
      charSpacing: el.letterSpacing * 1000 / (el.fontSize || 16),
    })
    if (el.shadow) {
      tb.shadow = fabricModule ? new fabricModule.Shadow({ color: 'rgba(0,0,0,0.3)', blur: 10, offsetX: 0, offsetY: 2 }) : null
    } else {
      tb.shadow = null
    }
  }
  fabricCanvas.renderAll()
}

// When selected element's properties change in sidebar, push to fabric
watch(selectedEl, (el) => {
  if (el) {
    // Select corresponding fabric object
    if (!fabricCanvas) return
    const obj = fabricCanvas.getObjects().find((o: any) => o.data?.belId === el.id)
    if (obj && fabricCanvas.getActiveObject() !== obj) {
      fabricCanvas.setActiveObject(obj)
      fabricCanvas.renderAll()
    }
  }
}, { flush: 'post' })

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
  startEdit()
}

async function startEdit() {
  if (!config.value) return
  editVariant.value = 'desktop'
  editConfig.value = JSON.parse(JSON.stringify(config.value))
  // Pre-load mobile config
  try {
    const mRaw = await $fetch<any>(`/api/banner?page=${bannerPage.value}-mobile&_=${Date.now()}`)
    mobileConfig.value = (mRaw?.enabled || mRaw?.slides?.length) ? migrate(mRaw) : null
  } catch { mobileConfig.value = null }
  selectedId.value = ''; editMode.value = true; stopAutoplay(); current.value = 0
  window.addEventListener('keydown', onKey)
  nextTick(() => {
    if (canvasAreaRef.value) {
      canvasAreaWidth.value = canvasAreaRef.value.clientWidth
      canvasAreaObs = new ResizeObserver(() => { canvasAreaWidth.value = canvasAreaRef.value!.clientWidth })
      canvasAreaObs.observe(canvasAreaRef.value)
    }
  })
  // Init fabric after DOM updates
  await nextTick()
  await nextTick()
  await initFabricCanvas()
}

async function switchVariant(variant: 'desktop' | 'mobile') {
  if (variant === editVariant.value) return
  // Sync fabric back to BEl before switching
  syncFabricToAllEls()
  // Cache current variant's state before switching
  if (editVariant.value === 'desktop') {
    desktopConfigCache.value = editConfig.value ? JSON.parse(JSON.stringify(editConfig.value)) : null
  } else {
    mobileConfig.value = editConfig.value ? JSON.parse(JSON.stringify(editConfig.value)) : null
  }
  // Clear bgFile to prevent upload leaking across variants
  bgFile.value = null
  bgFileSlideIndex.value = -1
  editVariant.value = variant
  selectedId.value = ''; current.value = 0
  if (variant === 'mobile') {
    if (mobileConfig.value) {
      editConfig.value = JSON.parse(JSON.stringify(mobileConfig.value))
    } else {
      // Create mobile variant with smaller defaults
      editConfig.value = {
        enabled: true, interval: 6000, canvasHeight: 200, designWidth: 375,
        slides: [{
          bgType: 'gradient', bgColor1: '#1a5632', bgColor2: '#2d8b4e', bgImage: '', overlay: 0.4,
          elements: [
            { id: genId(), type: 'heading', x: 5, y: 30, content: 'Заголовок', fontSize: 24, fontWeight: 800, color: '#ffffff', letterSpacing: 0, zIndex: 3, shadow: false },
          ],
        }],
      }
    }
  } else {
    // Switch back to desktop: restore from cache (preserves edits)
    editConfig.value = desktopConfigCache.value ? JSON.parse(JSON.stringify(desktopConfigCache.value)) : JSON.parse(JSON.stringify(config.value!))
  }
  await nextTick()
  await nextTick()
  await initFabricCanvas()
}

function applyDevicePreset(idx: number) {
  selectedDevice.value = idx
  if (!editConfig.value) return
  editConfig.value.designWidth = DEVICES[idx].w
  editConfig.value.canvasHeight = DEVICES[idx].h
  nextTick(() => renderSlideToCanvas())
}

function copyDesktopToMobile() {
  const src = desktopConfigCache.value || config.value
  if (!src) return
  const copy: BannerConfig = JSON.parse(JSON.stringify(src))
  copy.designWidth = DEVICES[selectedDevice.value].w
  copy.canvasHeight = DEVICES[selectedDevice.value].h
  for (const slide of copy.slides) {
    for (const el of slide.elements) {
      el.id = genId()
      if (el.type === 'image') {
        el.width = Math.round((el.width || 200) * 0.4)
      } else {
        el.fontSize = Math.max(12, Math.round(el.fontSize * 0.65))
      }
    }
  }
  editConfig.value = copy
  mobileConfig.value = JSON.parse(JSON.stringify(copy))
  nextTick(() => renderSlideToCanvas())
}

function cancelEdit() {
  disposeFabric()
  editMode.value = false; selectedId.value = ''; editConfig.value = null; desktopConfigCache.value = null; mobileConfig.value = null; bgFile.value = null; bgFileSlideIndex.value = -1; saveError.value = ''
  window.removeEventListener('keydown', onKey); canvasAreaObs?.disconnect(); canvasAreaObs = null; resetTimer()
}

// Sync all fabric objects back to BEl array
function syncFabricToAllEls() {
  if (!fabricCanvas || !editSlide.value || !editConfig.value) return
  const dw = editConfig.value.designWidth
  for (const obj of fabricCanvas.getObjects()) {
    const d = (obj as any).data
    if (!d?.belId) continue
    const el = editSlide.value.elements.find(b => b.id === d.belId)
    if (!el) continue
    el.x = (obj.left! / dw) * 100
    el.y = obj.top!
    if (el.type === 'image') {
      el.width = Math.round(obj.getScaledWidth())
      el.height = Math.round(obj.getScaledHeight())
    } else if (el.type === 'button') {
      // group - just position
    } else {
      // Textbox
      const tb = obj as any
      el.content = tb.text || ''
      el.fontSize = Math.round((tb.fontSize || 16) * (tb.scaleX || 1))
    }
  }
}

// ── Slide management ───────────────────────
function addSlide() {
  if (!editConfig.value) return
  syncFabricToAllEls()
  editConfig.value.slides.push({
    bgType: 'gradient', bgColor1: '#1a5632', bgColor2: '#2d8b4e', bgImage: '', overlay: 0.4,
    elements: [
      { id: genId(), type: 'heading', x: 5, y: 40, content: 'Новый заголовок', fontSize: 32, fontWeight: 800, color: '#ffffff', letterSpacing: 0, zIndex: 3 },
      { id: genId(), type: 'subheading', x: 5, y: 90, content: 'Подзаголовок', fontSize: 16, fontWeight: 400, color: '#ffffff', letterSpacing: 0, zIndex: 2 },
    ],
  })
  current.value = editConfig.value.slides.length - 1
  selectedId.value = ''
  nextTick(() => renderSlideToCanvas())
}

function duplicateSlide() {
  if (!editConfig.value || !editSlide.value) return
  syncFabricToAllEls()
  const copy = JSON.parse(JSON.stringify(editSlide.value))
  copy.elements.forEach((el: BEl) => { el.id = genId() })
  editConfig.value.slides.push(copy)
  current.value = editConfig.value.slides.length - 1
  selectedId.value = ''
  nextTick(() => renderSlideToCanvas())
}

function deleteCurrentSlide() {
  if (!editConfig.value || editConfig.value.slides.length <= 1) return
  editConfig.value.slides.splice(current.value, 1)
  current.value = Math.min(current.value, editConfig.value.slides.length - 1)
  selectedId.value = ''
  nextTick(() => renderSlideToCanvas())
}

function onKey(e: KeyboardEvent) {
  if (!editMode.value) return
  if (e.key === 'Escape') {
    if (fabricCanvas) fabricCanvas.discardActiveObject()
    selectedId.value = ''
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId.value) {
    // Avoid deleting when editing text inside fabric
    if (fabricCanvas) {
      const ao = fabricCanvas.getActiveObject()
      if (ao && (ao as any).isEditing) return
    }
    if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'SELECT') return
    const els = editSlide.value?.elements
    if (els) {
      const idx = els.findIndex(el => el.id === selectedId.value)
      if (idx >= 0) {
        els.splice(idx, 1)
        selectedId.value = ''
        if (fabricCanvas) {
          fabricCanvas.discardActiveObject()
        }
        nextTick(() => renderSlideToCanvas())
      }
    }
  }
}

// ── Add elements ───────────────────────────
function addElement(type: BEl['type']) {
  if (!editSlide.value) return
  const h = editConfig.value!.canvasHeight
  const el: BEl = {
    id: genId(), type, x: 5, y: Math.min(h - 40, 40 + editSlide.value.elements.length * 50),
    content: type === 'heading' ? 'Заголовок' : type === 'subheading' ? 'Подзаголовок' : type === 'button' ? 'Кнопка' : '',
    link: type === 'button' ? '/catalog' : undefined,
    fontSize: type === 'heading' ? 32 : type === 'subheading' ? 16 : 14,
    fontWeight: type === 'heading' ? 800 : type === 'button' ? 700 : 400,
    color: type === 'button' ? '#1a5632' : '#ffffff',
    letterSpacing: 0, zIndex: editSlide.value.elements.length + 1,
    shadow: false, width: type === 'image' ? 200 : undefined,
  }
  editSlide.value.elements.push(el)
  selectedId.value = el.id
  nextTick(() => renderSlideToCanvas())
}

// ── Image upload (element images) ─────────
async function uploadElementImage(file: File): Promise<string | null> {
  const fd = new FormData()
  fd.append('file', file)
  try {
    const res = await $fetch<any>('/api/banner-upload', { method: 'POST', body: fd })
    return res.filename || null
  } catch { return null }
}

function addImageFromFile() {
  const input = document.createElement('input')
  input.type = 'file'; input.accept = 'image/*'
  input.onchange = async () => {
    const f = input.files?.[0]
    if (!f || !editSlide.value) return
    const filename = await uploadElementImage(f)
    if (!filename) return
    addElement('image')
    const el = editSlide.value.elements[editSlide.value.elements.length - 1]
    el.content = filename
    nextTick(() => renderSlideToCanvas())
  }
  input.click()
}

async function onCanvasPaste(e: ClipboardEvent) {
  if (!editMode.value || !editSlide.value) return
  const items = e.clipboardData?.items
  if (!items) return
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault()
      const blob = item.getAsFile()
      if (!blob) continue
      const filename = await uploadElementImage(blob)
      if (!filename) continue
      addElement('image')
      const el = editSlide.value.elements[editSlide.value.elements.length - 1]
      el.content = filename
      nextTick(() => renderSlideToCanvas())
      return
    }
  }
}

// ── Background ─────────────────────────────
function onBgFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f && editSlide.value) {
    bgFile.value = f
    bgFileSlideIndex.value = current.value
    editSlide.value.bgType = 'image'
    const reader = new FileReader()
    reader.onload = () => {
      if (editSlide.value) {
        editSlide.value.bgImage = reader.result as string
        nextTick(() => renderSlideToCanvas())
      }
    }
    reader.readAsDataURL(f)
  }
}

// ── Canvas height resize ───────────────────
function onHeightDragStart(e: MouseEvent | TouchEvent) {
  e.preventDefault()
  const startY = 'touches' in e ? e.touches[0].clientY : e.clientY
  const startH = editConfig.value!.canvasHeight
  const lowestY = editSlide.value?.elements.reduce((max, el) => Math.max(max, el.y + el.fontSize + 20), 100) || 100

  const onMove = (ev: MouseEvent | TouchEvent) => {
    ev.preventDefault()
    const my = 'touches' in ev ? ev.touches[0].clientY : ev.clientY
    editConfig.value!.canvasHeight = Math.max(lowestY, startH + (my - startY) / editorScale.value)
    if (fabricCanvas) {
      fabricCanvas.setDimensions({ width: editConfig.value!.designWidth, height: editConfig.value!.canvasHeight })
      fabricCanvas.renderAll()
    }
  }
  const onUp = () => {
    document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp)
    document.removeEventListener('touchmove', onMove); document.removeEventListener('touchend', onUp)
    nextTick(() => renderSlideToCanvas())
  }
  document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  document.addEventListener('touchmove', onMove, { passive: false }); document.addEventListener('touchend', onUp)
}

// ── Save ───────────────────────────────────
async function saveEdit() {
  if (!editConfig.value) return
  // Sync fabric positions back before saving
  syncFabricToAllEls()
  saving.value = true
  saveError.value = ''
  try {
    const configToSave = JSON.parse(JSON.stringify(editConfig.value))
    for (const slide of configToSave.slides) {
      if (slide.bgImage?.startsWith('data:')) slide.bgImage = ''
    }

    const savePage = editVariant.value === 'mobile' ? `${bannerPage.value}-mobile` : bannerPage.value
    const fd = new FormData()
    fd.append('action', 'saveCanvas')
    fd.append('page', savePage)
    fd.append('config', JSON.stringify(configToSave))
    if (bgFile.value) {
      fd.append('bgImageFile', bgFile.value)
      fd.append('uploadSlideIndex', String(bgFileSlideIndex.value))
    }
    const res = await $fetch<any>('/api/banner', { method: 'POST', body: fd })
    if (res.config) config.value = migrate(res.config)
    // Save the other variant if it was edited
    const otherCache = editVariant.value === 'mobile' ? desktopConfigCache.value : mobileConfig.value
    if (otherCache) {
      const otherPage = editVariant.value === 'mobile' ? bannerPage.value : `${bannerPage.value}-mobile`
      const otherConfig = JSON.parse(JSON.stringify(otherCache))
      for (const slide of otherConfig.slides) {
        if (slide.bgImage?.startsWith('data:')) slide.bgImage = ''
      }
      const fd2 = new FormData()
      fd2.append('action', 'saveCanvas')
      fd2.append('page', otherPage)
      fd2.append('config', JSON.stringify(otherConfig))
      await $fetch<any>('/api/banner', { method: 'POST', body: fd2 })
    }
    disposeFabric()
    editMode.value = false; selectedId.value = ''; editConfig.value = null; desktopConfigCache.value = null; mobileConfig.value = null; bgFile.value = null; bgFileSlideIndex.value = -1
    window.removeEventListener('keydown', onKey); resetTimer()
  } catch (err: any) {
    console.error('Banner save error:', err)
    const status = err?.statusCode || err?.status
    if (status === 401 || status === 403) saveError.value = 'Нет авторизации — перелогиньтесь'
    else saveError.value = 'Ошибка сохранения баннера'
  }
  finally { saving.value = false }
}

function updateEl(field: keyof BEl, value: any) {
  if (selectedEl.value) {
    (selectedEl.value as any)[field] = value
    syncElToFabric(selectedEl.value)
  }
}

function stretchImageToFill(el: BEl) {
  if (!editConfig.value) return
  el.width = editConfig.value.designWidth
  el.height = editConfig.value.canvasHeight
  el.x = 0; el.y = 0
  nextTick(() => renderSlideToCanvas())
}

function resetImageHeight(el: BEl) {
  el.height = undefined
  nextTick(() => renderSlideToCanvas())
}

function deleteSelectedEl() {
  if (!editSlide.value || !selectedEl.value) return
  const idx = editSlide.value.elements.indexOf(selectedEl.value)
  if (idx >= 0) {
    editSlide.value.elements.splice(idx, 1)
    selectedId.value = ''
    if (fabricCanvas) fabricCanvas.discardActiveObject()
    nextTick(() => renderSlideToCanvas())
  }
}

// Watch slide changes to re-render canvas
watch(current, () => {
  selectedId.value = ''
  nextTick(() => renderSlideToCanvas())
})

// Watch bg property changes to re-render
watch(() => editSlide.value ? [editSlide.value.bgType, editSlide.value.bgColor1, editSlide.value.bgColor2, editSlide.value.overlay] : null, () => {
  if (editMode.value && editSlide.value) nextTick(() => renderSlideToCanvas())
}, { deep: true })
</script>

<template>
  <!-- Create banner button when none exists -->
  <div v-if="!config && !editMode && auth.isSuperAdmin" class="banner-create" @click="createBanner">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M12 5v14M5 12h14"/></svg>
    <span>Создать баннер</span>
  </div>

  <section v-if="config" class="promo-banner">
    <!-- ═══════ DISPLAY MODE ═══════ -->
    <template v-if="!editMode">
      <button v-if="auth.isSuperAdmin" class="edit-fab" @click="startEdit" title="Редактировать баннер">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
      </button>

      <div ref="viewportRef" class="display-viewport" @touchstart.passive="onSwipeStart" @touchend.passive="onSwipeEnd">
        <div class="display-track" :style="{ transform: `translateX(-${current * 100}%)` }">
          <component
            v-for="(slide, i) in config.slides" :key="i"
            :is="slide.clickLink ? 'a' : 'div'"
            :href="slide.clickLink || undefined"
            :target="slide.clickLink?.startsWith('http') ? '_blank' : undefined"
            :rel="slide.clickLink?.startsWith('http') ? 'noopener noreferrer' : undefined"
            :class="['display-slide', { 'slide-clickable': !!slide.clickLink }]"
          >
            <div class="slide-wrapper" :style="{ height: config.canvasHeight * s + 'px' }">
              <div class="slide-inner" :style="{ transform: `scale(${s})`, width: (100 / s) + '%', height: config.canvasHeight + 'px' }">
                <div class="slide-bg-abs" :style="bgStyle(slide, config.canvasHeight)">
                  <div v-if="slide.bgType === 'image' && slide.bgImage" class="slide-overlay" :style="{ opacity: slide.overlay }" />
                </div>
                <template v-for="el in slide.elements" :key="el.id">
                  <img
                    v-if="el.type === 'image' && el.content"
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
                    :class="['display-el', 'display-button']"
                    :style="{
                      left: el.x + '%', top: el.y + 'px',
                      fontSize: el.fontSize + 'px', fontWeight: el.fontWeight,
                      color: el.color, letterSpacing: el.letterSpacing + 'px',
                      zIndex: el.zIndex, textShadow: el.shadow ? '0 2px 10px rgba(0,0,0,0.3)' : 'none',
                    }"
                  >{{ el.content }}</a>
                  <div
                    v-else
                    :class="['display-el', `display-${el.type}`]"
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
      <div v-if="hasMultiple" class="nav-bar">
        <button class="nav-arrow" @click="prev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><path d="M15 18l-6-6 6-6"/></svg></button>
        <div class="nav-dots">
          <button v-for="(_, i) in config.slides" :key="i" class="dot" :class="{ active: i === current }" @click="goTo(i)" />
        </div>
        <button class="nav-arrow" @click="next"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><path d="M9 18l6-6-6-6"/></svg></button>
      </div>
    </template>

    <!-- ═══════ EDIT MODE (Fabric.js) ═══════ -->
    <template v-if="editMode && editConfig">
      <div class="editor" @paste="onCanvasPaste">
        <!-- Top bar -->
        <div class="ed-topbar">
          <div class="ed-topbar-left">
            <span class="ed-logo">Banner Editor</span>
            <div class="ed-variant-toggle">
              <button :class="['ed-variant-btn', { active: editVariant === 'desktop' }]" @click="switchVariant('desktop')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                Desktop
              </button>
              <button :class="['ed-variant-btn', { active: editVariant === 'mobile' }]" @click="switchVariant('mobile')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                Mobile
              </button>
            </div>
            <button v-if="editVariant === 'mobile'" class="ed-btn ed-btn-sm ed-copy-desktop" @click="copyDesktopToMobile" title="Скопировать десктоп-версию">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
              Из десктопа
            </button>
            <div class="ed-slides">
              <button v-for="(_, i) in editConfig.slides" :key="i" :class="['ed-slide-btn', { active: current === i }]" @click="syncFabricToAllEls(); current = i; selectedId = ''">
                {{ i + 1 }}
              </button>
              <button class="ed-slide-btn ed-slide-add" @click="addSlide" title="Добавить слайд">+</button>
            </div>
            <button v-if="editConfig.slides.length > 1" class="ed-btn ed-btn-sm" @click="deleteCurrentSlide" title="Удалить текущий слайд">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </button>
            <button class="ed-btn ed-btn-sm" @click="duplicateSlide" title="Дублировать слайд">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            </button>
          </div>
          <div class="ed-topbar-right">
            <span v-if="saveError" class="ed-save-error">{{ saveError }}</span>
            <button class="ed-btn ed-btn-ghost" @click="cancelEdit">Отмена</button>
            <button class="ed-btn ed-btn-primary" :disabled="saving" @click="saveEdit">{{ saving ? 'Сохранение...' : 'Сохранить' }}</button>
          </div>
        </div>

        <div class="ed-workspace">
          <!-- Sidebar -->
          <aside class="ed-sidebar">
            <div class="ed-sidebar-section">
              <div class="ed-sidebar-title">Добавить</div>
              <button class="ed-add-btn" @click="addElement('heading')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M4 12h8m-4-4v8M20 7v10"/></svg>
                Заголовок
              </button>
              <button class="ed-add-btn" @click="addElement('subheading')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M4 6h16M4 12h12M4 18h8"/></svg>
                Подзаголовок
              </button>
              <button class="ed-add-btn" @click="addElement('button')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><rect x="3" y="8" width="18" height="8" rx="3"/><path d="M9 12h6"/></svg>
                Кнопка
              </button>
              <button class="ed-add-btn" @click="addImageFromFile">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
                Картинка
              </button>
              <div class="ed-paste-hint">Ctrl+V — вставить из буфера</div>
            </div>

            <div class="ed-sidebar-section">
              <div class="ed-sidebar-title">Фон</div>
              <select v-if="editSlide" v-model="editSlide.bgType" class="ed-select">
                <option value="gradient">Градиент</option><option value="color">Цвет</option><option value="image">Картинка</option>
              </select>
              <div v-if="editSlide && editSlide.bgType !== 'image'" class="ed-color-row">
                <input type="color" v-model="editSlide.bgColor1" class="ed-color-pick">
                <input v-if="editSlide.bgType === 'gradient'" type="color" v-model="editSlide.bgColor2" class="ed-color-pick">
              </div>
              <template v-else-if="editSlide">
                <input type="file" accept="image/*" @change="onBgFile" class="ed-file">
                <div class="ed-range-row">
                  <span>Затемнение</span>
                  <input type="range" min="0" max="80" :value="Math.round(editSlide.overlay * 100)" @input="editSlide.overlay = ($event.target as any).value / 100">
                  <span class="ed-range-val">{{ Math.round(editSlide.overlay * 100) }}%</span>
                </div>
              </template>
            </div>

            <div v-if="editSlide" class="ed-sidebar-section">
              <div class="ed-sidebar-title">Ссылка слайда</div>
              <input type="text" v-model="editSlide.clickLink" class="ed-text-input" placeholder="Весь слайд как ссылка: /catalog или https://...">
              <div class="ed-hint">Если задано — клик по баннеру ведёт на эту ссылку</div>
            </div>

            <!-- Selected element properties -->
            <div v-if="selectedEl" class="ed-sidebar-section">
              <div class="ed-sidebar-title">{{ selectedEl.type === 'heading' ? 'Заголовок' : selectedEl.type === 'subheading' ? 'Подзаголовок' : selectedEl.type === 'button' ? 'Кнопка' : 'Картинка' }}</div>

              <!-- Image element settings -->
              <template v-if="selectedEl.type === 'image'">
                <div class="ed-range-row">
                  <span>Ширина</span>
                  <input type="range" :min="30" :max="editConfig!.designWidth" :value="selectedEl.width || 200" @input="updateEl('width', +($event.target as any).value)">
                  <span class="ed-range-val">{{ selectedEl.width || 200 }}px</span>
                </div>
                <div class="ed-range-row">
                  <span>Высота</span>
                  <input type="range" :min="30" :max="editConfig!.canvasHeight" :value="selectedEl.height || Math.round((selectedEl.width || 200) * 0.6)" @input="updateEl('height', +($event.target as any).value)">
                  <span class="ed-range-val">{{ selectedEl.height ? selectedEl.height + 'px' : 'авто' }}</span>
                </div>
                <div class="ed-image-actions">
                  <button class="ed-add-btn" @click="stretchImageToFill(selectedEl)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                    На всю область
                  </button>
                  <button v-if="selectedEl.height" class="ed-add-btn" @click="resetImageHeight(selectedEl)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 21H3M21 3H3M12 7v10"/></svg>
                    Авто-высота
                  </button>
                </div>
              </template>

              <!-- Text element settings -->
              <template v-else>
                <div class="ed-range-row">
                  <span>Размер</span>
                  <input type="range" :min="10" :max="72" :value="selectedEl.fontSize" @input="updateEl('fontSize', +($event.target as any).value)">
                  <span class="ed-range-val">{{ selectedEl.fontSize }}</span>
                </div>
                <div class="ed-range-row">
                  <span>Жирность</span>
                  <select :value="selectedEl.fontWeight" @input="updateEl('fontWeight', +($event.target as any).value)" class="ed-select">
                    <option :value="300">Light</option><option :value="400">Regular</option><option :value="500">Medium</option>
                    <option :value="600">Semibold</option><option :value="700">Bold</option><option :value="800">Extra Bold</option>
                  </select>
                </div>
                <div class="ed-range-row">
                  <span>Цвет</span>
                  <input type="color" :value="selectedEl.color" @input="updateEl('color', ($event.target as any).value)" class="ed-color-pick">
                </div>
                <div class="ed-range-row">
                  <span>Интервал</span>
                  <input type="range" min="-2" max="12" :value="selectedEl.letterSpacing" @input="updateEl('letterSpacing', +($event.target as any).value)">
                  <span class="ed-range-val">{{ selectedEl.letterSpacing }}px</span>
                </div>
                <label class="ed-check-row">
                  <input type="checkbox" :checked="!!selectedEl.shadow" @change="updateEl('shadow', ($event.target as any).checked)">
                  <span>Тень текста</span>
                </label>
              </template>

              <!-- Common settings -->
              <div class="ed-range-row">
                <span>Слой</span>
                <input type="range" min="0" max="10" :value="selectedEl.zIndex" @input="updateEl('zIndex', +($event.target as any).value)">
                <span class="ed-range-val">{{ selectedEl.zIndex }}</span>
              </div>
              <div v-if="selectedEl.type === 'button'" class="ed-range-row">
                <span>Ссылка</span>
                <input type="text" :value="selectedEl.link" @input="updateEl('link', ($event.target as any).value)" class="ed-text-input" placeholder="/catalog">
              </div>
              <button class="ed-delete-btn" @click="deleteSelectedEl">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                Удалить
              </button>
            </div>
          </aside>

          <!-- Canvas area -->
          <div ref="canvasAreaRef" class="ed-canvas-area">
            <!-- Device toolbar -->
            <div class="ed-device-bar">
              <template v-if="editVariant === 'mobile'">
                <select class="ed-device-select" :value="selectedDevice" @change="applyDevicePreset(+($event.target as any).value)">
                  <option v-for="(d, i) in DEVICES" :key="i" :value="i">{{ d.name }}</option>
                </select>
                <span class="ed-device-dims">{{ editConfig.designWidth }} x {{ editConfig.canvasHeight }}</span>
              </template>
              <template v-else>
                <span class="ed-device-dims">Desktop — {{ editConfig.designWidth }} x {{ editConfig.canvasHeight }}</span>
              </template>
              <span class="ed-device-zoom">{{ Math.round(editorScale * 100) }}%</span>
            </div>

            <!-- Phone mockup for mobile -->
            <div v-if="editVariant === 'mobile'" class="phone-mockup" :style="{ width: editConfig.designWidth * editorScale + 'px' }">
              <!-- Fake status bar -->
              <div class="phone-status-bar">
                <span>9:41</span>
                <span class="phone-notch-pill" />
                <span class="phone-status-icons">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11"><path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"/></svg>
                  <svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11"><rect x="2" y="6" width="3" height="12" rx="1"/><rect x="7" y="4" width="3" height="14" rx="1"/><rect x="12" y="2" width="3" height="16" rx="1"/><rect x="17" y="0" width="3" height="18" rx="1"/></svg>
                </span>
              </div>
              <!-- Fake header -->
              <div class="phone-fake-header">
                <div class="pfh-back">&#8249;</div>
                <div class="pfh-logo">&#127794;</div>
                <div class="pfh-search"></div>
              </div>
            </div>

            <!-- Fabric Canvas wrapper -->
            <div
              class="ed-canvas-scaler"
              :class="{ 'ed-canvas-mobile-frame': editVariant === 'mobile' }"
              :style="{
                width: editConfig.designWidth * editorScale + 'px',
                height: editConfig.canvasHeight * editorScale + 'px',
              }"
            >
              <div class="ed-fabric-wrap" :style="{ transform: `scale(${editorScale})`, transformOrigin: 'top left', width: editConfig.designWidth + 'px', height: editConfig.canvasHeight + 'px' }">
                <canvas ref="fabricCanvasRef"></canvas>
              </div>
            </div>

            <!-- Fake page content below for mobile context -->
            <div v-if="editVariant === 'mobile'" class="phone-fake-content" :style="{ width: editConfig.designWidth * editorScale + 'px' }">
              <div class="pfc-title">Растения сада <span>152</span></div>
              <div class="pfc-cards">
                <div class="pfc-card" /><div class="pfc-card" /><div class="pfc-card" />
              </div>
              <div class="phone-home-bar"><div class="phone-home-pill" /></div>
            </div>

            <!-- Height resize handle -->
            <div class="height-handle" @mousedown="onHeightDragStart" @touchstart.prevent="onHeightDragStart">
              <div class="height-handle-pill" />
            </div>
            <div class="height-label">{{ editConfig.canvasHeight }}px</div>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
/* ═══════ Create Banner ═══════ */
.banner-create {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 24px; margin: 8px 16px; border: 2px dashed var(--border);
  border-radius: var(--radius); color: var(--text-muted); cursor: pointer;
  font-size: 14px; font-weight: 500; transition: all 0.15s;
}
.banner-create:hover { border-color: var(--primary); color: var(--primary); background: rgba(26,86,50,0.03); }

/* ═══════ Display Mode ═══════ */
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
.slide-inner { position: absolute; top: 0; left: 0; transform-origin: top left; }
.slide-bg-abs { position: absolute; inset: 0; background-size: cover; background-position: center; }
.slide-overlay { position: absolute; inset: 0; background: #000; z-index: 0; pointer-events: none; }

.display-el {
  position: absolute; z-index: 1;
  line-height: 1.2; text-decoration: none;
  direction: ltr; unicode-bidi: plaintext;
}
.display-heading { font-weight: 800; }
.display-subheading { opacity: 0.9; }
.display-button {
  display: inline-block; padding: 11px 28px;
  background: rgba(255,255,255,0.95); border-radius: 24px;
  font-weight: 700; cursor: pointer;
}
.display-button:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(0,0,0,0.15); }
.display-image { height: auto; object-fit: contain; pointer-events: none; }

.nav-bar {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 10px 0;
}
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

/* ═══════ Editor Mode ═══════ */
.editor { background: #0f0f1a; min-height: 100vh; position: relative; z-index: 100; }

/* Top bar */
.ed-topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 20px; background: #16162a; border-bottom: 1px solid #2a2a40;
}
.ed-topbar-left { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.ed-topbar-right { display: flex; align-items: center; gap: 8px; }
.ed-logo { font-size: 14px; font-weight: 700; color: #fff; letter-spacing: 0.5px; }
.ed-variant-toggle { display: flex; gap: 2px; background: #1e1e35; border-radius: 8px; padding: 2px; }
.ed-variant-btn {
  display: flex; align-items: center; gap: 5px; padding: 5px 12px;
  border: none; border-radius: 6px; background: transparent;
  color: #888; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.15s;
}
.ed-variant-btn:hover { color: #ccc; }
.ed-variant-btn.active { background: #2d8b4e; color: #fff; }
.ed-slides { display: flex; gap: 4px; }
.ed-slide-btn {
  width: 28px; height: 28px; border-radius: 6px; border: 1px solid #3a3a50;
  background: transparent; color: #888; font-size: 12px; font-weight: 600; cursor: pointer;
}
.ed-slide-btn.active { background: #ff6d00; border-color: #ff6d00; color: #fff; }
.ed-slide-add { border-style: dashed; color: #ff6d00; border-color: #ff6d00; }
.ed-slide-add:hover { background: rgba(255,109,0,0.15); }
.ed-btn-sm { padding: 4px 8px; border-radius: 6px; background: transparent; border: 1px solid #3a3a50; color: #888; cursor: pointer; display: flex; align-items: center; }
.ed-btn-sm:hover { border-color: #666; color: #fff; }

.ed-btn { padding: 8px 18px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; }
.ed-btn-ghost { background: transparent; color: #999; border: 1px solid #3a3a50; }
.ed-btn-ghost:hover { border-color: #666; color: #fff; }
.ed-btn-primary { background: #ff6d00; color: #fff; }
.ed-btn-primary:hover { background: #e65100; }
.ed-btn-primary:disabled { opacity: 0.5; }
.ed-save-error { color: #ff4444; font-size: 12px; font-weight: 600; margin-right: 8px; }

/* Workspace */
.ed-workspace { display: flex; height: calc(100vh - 50px); }

/* Sidebar */
.ed-sidebar {
  width: 220px; background: #16162a; border-right: 1px solid #2a2a40;
  padding: 16px; overflow-y: auto; flex-shrink: 0;
}
.ed-sidebar-section { margin-bottom: 20px; }
.ed-sidebar-title { font-size: 10px; font-weight: 700; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; }

.ed-add-btn {
  display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 10px 12px; background: #1e1e35; border: 1px solid #2a2a40;
  border-radius: 8px; color: #ccc; font-size: 13px; cursor: pointer;
  margin-bottom: 6px; transition: all 0.15s;
}
.ed-add-btn:hover { background: #2a2a45; border-color: #ff6d00; color: #fff; }
.ed-add-btn svg { color: #ff6d00; }

.ed-select {
  width: 100%; padding: 7px 10px; background: #1e1e35; border: 1px solid #2a2a40;
  border-radius: 6px; color: #ccc; font-size: 12px; margin-bottom: 8px;
}
.ed-color-row { display: flex; gap: 6px; margin-bottom: 8px; }
.ed-color-pick { width: 36px; height: 30px; border: 1px solid #3a3a50; border-radius: 6px; padding: 0; cursor: pointer; background: none; }
.ed-file { font-size: 11px; color: #999; margin-bottom: 8px; display: block; }

.ed-range-row {
  display: flex; align-items: center; gap: 6px; margin-bottom: 8px;
}
.ed-range-row > span:first-child { font-size: 11px; color: #888; min-width: 60px; flex-shrink: 0; }
.ed-range-row input[type="range"] { flex: 1; accent-color: #ff6d00; }
.ed-range-val { font-size: 11px; color: #ff6d00; font-weight: 700; min-width: 28px; text-align: right; }
.ed-text-input { flex: 1; padding: 5px 8px; background: #1e1e35; border: 1px solid #2a2a40; border-radius: 5px; color: #ccc; font-size: 12px; font-family: inherit; }

.ed-check-row {
  display: flex; align-items: center; gap: 8px; margin-bottom: 8px;
  font-size: 12px; color: #999; cursor: pointer;
}
.ed-check-row input { accent-color: #ff6d00; }
.ed-hint { font-size: 10px; color: #555; margin-top: 4px; }
.ed-paste-hint {
  font-size: 10px; color: #555; margin-top: 6px; padding: 6px 8px;
  background: rgba(255,255,255,0.03); border-radius: 4px; text-align: center;
}
.ed-delete-btn {
  display: flex; align-items: center; gap: 6px; width: 100%;
  padding: 8px 12px; background: rgba(220,50,50,0.1); border: 1px solid rgba(220,50,50,0.3);
  border-radius: 6px; color: #e55; font-size: 12px; cursor: pointer; margin-top: 8px;
}
.ed-delete-btn:hover { background: rgba(220,50,50,0.2); }

/* Canvas area */
.ed-canvas-area {
  flex: 1; display: flex; flex-direction: column; align-items: center;
  justify-content: flex-start; padding: 40px 20px; overflow: auto;
}

/* Device toolbar */
.ed-device-bar {
  display: flex; align-items: center; gap: 12px; justify-content: center;
  margin-bottom: 12px; padding: 6px 14px;
  background: #1e1e35; border: 1px solid #2a2a40; border-radius: 8px;
}
.ed-device-select {
  padding: 4px 8px; background: #16162a; border: 1px solid #3a3a50;
  border-radius: 6px; color: #ccc; font-size: 12px; font-weight: 600; cursor: pointer;
}
.ed-device-dims { font-size: 12px; color: #888; font-weight: 500; font-variant-numeric: tabular-nums; }
.ed-device-zoom {
  font-size: 11px; color: #ff6d00; font-weight: 700;
  padding: 2px 8px; background: rgba(255,109,0,0.1); border-radius: 4px;
}

/* Canvas scaler (layout box for CSS-scaled canvas) */
.ed-canvas-scaler {
  position: relative; overflow: visible;
  border-radius: 8px;
  box-shadow: 0 0 0 1px rgba(255,255,255,0.08), 0 20px 60px rgba(0,0,0,0.5);
}

/* Mobile frame */
.ed-canvas-mobile-frame {
  border-radius: 0;
  box-shadow: -1px 0 0 #2a2a40, 1px 0 0 #2a2a40;
  outline: 2px solid rgba(255,109,0,0.3); outline-offset: -2px;
}

/* Fabric wrapper inside scaler */
.ed-fabric-wrap {
  position: relative;
}

/* Fabric canvas gets sized by fabric.Canvas, this wraps it */
.ed-fabric-wrap :deep(canvas) {
  display: block;
}
.ed-fabric-wrap :deep(.canvas-container) {
  border-radius: 8px;
}
.ed-canvas-mobile-frame .ed-fabric-wrap :deep(.canvas-container) {
  border-radius: 0;
}

/* Phone mockup */
.phone-mockup {
  background: #fff; border-radius: 24px 24px 0 0;
  overflow: hidden; margin: 0 auto;
  box-shadow: -1px 0 0 #2a2a40, 1px 0 0 #2a2a40, 0 -1px 0 #2a2a40;
}
.phone-status-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 16px 4px; font-size: 12px; font-weight: 600; color: #1a1a1a;
  background: #f8f8f8;
}
.phone-notch-pill {
  width: 80px; height: 22px; background: #1a1a1a; border-radius: 12px;
}
.phone-status-icons { display: flex; gap: 4px; color: #1a1a1a; }
.phone-fake-header {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 12px; background: #fff; border-bottom: 1px solid #eee;
}
.pfh-back { font-size: 22px; color: #1a5632; font-weight: 300; line-height: 1; }
.pfh-logo { font-size: 18px; }
.pfh-search {
  flex: 1; height: 30px; background: #f0f0f0; border-radius: 16px;
  border: 1px solid #ddd;
}

/* Fake content below banner */
.phone-fake-content {
  background: #fff; padding: 16px;
  margin: 0 auto;
  box-shadow: -1px 0 0 #2a2a40, 1px 0 0 #2a2a40;
  border-radius: 0 0 24px 24px;
  overflow: hidden;
}
.pfc-title {
  font-size: 14px; font-weight: 700; color: #333; margin-bottom: 10px;
}
.pfc-title span {
  font-size: 11px; font-weight: 500; color: #999;
  background: #f0f0f0; padding: 2px 8px; border-radius: 10px; margin-left: 6px;
}
.pfc-cards { display: flex; gap: 8px; }
.pfc-card {
  width: 33.33%; aspect-ratio: 0.8; background: #f0f0f0; border-radius: 8px;
}
.phone-home-bar {
  display: flex; justify-content: center; padding: 12px 0 4px;
}
.phone-home-pill {
  width: 100px; height: 4px; background: #ccc; border-radius: 2px;
}
.ed-copy-desktop { color: #ff6d00 !important; border-color: #ff6d00 !important; gap: 5px; }
.ed-copy-desktop:hover { background: rgba(255,109,0,0.15); }

.ed-image-actions { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
.ed-image-actions .ed-add-btn { font-size: 11px; padding: 7px 10px; }

/* Height resize handle */
.height-handle {
  width: 200px; height: 20px; cursor: ns-resize;
  display: flex; align-items: center; justify-content: center;
  margin-top: 4px;
}
.height-handle-pill {
  width: 60px; height: 6px; background: #3a3a50; border-radius: 3px;
  transition: background 0.15s;
}
.height-handle:hover .height-handle-pill { background: #ff6d00; }
.height-label { font-size: 11px; color: #555; margin-top: 4px; }

/* Mobile adjustments */
@media (max-width: 768px) {
  .ed-sidebar { width: 180px; padding: 12px; }
  .ed-canvas-area { padding: 16px 8px; }
}
</style>
