<script setup lang="ts">
import type { BEl, Slide, BannerConfig } from './PromoBanner.vue'

const props = defineProps<{ config: BannerConfig; page: string }>()
const emit = defineEmits<{ save: [BannerConfig]; close: [] }>()

function imgUrl(f: string) { return `/banner/${f}` }
let uid = 0
function genId() { return 'el_' + Date.now() + '_' + (uid++) }

// ── State ───────────────────────────────────
const editConfig = ref<BannerConfig>(JSON.parse(JSON.stringify(props.config)))
const editVariant = ref<'desktop' | 'mobile'>('desktop')
const mobileConfig = ref<BannerConfig | null>(null)
const desktopConfigCache = ref<BannerConfig | null>(null)
const current = ref(0)
const selectedId = ref('')
const saving = ref(false)
const saveError = ref('')
const bgFile = ref<File | null>(null)
const bgFileSlideIndex = ref(-1)
let renderGeneration = 0

const editSlide = computed(() => editConfig.value.slides[current.value] || null)
const selectedEl = computed(() => editSlide.value?.elements.find(e => e.id === selectedId.value) || null)

// Canvas area measurement
const canvasAreaRef = ref<HTMLElement>()
const canvasAreaWidth = ref(800)
let canvasAreaObs: ResizeObserver | null = null

const editorScale = computed(() => {
  const available = canvasAreaWidth.value - 80
  return Math.min(1, Math.max(0.3, available / editConfig.value.designWidth))
})

// Device presets
const DEVICES = [
  { name: 'iPhone SE', w: 375, h: 200 },
  { name: 'iPhone 14', w: 390, h: 210 },
  { name: 'iPhone 14 Pro Max', w: 430, h: 220 },
  { name: 'Galaxy S24', w: 412, h: 215 },
  { name: 'Pixel 8', w: 393, h: 210 },
] as const
const selectedDevice = ref(0)

// ── Fabric ──────────────────────────────────
const FABRIC_CTRL = {
  cornerColor: '#4A90D9', cornerStrokeColor: '#fff', cornerSize: 8,
  transparentCorners: false, borderColor: '#4A90D9', borderDashArray: [4, 4],
}

const fabricCanvasRef = ref<HTMLCanvasElement>()
let fabricCanvas: any = null
let fabricModule: typeof import('fabric') | null = null
let suppressFabricSync = false

async function ensureFabric() {
  if (!fabricModule) fabricModule = await import('fabric')
  return fabricModule
}

function disposeFabric() {
  if (fabricCanvas) { fabricCanvas.dispose(); fabricCanvas = null }
}

async function waitForRef(ref: { value: any }, maxWait = 500): Promise<boolean> {
  if (ref.value) return true
  const start = Date.now()
  while (!ref.value && Date.now() - start < maxWait) {
    await nextTick()
  }
  return !!ref.value
}

async function initFabricCanvas() {
  if (!process.client) return
  const fabric = await ensureFabric()
  disposeFabric()

  if (!await waitForRef(fabricCanvasRef)) return
  const el = fabricCanvasRef.value!
  const dw = editConfig.value.designWidth
  const ch = editConfig.value.canvasHeight

  fabricCanvas = new fabric.Canvas(el, {
    width: dw, height: ch,
    selection: true, preserveObjectStacking: true, backgroundColor: 'transparent',
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
  if (obj?.data?.belId) selectedId.value = obj.data.belId
}

function onFabricModified(e: any) {
  const obj = e.target
  if (!obj?.data?.belId || !editSlide.value) return
  const el = editSlide.value.elements.find(b => b.id === obj.data.belId)
  if (!el) return
  const dw = editConfig.value.designWidth

  if (el.type === 'image' || el.type === 'shape') {
    el.x = (obj.left / dw) * 100
    el.y = obj.top
    el.width = Math.round(obj.getScaledWidth())
    el.height = Math.round(obj.getScaledHeight())
    if (el.type === 'shape') {
      obj.set({ width: el.width, height: el.height, scaleX: 1, scaleY: 1 })
      obj.setCoords()
    }
  } else if (el.type === 'button') {
    el.x = (obj.left / dw) * 100
    el.y = obj.top
    const scale = obj.scaleX || 1
    el.fontSize = Math.round((el.fontSize || 14) * scale)
    obj.scaleX = 1; obj.scaleY = 1
  } else {
    el.x = (obj.left / dw) * 100
    el.y = obj.top
    el.fontSize = Math.round(obj.fontSize * (obj.scaleX || 1))
    obj.scaleX = 1; obj.scaleY = 1
    obj.set('fontSize', el.fontSize)
    obj.setCoords()
  }
}

function onFabricTextChanged(e: any) {
  const obj = e.target
  if (!obj?.data?.belId || !editSlide.value) return
  const el = editSlide.value.elements.find(b => b.id === obj.data.belId)
  if (el) el.content = obj.text || ''
}

async function renderSlideToCanvas() {
  if (!fabricCanvas || !editSlide.value) return
  const gen = ++renderGeneration
  const fabric = await ensureFabric()
  const dw = editConfig.value.designWidth
  const ch = editConfig.value.canvasHeight
  const slide = editSlide.value

  suppressFabricSync = true
  fabricCanvas.clear()
  fabricCanvas.setDimensions({ width: dw, height: ch })

  // Background
  if (slide.bgType === 'gradient') {
    fabricCanvas.backgroundColor = new fabric.Gradient({
      type: 'linear', coords: { x1: 0, y1: 0, x2: dw, y2: ch },
      colorStops: [{ offset: 0, color: slide.bgColor1 }, { offset: 1, color: slide.bgColor2 }],
    }) as any
  } else if (slide.bgType === 'color') {
    fabricCanvas.backgroundColor = slide.bgColor1
  } else if (slide.bgType === 'image' && slide.bgImage) {
    const src = slide.bgImage.startsWith('data:') ? slide.bgImage : imgUrl(slide.bgImage)
    try {
      const img = await fabric.FabricImage.fromURL(src, { crossOrigin: 'anonymous' })
      if (gen !== renderGeneration) return // stale
      const fit = slide.bgFit || 'cover'
      if (fit === 'cover') {
        img.scale(Math.max(dw / img.width!, ch / img.height!))
      } else if (fit === 'contain') {
        img.scale(Math.min(dw / img.width!, ch / img.height!))
      } else {
        img.set({ scaleX: dw / img.width!, scaleY: ch / img.height! })
      }
      img.set({ left: dw / 2, top: ch / 2, originX: 'center', originY: 'center', selectable: false, evented: false })
      fabricCanvas.add(img)
      fabricCanvas.sendObjectToBack(img)
      if (slide.overlay > 0) {
        fabricCanvas.add(new fabric.Rect({ left: 0, top: 0, width: dw, height: ch, fill: `rgba(0,0,0,${slide.overlay})`, selectable: false, evented: false }))
      }
    } catch {
      fabricCanvas.backgroundColor = '#333'
    }
  }
  if (gen !== renderGeneration) return

  // Elements
  const sorted = [...slide.elements].sort((a, b) => a.zIndex - b.zIndex)
  for (const el of sorted) {
    if (gen !== renderGeneration) return
    const left = (el.x / 100) * dw
    const top = el.y

    if (el.type === 'shape') {
      fabricCanvas.add(new fabric.Rect({
        left, top, width: el.width || 200, height: el.height || 100,
        fill: el.color || '#ffffff', opacity: el.opacity ?? 0.5,
        rx: el.borderRadius || 0, ry: el.borderRadius || 0,
        data: { belId: el.id, belType: el.type }, ...FABRIC_CTRL,
      }))
    } else if (el.type === 'image' && el.content) {
      const src = el.content.startsWith('data:') || el.content.startsWith('http') ? el.content : imgUrl(el.content)
      try {
        const img = await fabric.FabricImage.fromURL(src, { crossOrigin: 'anonymous' })
        if (gen !== renderGeneration) return
        img.scaleToWidth(el.width || 200)
        if (el.height) img.scaleToHeight(el.height)
        img.set({ left, top, data: { belId: el.id, belType: el.type }, ...FABRIC_CTRL })
        fabricCanvas.add(img)
      } catch {}
    } else if (el.type === 'button') {
      const padH = 28, padV = 11
      const textObj = new fabric.Textbox(el.content || 'Button', {
        fontSize: el.fontSize, fontWeight: String(el.fontWeight), fill: el.color,
        fontFamily: 'inherit', charSpacing: el.letterSpacing * 1000 / (el.fontSize || 14),
        editable: true, textAlign: 'center', splitByGrapheme: false,
      })
      const bgRect = new fabric.Rect({
        width: (textObj.width || 80) + padH * 2, height: (textObj.height || 20) + padV * 2,
        rx: 24, ry: 24, fill: 'rgba(255,255,255,0.95)', originX: 'center', originY: 'center',
      })
      textObj.set({ originX: 'center', originY: 'center' })
      const group = new fabric.Group([bgRect, textObj], {
        left, top, data: { belId: el.id, belType: el.type }, subTargetCheck: true, ...FABRIC_CTRL,
      })
      if (el.shadow) group.shadow = new fabric.Shadow({ color: 'rgba(0,0,0,0.3)', blur: 10, offsetX: 0, offsetY: 2 })
      fabricCanvas.add(group)
    } else {
      const tb = new fabric.Textbox(el.content || '', {
        left, top, fontSize: el.fontSize, fontWeight: String(el.fontWeight), fill: el.color,
        fontFamily: 'inherit', charSpacing: el.letterSpacing * 1000 / (el.fontSize || 16),
        width: Math.min(dw * 0.9, 600), editable: true, splitByGrapheme: false,
        data: { belId: el.id, belType: el.type }, ...FABRIC_CTRL,
      })
      if (el.shadow) tb.shadow = new fabric.Shadow({ color: 'rgba(0,0,0,0.3)', blur: 10, offsetX: 0, offsetY: 2 })
      fabricCanvas.add(tb)
    }
  }

  fabricCanvas.renderAll()
  suppressFabricSync = false
}

function syncElToFabric(el: BEl) {
  if (!fabricCanvas || suppressFabricSync) return
  const obj = fabricCanvas.getObjects().find((o: any) => o.data?.belId === el.id)
  if (!obj) return
  const dw = editConfig.value.designWidth
  obj.set({ left: (el.x / 100) * dw, top: el.y })

  if (el.type === 'shape') {
    obj.set({ fill: el.color, opacity: el.opacity ?? 0.5, rx: el.borderRadius || 0, ry: el.borderRadius || 0, width: el.width || 200, height: el.height || 100 } as any)
    obj.setCoords()
  } else if (el.type === 'image') {
    if ('scaleToWidth' in obj) { (obj as any).scaleToWidth(el.width || 200); if (el.height) (obj as any).scaleToHeight(el.height) }
  } else if (el.type === 'button') {
    renderSlideToCanvas(); return
  } else {
    obj.set({ fontSize: el.fontSize, fontWeight: String(el.fontWeight), fill: el.color, charSpacing: el.letterSpacing * 1000 / (el.fontSize || 16) })
    obj.shadow = el.shadow && fabricModule ? new fabricModule.Shadow({ color: 'rgba(0,0,0,0.3)', blur: 10, offsetX: 0, offsetY: 2 }) : null
    obj.setCoords()
  }
  fabricCanvas.renderAll()
}

function syncFabricToAllEls() {
  if (!fabricCanvas || !editSlide.value) return
  const dw = editConfig.value.designWidth
  for (const obj of fabricCanvas.getObjects()) {
    const d = (obj as any).data
    if (!d?.belId) continue
    const el = editSlide.value.elements.find(b => b.id === d.belId)
    if (!el) continue
    el.x = (obj.left! / dw) * 100
    el.y = obj.top!
    if (el.type === 'image' || el.type === 'shape') {
      el.width = Math.round(obj.getScaledWidth())
      el.height = Math.round(obj.getScaledHeight())
    } else if (el.type !== 'button') {
      el.content = (obj as any).text || ''
      el.fontSize = Math.round(((obj as any).fontSize || 16) * ((obj as any).scaleX || 1))
    }
  }
}

// Watch selected element to sync fabric selection
watch(selectedEl, (el) => {
  if (!el || !fabricCanvas) return
  const obj = fabricCanvas.getObjects().find((o: any) => o.data?.belId === el.id)
  if (obj && fabricCanvas.getActiveObject() !== obj) {
    fabricCanvas.setActiveObject(obj)
    fabricCanvas.renderAll()
  }
}, { flush: 'post' })

// ── Mount / unmount ─────────────────────────
onMounted(async () => {
  // Load mobile config
  try {
    const mRaw = await $fetch<any>(`/api/banner?page=${props.page}-mobile&_=${Date.now()}`)
    if (mRaw?.enabled || mRaw?.slides?.length) {
      mobileConfig.value = migrate(mRaw)
    }
  } catch {}

  window.addEventListener('keydown', onKey)

  await nextTick()
  if (canvasAreaRef.value) {
    canvasAreaWidth.value = canvasAreaRef.value.clientWidth
    canvasAreaObs = new ResizeObserver(() => {
      if (canvasAreaRef.value) canvasAreaWidth.value = canvasAreaRef.value.clientWidth
    })
    canvasAreaObs.observe(canvasAreaRef.value)
  }
  await initFabricCanvas()

  // Prevent body scroll
  document.body.style.overflow = 'hidden'
})

onUnmounted(() => {
  disposeFabric()
  window.removeEventListener('keydown', onKey)
  canvasAreaObs?.disconnect()
  document.body.style.overflow = ''
})

// Migration helper (same as parent)
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
  return { enabled: raw.enabled !== false, interval: raw.interval || 6000, canvasHeight: raw.canvasHeight || 280, designWidth: raw.designWidth || 960, slides }
}

// ── Variants ────────────────────────────────
async function switchVariant(variant: 'desktop' | 'mobile') {
  if (variant === editVariant.value) return
  syncFabricToAllEls()
  if (editVariant.value === 'desktop') {
    desktopConfigCache.value = JSON.parse(JSON.stringify(editConfig.value))
  } else {
    mobileConfig.value = JSON.parse(JSON.stringify(editConfig.value))
  }
  bgFile.value = null; bgFileSlideIndex.value = -1
  editVariant.value = variant; selectedId.value = ''; current.value = 0

  if (variant === 'mobile') {
    editConfig.value = mobileConfig.value
      ? JSON.parse(JSON.stringify(mobileConfig.value))
      : { enabled: true, interval: 6000, canvasHeight: 200, designWidth: 375, slides: [{ bgType: 'gradient', bgColor1: '#1a5632', bgColor2: '#2d8b4e', bgImage: '', overlay: 0.4, elements: [{ id: genId(), type: 'heading' as const, x: 5, y: 30, content: 'Заголовок', fontSize: 24, fontWeight: 800, color: '#ffffff', letterSpacing: 0, zIndex: 3, shadow: false }] }] }
  } else {
    editConfig.value = desktopConfigCache.value
      ? JSON.parse(JSON.stringify(desktopConfigCache.value))
      : JSON.parse(JSON.stringify(props.config))
  }
  await nextTick()
  await initFabricCanvas()
}

function applyDevicePreset(idx: number) {
  selectedDevice.value = idx
  editConfig.value.designWidth = DEVICES[idx].w
  editConfig.value.canvasHeight = DEVICES[idx].h
  nextTick(() => renderSlideToCanvas())
}

function copyDesktopToMobile() {
  const src = desktopConfigCache.value || props.config
  if (!src) return
  const copy: BannerConfig = JSON.parse(JSON.stringify(src))
  copy.designWidth = DEVICES[selectedDevice.value].w
  copy.canvasHeight = DEVICES[selectedDevice.value].h
  for (const slide of copy.slides) {
    for (const el of slide.elements) {
      el.id = genId()
      if (el.type === 'image') { el.width = Math.round((el.width || 200) * 0.4) }
      else { el.fontSize = Math.max(12, Math.round(el.fontSize * 0.65)) }
    }
  }
  editConfig.value = copy
  mobileConfig.value = JSON.parse(JSON.stringify(copy))
  nextTick(() => renderSlideToCanvas())
}

// ── Slide management ────────────────────────
function addSlide() {
  syncFabricToAllEls()
  editConfig.value.slides.push({
    bgType: 'gradient', bgColor1: '#1a5632', bgColor2: '#2d8b4e', bgImage: '', overlay: 0.4,
    elements: [
      { id: genId(), type: 'heading', x: 5, y: 40, content: 'Новый заголовок', fontSize: 32, fontWeight: 800, color: '#ffffff', letterSpacing: 0, zIndex: 3 },
      { id: genId(), type: 'subheading', x: 5, y: 90, content: 'Подзаголовок', fontSize: 16, fontWeight: 400, color: '#ffffff', letterSpacing: 0, zIndex: 2 },
    ],
  })
  current.value = editConfig.value.slides.length - 1; selectedId.value = ''
  nextTick(() => renderSlideToCanvas())
}

function duplicateSlide() {
  if (!editSlide.value) return
  syncFabricToAllEls()
  const copy = JSON.parse(JSON.stringify(editSlide.value))
  copy.elements.forEach((el: BEl) => { el.id = genId() })
  editConfig.value.slides.push(copy)
  current.value = editConfig.value.slides.length - 1; selectedId.value = ''
  nextTick(() => renderSlideToCanvas())
}

function deleteCurrentSlide() {
  if (editConfig.value.slides.length <= 1) {
    // Last slide — clear all slides (banner will be hidden)
    if (!confirm('Удалить последний слайд? Баннер исчезнет со страницы.')) return
    editConfig.value.slides = []
    current.value = 0; selectedId.value = ''
    return
  }
  editConfig.value.slides.splice(current.value, 1)
  current.value = Math.min(current.value, editConfig.value.slides.length - 1); selectedId.value = ''
  nextTick(() => renderSlideToCanvas())
}

// ── Elements ────────────────────────────────
function addElement(type: BEl['type']) {
  if (!editSlide.value) return
  const h = editConfig.value.canvasHeight
  const el: BEl = {
    id: genId(), type, x: 5, y: Math.max(10, Math.min(h - 50, 20 + editSlide.value.elements.length * 30)),
    content: type === 'heading' ? 'Заголовок' : type === 'subheading' ? 'Подзаголовок' : type === 'button' ? 'Кнопка' : '',
    link: type === 'button' ? '/catalog' : undefined,
    fontSize: type === 'heading' ? 32 : type === 'subheading' ? 16 : 14,
    fontWeight: type === 'heading' ? 800 : type === 'button' ? 700 : 400,
    color: type === 'button' ? '#1a5632' : type === 'shape' ? '#ffffff' : '#ffffff',
    letterSpacing: 0, zIndex: editSlide.value.elements.length + 1, shadow: false,
    width: type === 'image' ? 200 : type === 'shape' ? 200 : undefined,
    height: type === 'shape' ? 100 : undefined,
    opacity: type === 'shape' ? 0.5 : undefined,
    borderRadius: type === 'shape' ? 0 : undefined,
  }
  editSlide.value.elements.push(el)
  selectedId.value = el.id
  nextTick(() => renderSlideToCanvas())
}

async function uploadElementImage(file: File): Promise<string | null> {
  const fd = new FormData(); fd.append('file', file)
  try { return (await $fetch<any>('/api/banner-upload', { method: 'POST', body: fd })).filename || null } catch { return null }
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
    editSlide.value.elements[editSlide.value.elements.length - 1].content = filename
    nextTick(() => renderSlideToCanvas())
  }
  input.click()
}

async function onCanvasPaste(e: ClipboardEvent) {
  if (!editSlide.value) return
  for (const item of e.clipboardData?.items || []) {
    if (item.type.startsWith('image/')) {
      e.preventDefault()
      const blob = item.getAsFile()
      if (!blob) continue
      const filename = await uploadElementImage(blob)
      if (!filename) continue
      addElement('image')
      editSlide.value.elements[editSlide.value.elements.length - 1].content = filename
      nextTick(() => renderSlideToCanvas())
      return
    }
  }
}

function duplicateSelected() {
  if (!editSlide.value || !selectedEl.value) return
  const copy: BEl = JSON.parse(JSON.stringify(selectedEl.value))
  copy.id = genId(); copy.x += 3; copy.y += 20
  editSlide.value.elements.push(copy)
  selectedId.value = copy.id
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

function updateEl(field: keyof BEl, value: any) {
  if (selectedEl.value) {
    (selectedEl.value as any)[field] = value
    syncElToFabric(selectedEl.value)
  }
}

function stretchImageToFill(el: BEl) {
  el.width = editConfig.value.designWidth; el.height = editConfig.value.canvasHeight; el.x = 0; el.y = 0
  nextTick(() => renderSlideToCanvas())
}

function resetImageHeight(el: BEl) {
  el.height = undefined
  nextTick(() => renderSlideToCanvas())
}

// ── Background ──────────────────────────────
function onBgFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f || !editSlide.value) return
  bgFile.value = f; bgFileSlideIndex.value = current.value
  editSlide.value.bgType = 'image'
  const reader = new FileReader()
  reader.onload = () => { if (editSlide.value) { editSlide.value.bgImage = reader.result as string; nextTick(() => renderSlideToCanvas()) } }
  reader.readAsDataURL(f)
}

// ── Height drag ─────────────────────────────
function onHeightDragStart(e: MouseEvent | TouchEvent) {
  e.preventDefault()
  const startY = 'touches' in e ? e.touches[0].clientY : e.clientY
  const startH = editConfig.value.canvasHeight
  const lowestY = editSlide.value?.elements.reduce((max, el) => Math.max(max, el.y + el.fontSize + 20), 100) || 100
  const onMove = (ev: MouseEvent | TouchEvent) => {
    ev.preventDefault()
    const my = 'touches' in ev ? ev.touches[0].clientY : ev.clientY
    editConfig.value.canvasHeight = Math.max(lowestY, startH + (my - startY) / editorScale.value)
    if (fabricCanvas) { fabricCanvas.setDimensions({ width: editConfig.value.designWidth, height: editConfig.value.canvasHeight }); fabricCanvas.renderAll() }
  }
  const onUp = () => {
    document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp)
    document.removeEventListener('touchmove', onMove); document.removeEventListener('touchend', onUp)
    nextTick(() => renderSlideToCanvas())
  }
  document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  document.addEventListener('touchmove', onMove, { passive: false }); document.addEventListener('touchend', onUp)
}

// ── Keyboard ────────────────────────────────
function onKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveEdit(); return }
  if ((e.ctrlKey || e.metaKey) && e.key === 'd' && selectedId.value) { e.preventDefault(); duplicateSelected(); return }
  if (e.key === 'Escape') {
    if (fabricCanvas) {
      const ao = fabricCanvas.getActiveObject()
      if (ao?.isEditing) { ao.exitEditing(); return }
      fabricCanvas.discardActiveObject()
    }
    selectedId.value = ''; return
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId.value) {
    if (fabricCanvas?.getActiveObject()?.isEditing) return
    const tag = document.activeElement?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    deleteSelectedEl(); return
  }
  if (selectedId.value && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    const tag = document.activeElement?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    if (fabricCanvas?.getActiveObject()?.isEditing) return
    e.preventDefault()
    const el = selectedEl.value
    if (!el) return
    const step = e.shiftKey ? 10 : 1
    const dw = editConfig.value.designWidth
    if (e.key === 'ArrowUp') el.y -= step
    if (e.key === 'ArrowDown') el.y += step
    if (e.key === 'ArrowLeft') el.x -= (step / dw) * 100
    if (e.key === 'ArrowRight') el.x += (step / dw) * 100
    syncElToFabric(el)
  }
}

// ── Save ────────────────────────────────────
async function saveEdit() {
  syncFabricToAllEls()
  saving.value = true; saveError.value = ''
  try {
    const configToSave = JSON.parse(JSON.stringify(editConfig.value))
    for (const slide of configToSave.slides) {
      if (slide.bgImage?.startsWith('data:')) slide.bgImage = ''
    }
    const savePage = editVariant.value === 'mobile' ? `${props.page}-mobile` : props.page
    const fd = new FormData()
    fd.append('action', 'saveCanvas'); fd.append('page', savePage); fd.append('config', JSON.stringify(configToSave))
    if (bgFile.value) { fd.append('bgImageFile', bgFile.value); fd.append('uploadSlideIndex', String(bgFileSlideIndex.value)) }
    const res = await $fetch<any>('/api/banner', { method: 'POST', body: fd })

    // Save other variant if edited
    const otherCache = editVariant.value === 'mobile' ? desktopConfigCache.value : mobileConfig.value
    if (otherCache) {
      const otherPage = editVariant.value === 'mobile' ? props.page : `${props.page}-mobile`
      const otherConfig = JSON.parse(JSON.stringify(otherCache))
      for (const slide of otherConfig.slides) { if (slide.bgImage?.startsWith('data:')) slide.bgImage = '' }
      const fd2 = new FormData()
      fd2.append('action', 'saveCanvas'); fd2.append('page', otherPage); fd2.append('config', JSON.stringify(otherConfig))
      await $fetch<any>('/api/banner', { method: 'POST', body: fd2 })
    }

    emit('save', res.config ? migrate(res.config) : configToSave)
  } catch (err: any) {
    const status = err?.statusCode || err?.status
    saveError.value = status === 401 || status === 403 ? 'Нет авторизации' : 'Ошибка сохранения'
  } finally { saving.value = false }
}

// ── Watchers ────────────────────────────────
watch(current, () => { selectedId.value = ''; nextTick(() => renderSlideToCanvas()) })
watch(() => editSlide.value ? [editSlide.value.bgType, editSlide.value.bgColor1, editSlide.value.bgColor2, editSlide.value.overlay] : null, () => {
  nextTick(() => renderSlideToCanvas())
}, { deep: true })
</script>

<template>
  <Teleport to="body">
    <div class="editor-overlay" @paste="onCanvasPaste">
      <!-- ── Top Toolbar ── -->
      <header class="toolbar">
        <div class="toolbar-left">
          <button class="icon-btn close-btn" @click="emit('close')" title="Закрыть">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
          <span class="toolbar-title">Banner Editor</span>
        </div>

        <div class="toolbar-center">
          <!-- Variant toggle -->
          <div class="variant-toggle">
            <button :class="['variant-btn', { active: editVariant === 'desktop' }]" @click="switchVariant('desktop')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
              Desktop
            </button>
            <button :class="['variant-btn', { active: editVariant === 'mobile' }]" @click="switchVariant('mobile')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
              Mobile
            </button>
          </div>

          <!-- Slides -->
          <div class="slides-row">
            <button v-for="(_, i) in editConfig.slides" :key="i" :class="['slide-btn', { active: current === i }]" @click="syncFabricToAllEls(); current = i; selectedId = ''">
              {{ i + 1 }}
            </button>
            <button class="slide-btn slide-add" @click="addSlide" title="Добавить слайд">+</button>
            <button class="slide-action" @click="deleteCurrentSlide" title="Удалить">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </button>
            <button class="slide-action" @click="duplicateSlide" title="Дублировать">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            </button>
          </div>
        </div>

        <div class="toolbar-right">
          <span v-if="saveError" class="save-error">{{ saveError }}</span>
          <button class="btn btn-ghost" @click="emit('close')">Отмена</button>
          <button class="btn btn-save" :disabled="saving" @click="saveEdit">{{ saving ? 'Сохранение...' : 'Сохранить' }}</button>
        </div>
      </header>

      <!-- ── Workspace ── -->
      <div class="workspace">
        <!-- ── Left: Add elements panel ── -->
        <aside class="panel-left">
          <div class="panel-section">
            <div class="section-title">Элементы</div>
            <button class="add-btn" @click="addElement('heading')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M4 12h8m-4-4v8M20 7v10"/></svg>
              Заголовок
            </button>
            <button class="add-btn" @click="addElement('subheading')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M4 7h16M4 12h10M4 17h14"/></svg>
              Подзаголовок
            </button>
            <button class="add-btn" @click="addElement('button')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="3" y="8" width="18" height="8" rx="4"/></svg>
              Кнопка
            </button>
            <button class="add-btn" @click="addImageFromFile">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
              Картинка
            </button>
            <button class="add-btn" @click="addElement('shape')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
              Фигура
            </button>
          </div>

          <!-- Mobile tools -->
          <template v-if="editVariant === 'mobile'">
            <div class="panel-section">
              <div class="section-title">Устройство</div>
              <select class="prop-select" :value="selectedDevice" @change="applyDevicePreset(+($event.target as any).value)">
                <option v-for="(d, i) in DEVICES" :key="i" :value="i">{{ d.name }}</option>
              </select>
              <button class="add-btn" @click="copyDesktopToMobile">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                Скопировать с десктопа
              </button>
            </div>
          </template>

          <!-- Shortcuts -->
          <div class="panel-section shortcuts">
            <div class="section-title">Горячие клавиши</div>
            <div class="shortcut"><kbd>Ctrl+S</kbd> Сохранить</div>
            <div class="shortcut"><kbd>Ctrl+D</kbd> Дублировать</div>
            <div class="shortcut"><kbd>Del</kbd> Удалить</div>
            <div class="shortcut"><kbd>Ctrl+V</kbd> Вставить картинку</div>
          </div>
        </aside>

        <!-- ── Center: Canvas ── -->
        <main ref="canvasAreaRef" class="canvas-area">
          <!-- Empty state when all slides deleted -->
          <div v-if="editConfig.slides.length === 0" class="canvas-empty">
            <p>Все слайды удалены. Баннер не будет отображаться.</p>
            <button class="btn btn-save" @click="addSlide">Добавить слайд</button>
            <p style="margin-top: 12px; font-size: 12px; color: #999;">Или нажмите «Сохранить» чтобы скрыть баннер.</p>
          </div>
          <template v-else>
          <div class="canvas-info">
            <span class="dims">{{ editVariant === 'desktop' ? 'Desktop' : 'Mobile' }} &mdash; {{ editConfig.designWidth }} &times; {{ Math.round(editConfig.canvasHeight) }}</span>
            <span class="zoom">{{ Math.round(editorScale * 100) }}%</span>
          </div>

          <!-- Phone mockup for mobile -->
          <div v-if="editVariant === 'mobile'" class="phone-mockup" :style="{ width: editConfig.designWidth * editorScale + 'px' }">
            <div class="phone-status-bar">
              <span>9:41</span>
              <span class="phone-notch" />
              <span class="phone-icons">
                <svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11"><path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"/></svg>
              </span>
            </div>
            <div class="phone-header">
              <div class="pfh-back">&#8249;</div>
              <div class="pfh-logo">&#127794;</div>
              <div class="pfh-search" />
            </div>
          </div>

          <!-- Fabric canvas -->
          <div
            class="canvas-wrapper"
            :class="{ 'canvas-mobile': editVariant === 'mobile' }"
            :style="{ width: editConfig.designWidth * editorScale + 'px', height: editConfig.canvasHeight * editorScale + 'px' }"
          >
            <div class="fabric-inner" :style="{ transform: `scale(${editorScale})`, transformOrigin: 'top left', width: editConfig.designWidth + 'px', height: editConfig.canvasHeight + 'px' }">
              <canvas ref="fabricCanvasRef" />
            </div>
          </div>

          <!-- Fake content below mobile banner -->
          <div v-if="editVariant === 'mobile'" class="phone-content" :style="{ width: editConfig.designWidth * editorScale + 'px' }">
            <div class="pfc-title">Растения сада <span>152</span></div>
            <div class="pfc-cards"><div class="pfc-card" /><div class="pfc-card" /><div class="pfc-card" /></div>
            <div class="phone-home-bar"><div class="phone-home-pill" /></div>
          </div>

          <!-- Height handle -->
          <div class="height-handle" @mousedown="onHeightDragStart" @touchstart.prevent="onHeightDragStart">
            <div class="height-pill" />
          </div>
          <div class="height-label">{{ Math.round(editConfig.canvasHeight) }}px</div>
          </template>
        </main>

        <!-- ── Right: Properties panel ── -->
        <aside class="panel-right">
          <!-- Canvas/BG properties (no selection) -->
          <template v-if="!selectedEl">
            <div class="panel-section">
              <div class="section-title">Холст</div>
              <div class="prop-row">
                <label class="prop-label">Ширина</label>
                <input type="number" class="prop-input" :value="editConfig.designWidth" @input="editConfig.designWidth = +($event.target as any).value; if (fabricCanvas) { fabricCanvas.setDimensions({ width: editConfig.designWidth, height: editConfig.canvasHeight }); nextTick(() => renderSlideToCanvas()) }">
              </div>
              <div class="prop-row">
                <label class="prop-label">Высота</label>
                <input type="number" class="prop-input" :value="Math.round(editConfig.canvasHeight)" @input="editConfig.canvasHeight = +($event.target as any).value; if (fabricCanvas) { fabricCanvas.setDimensions({ width: editConfig.designWidth, height: editConfig.canvasHeight }); nextTick(() => renderSlideToCanvas()) }">
              </div>
            </div>

            <div v-if="editSlide" class="panel-section">
              <div class="section-title">Фон</div>
              <select v-model="editSlide.bgType" class="prop-select">
                <option value="gradient">Градиент</option>
                <option value="color">Цвет</option>
                <option value="image">Картинка</option>
              </select>
              <div v-if="editSlide.bgType !== 'image'" class="color-row">
                <div class="color-field"><label class="prop-label">Цвет 1</label><input type="color" v-model="editSlide.bgColor1" class="color-pick"></div>
                <div v-if="editSlide.bgType === 'gradient'" class="color-field"><label class="prop-label">Цвет 2</label><input type="color" v-model="editSlide.bgColor2" class="color-pick"></div>
              </div>
              <template v-else>
                <input type="file" accept="image/*" @change="onBgFile" class="file-input">
                <div class="prop-row">
                  <label class="prop-label">Режим</label>
                  <select class="prop-select-sm" :value="editSlide.bgFit || 'cover'" @change="editSlide.bgFit = ($event.target as any).value; nextTick(() => renderSlideToCanvas())">
                    <option value="cover">Заполнить</option>
                    <option value="contain">Вместить</option>
                    <option value="fill">Растянуть</option>
                  </select>
                </div>
                <div class="prop-row">
                  <label class="prop-label">Затемнение</label>
                  <input type="range" min="0" max="80" class="range" :value="Math.round(editSlide.overlay * 100)" @input="editSlide.overlay = ($event.target as any).value / 100">
                  <span class="range-val">{{ Math.round(editSlide.overlay * 100) }}%</span>
                </div>
                <button class="btn-sm" @click="editSlide.bgFit = 'contain'; editConfig.canvasHeight = Math.round(editConfig.designWidth * 9/16); nextTick(() => { if (fabricCanvas) fabricCanvas.setDimensions({ width: editConfig.designWidth, height: editConfig.canvasHeight }); renderSlideToCanvas() })">16:9</button>
                <button class="btn-sm" style="margin-top:4px" @click="editSlide.bgFit = 'contain'; editConfig.canvasHeight = Math.round(editConfig.designWidth * 3/4); nextTick(() => { if (fabricCanvas) fabricCanvas.setDimensions({ width: editConfig.designWidth, height: editConfig.canvasHeight }); renderSlideToCanvas() })">4:3</button>
              </template>
            </div>

            <div v-if="editSlide" class="panel-section">
              <div class="section-title">Ссылка слайда</div>
              <input type="text" v-model="editSlide.clickLink" class="prop-input prop-input-full" placeholder="/catalog или https://...">
              <div class="hint">Клик по слайду ведёт по ссылке</div>
            </div>
          </template>

          <!-- Element properties -->
          <template v-if="selectedEl">
            <div class="panel-section">
              <div class="section-title">{{ selectedEl.type === 'heading' ? 'Заголовок' : selectedEl.type === 'subheading' ? 'Подзаголовок' : selectedEl.type === 'button' ? 'Кнопка' : selectedEl.type === 'shape' ? 'Фигура' : 'Картинка' }}</div>

              <!-- Position -->
              <div class="prop-row">
                <label class="prop-label">X</label>
                <input type="number" class="prop-input" :value="Math.round(selectedEl.x * 10) / 10" step="0.5" @input="updateEl('x', +($event.target as any).value)">
                <label class="prop-label" style="margin-left:8px">Y</label>
                <input type="number" class="prop-input" :value="Math.round(selectedEl.y)" @input="updateEl('y', +($event.target as any).value)">
              </div>

              <!-- Shape -->
              <template v-if="selectedEl.type === 'shape'">
                <div class="prop-row">
                  <label class="prop-label">W</label>
                  <input type="number" class="prop-input" :value="selectedEl.width || 200" min="10" @input="updateEl('width', +($event.target as any).value)">
                  <label class="prop-label" style="margin-left:8px">H</label>
                  <input type="number" class="prop-input" :value="selectedEl.height || 100" min="10" @input="updateEl('height', +($event.target as any).value)">
                </div>
                <div class="prop-row"><label class="prop-label">Цвет</label><input type="color" :value="selectedEl.color" @input="updateEl('color', ($event.target as any).value)" class="color-pick"></div>
                <div class="prop-row"><label class="prop-label">Прозрачность</label><input type="range" min="0" max="100" class="range" :value="Math.round((selectedEl.opacity ?? 0.5) * 100)" @input="updateEl('opacity', +($event.target as any).value / 100)"><span class="range-val">{{ Math.round((selectedEl.opacity ?? 0.5) * 100) }}%</span></div>
                <div class="prop-row"><label class="prop-label">Скругление</label><input type="range" min="0" max="50" class="range" :value="selectedEl.borderRadius || 0" @input="updateEl('borderRadius', +($event.target as any).value)"><span class="range-val">{{ selectedEl.borderRadius || 0 }}</span></div>
              </template>

              <!-- Image -->
              <template v-else-if="selectedEl.type === 'image'">
                <div class="prop-row"><label class="prop-label">Ширина</label><input type="range" :min="30" :max="editConfig.designWidth" class="range" :value="selectedEl.width || 200" @input="updateEl('width', +($event.target as any).value)"><span class="range-val">{{ selectedEl.width || 200 }}px</span></div>
                <div class="prop-row"><label class="prop-label">Высота</label><input type="range" :min="30" :max="editConfig.canvasHeight" class="range" :value="selectedEl.height || Math.round((selectedEl.width || 200) * 0.6)" @input="updateEl('height', +($event.target as any).value)"><span class="range-val">{{ selectedEl.height ? selectedEl.height + 'px' : 'auto' }}</span></div>
                <div class="prop-actions">
                  <button class="btn btn-outline btn-sm" @click="stretchImageToFill(selectedEl)">На весь холст</button>
                  <button v-if="selectedEl.height" class="btn btn-outline btn-sm" @click="resetImageHeight(selectedEl)">Сбросить высоту</button>
                </div>
              </template>

              <!-- Text/button -->
              <template v-else>
                <div class="prop-row"><label class="prop-label">Размер</label><input type="range" min="10" max="120" class="range" :value="selectedEl.fontSize" @input="updateEl('fontSize', +($event.target as any).value)"><span class="range-val">{{ selectedEl.fontSize }}</span></div>
                <div class="prop-row">
                  <label class="prop-label">Жирность</label>
                  <select :value="selectedEl.fontWeight" @input="updateEl('fontWeight', +($event.target as any).value)" class="prop-select">
                    <option :value="300">Light</option><option :value="400">Regular</option><option :value="500">Medium</option>
                    <option :value="600">Semibold</option><option :value="700">Bold</option><option :value="800">Extra Bold</option>
                  </select>
                </div>
                <div class="prop-row"><label class="prop-label">Цвет</label><input type="color" :value="selectedEl.color" @input="updateEl('color', ($event.target as any).value)" class="color-pick"></div>
                <div class="prop-row"><label class="prop-label">Межбуквенный</label><input type="range" min="-2" max="12" class="range" :value="selectedEl.letterSpacing" @input="updateEl('letterSpacing', +($event.target as any).value)"><span class="range-val">{{ selectedEl.letterSpacing }}px</span></div>
                <label class="check-row"><input type="checkbox" :checked="!!selectedEl.shadow" @change="updateEl('shadow', ($event.target as any).checked)"><span>Тень текста</span></label>
              </template>

              <!-- Z-index -->
              <div class="prop-row"><label class="prop-label">Слой</label><input type="range" min="0" max="10" class="range" :value="selectedEl.zIndex" @input="updateEl('zIndex', +($event.target as any).value)"><span class="range-val">{{ selectedEl.zIndex }}</span></div>

              <!-- Button link -->
              <div v-if="selectedEl.type === 'button'" class="prop-row"><label class="prop-label">Ссылка</label><input type="text" :value="selectedEl.link" @input="updateEl('link', ($event.target as any).value)" class="prop-input prop-input-full" placeholder="/catalog"></div>

              <!-- Actions -->
              <div class="prop-actions">
                <button class="btn btn-outline btn-sm" @click="duplicateSelected">Дублировать</button>
                <button class="delete-btn" @click="deleteSelectedEl">Удалить</button>
              </div>
            </div>
          </template>
        </aside>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* ── Base ── */
.editor-overlay {
  position: fixed; inset: 0; z-index: 10000;
  background: #0f0f1a; color: #e0e0e0;
  display: flex; flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* ── Toolbar ── */
.toolbar {
  display: flex; align-items: center; justify-content: space-between;
  height: 52px; min-height: 52px; padding: 0 16px;
  background: #16162a; border-bottom: 1px solid #2a2a40;
  flex-shrink: 0; gap: 12px;
}
.toolbar-left, .toolbar-center, .toolbar-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.toolbar-center { flex: 1; justify-content: center; overflow-x: auto; }
.toolbar-title { font-size: 14px; font-weight: 700; color: #fff; white-space: nowrap; }
.icon-btn {
  width: 32px; height: 32px; border-radius: 6px; background: transparent;
  border: 1px solid #3a3a50; color: #888; cursor: pointer;
  display: flex; align-items: center; justify-content: center; transition: all 0.15s;
}
.close-btn:hover { border-color: #e55; color: #e55; }

.variant-toggle { display: flex; gap: 2px; background: #1e1e35; border-radius: 8px; padding: 2px; }
.variant-btn {
  display: flex; align-items: center; gap: 5px; padding: 5px 12px;
  border: none; border-radius: 6px; background: transparent; color: #888;
  font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.15s; white-space: nowrap;
}
.variant-btn:hover { color: #ccc; }
.variant-btn.active { background: #0D945B; color: #fff; }

.slides-row { display: flex; align-items: center; gap: 4px; }
.slide-btn {
  width: 26px; height: 26px; border-radius: 6px; border: 1px solid #3a3a50;
  background: transparent; color: #888; font-size: 11px; font-weight: 700; cursor: pointer; transition: all 0.15s;
}
.slide-btn.active { background: #0D945B; border-color: #0D945B; color: #fff; }
.slide-add { border-style: dashed; color: #0D945B; border-color: #0D945B; }
.slide-add:hover { background: rgba(13,148,91,0.15); }
.slide-action {
  width: 24px; height: 24px; border-radius: 4px; background: transparent;
  border: 1px solid #2a2a40; color: #666; cursor: pointer;
  display: flex; align-items: center; justify-content: center; transition: all 0.15s;
}
.slide-action:hover { border-color: #666; color: #fff; }

.btn {
  display: inline-flex; align-items: center; gap: 5px; padding: 6px 12px;
  border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;
  border: none; transition: all 0.15s; white-space: nowrap;
}
.btn-outline { background: transparent; border: 1px solid #3a3a50; color: #888; }
.btn-outline:hover { border-color: #666; color: #fff; }
.btn-ghost { background: transparent; color: #999; border: 1px solid #3a3a50; }
.btn-ghost:hover { border-color: #666; color: #fff; }
.btn-save { background: #0D945B; color: #fff; }
.btn-save:hover { background: #0a7a4b; }
.btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-sm { padding: 5px 10px; font-size: 11px; }
.save-error { color: #e55; font-size: 12px; font-weight: 600; }

/* ── Workspace ── */
.workspace { display: flex; flex: 1; min-height: 0; }

/* ── Left Panel ── */
.panel-left {
  width: 200px; min-width: 200px; background: #16162a;
  border-right: 1px solid #2a2a40; padding: 16px; overflow-y: auto; flex-shrink: 0;
}
.panel-section { margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid #1e1e35; }
.panel-section:last-child { border-bottom: none; }
.section-title {
  font-size: 10px; font-weight: 700; color: #555; text-transform: uppercase;
  letter-spacing: 1px; margin-bottom: 10px;
}
.add-btn {
  display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 10px;
  background: transparent; border: 1px solid #2a2a40; border-radius: 6px;
  color: #aaa; font-size: 12px; font-weight: 500; cursor: pointer;
  transition: all 0.15s; margin-bottom: 4px;
}
.add-btn:hover { border-color: #0D945B; color: #0D945B; background: rgba(13,148,91,0.05); }

.shortcuts { margin-top: auto; }
.shortcut { font-size: 11px; color: #555; margin-bottom: 4px; display: flex; align-items: center; gap: 8px; }
.shortcut kbd {
  display: inline-block; padding: 1px 5px; background: #1e1e35; border: 1px solid #2a2a40;
  border-radius: 3px; font-size: 10px; color: #888; font-family: inherit; min-width: 28px; text-align: center;
}

/* ── Canvas Area ── */
.canvas-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 300px; color: #999; font-size: 14px; text-align: center; gap: 12px; }
.canvas-area {
  flex: 1; display: flex; flex-direction: column; align-items: center;
  justify-content: flex-start; padding: 24px 20px; overflow: auto; min-width: 0;
}
.canvas-info {
  display: flex; align-items: center; gap: 12px; justify-content: center;
  margin-bottom: 12px; padding: 6px 14px; background: #1e1e35;
  border: 1px solid #2a2a40; border-radius: 8px;
}
.dims { font-size: 12px; color: #888; font-weight: 500; font-variant-numeric: tabular-nums; }
.zoom { font-size: 11px; color: #0D945B; font-weight: 700; padding: 2px 8px; background: rgba(13,148,91,0.1); border-radius: 4px; }

.canvas-wrapper {
  position: relative; overflow: visible; border-radius: 8px;
  box-shadow: 0 0 0 1px rgba(255,255,255,0.08), 0 20px 60px rgba(0,0,0,0.5);
}
.canvas-mobile { border-radius: 0; box-shadow: -1px 0 0 #2a2a40, 1px 0 0 #2a2a40; outline: 2px solid rgba(13,148,91,0.3); outline-offset: -2px; }
.fabric-inner { position: relative; }
.fabric-inner :deep(canvas) { display: block; }
.fabric-inner :deep(.canvas-container) { border-radius: 8px; }
.canvas-mobile .fabric-inner :deep(.canvas-container) { border-radius: 0; }

/* Phone mockup */
.phone-mockup {
  background: #fff; border-radius: 24px 24px 0 0; overflow: hidden; margin: 0 auto;
  box-shadow: -1px 0 0 #2a2a40, 1px 0 0 #2a2a40, 0 -1px 0 #2a2a40;
}
.phone-status-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 16px 4px; font-size: 12px; font-weight: 600; color: #1a1a1a; background: #f8f8f8;
}
.phone-notch { width: 80px; height: 22px; background: #1a1a1a; border-radius: 12px; }
.phone-icons { display: flex; gap: 4px; color: #1a1a1a; }
.phone-header { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: #fff; border-bottom: 1px solid #eee; }
.pfh-back { font-size: 22px; color: #1a5632; font-weight: 300; line-height: 1; }
.pfh-logo { font-size: 18px; }
.pfh-search { flex: 1; height: 30px; background: #f0f0f0; border-radius: 16px; border: 1px solid #ddd; }

.phone-content {
  background: #fff; padding: 16px; margin: 0 auto;
  box-shadow: -1px 0 0 #2a2a40, 1px 0 0 #2a2a40;
  border-radius: 0 0 24px 24px; overflow: hidden;
}
.pfc-title { font-size: 14px; font-weight: 700; color: #333; margin-bottom: 10px; }
.pfc-title span { font-size: 11px; font-weight: 500; color: #999; background: #f0f0f0; padding: 2px 8px; border-radius: 10px; margin-left: 6px; }
.pfc-cards { display: flex; gap: 8px; }
.pfc-card { width: 33.33%; aspect-ratio: 0.8; background: #f0f0f0; border-radius: 8px; }
.phone-home-bar { display: flex; justify-content: center; padding: 12px 0 4px; }
.phone-home-pill { width: 100px; height: 4px; background: #ccc; border-radius: 2px; }

/* Height handle */
.height-handle { width: 200px; height: 20px; cursor: ns-resize; display: flex; align-items: center; justify-content: center; margin-top: 4px; }
.height-pill { width: 60px; height: 6px; background: #3a3a50; border-radius: 3px; transition: background 0.15s; }
.height-handle:hover .height-pill { background: #0D945B; }
.height-label { font-size: 11px; color: #555; margin-top: 4px; }

/* ── Right Panel ── */
.panel-right {
  width: 280px; min-width: 280px; background: #16162a;
  border-left: 1px solid #2a2a40; padding: 16px; overflow-y: auto; flex-shrink: 0;
}
.prop-row { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; }
.prop-label { font-size: 11px; color: #888; min-width: 50px; flex-shrink: 0; }
.prop-input {
  flex: 1; padding: 6px 8px; background: #1a1a2e; border: 1px solid #2a2a40;
  border-radius: 5px; color: #ccc; font-size: 12px; font-family: inherit;
  transition: border-color 0.15s; min-width: 0;
}
.prop-input:focus { outline: none; border-color: #0D945B; }
.prop-input-full { width: 100%; flex: none; }
.prop-select {
  width: 100%; padding: 7px 10px; background: #1a1a2e; border: 1px solid #2a2a40;
  border-radius: 6px; color: #ccc; font-size: 12px; margin-bottom: 8px;
}
.prop-select:focus { outline: none; border-color: #0D945B; }
.prop-select-sm { padding: 5px 8px; background: #1a1a2e; border: 1px solid #2a2a40; border-radius: 5px; color: #ccc; font-size: 11px; flex: 1; }

.color-row { display: flex; gap: 8px; margin-bottom: 10px; }
.color-field { display: flex; align-items: center; gap: 6px; }
.color-pick { width: 36px; height: 30px; border: 1px solid #3a3a50; border-radius: 6px; padding: 0; cursor: pointer; background: none; }
.file-input { font-size: 11px; color: #999; margin-bottom: 10px; display: block; }
.range { flex: 1; accent-color: #0D945B; min-width: 0; }
.range-val { font-size: 11px; color: #0D945B; font-weight: 700; min-width: 32px; text-align: right; }
.check-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; font-size: 12px; color: #999; cursor: pointer; }
.check-row input { accent-color: #0D945B; }
.hint { font-size: 10px; color: #555; margin-top: 4px; }
.prop-actions { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
.btn-sm { width: 100%; padding: 6px 10px; background: rgba(13,148,91,0.1); border: 1px solid rgba(13,148,91,0.3); border-radius: 6px; color: #0D945B; font-size: 11px; font-weight: 600; cursor: pointer; }
.btn-sm:hover { background: rgba(13,148,91,0.2); }
.delete-btn {
  display: flex; align-items: center; gap: 6px; padding: 6px 12px;
  background: rgba(238,85,85,0.1); border: 1px solid rgba(238,85,85,0.3);
  border-radius: 6px; color: #e55; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.15s;
}
.delete-btn:hover { background: rgba(238,85,85,0.2); }

/* ── Responsive ── */
@media (max-width: 1100px) {
  .panel-left { width: 170px; min-width: 170px; }
  .panel-right { width: 240px; min-width: 240px; }
}
@media (max-width: 900px) {
  .panel-left { display: none; }
  .panel-right { width: 220px; min-width: 220px; padding: 12px; }
}
@media (max-width: 768px) {
  .workspace { flex-direction: column-reverse; }
  .panel-right { width: 100%; min-width: 100%; max-height: 200px; border-left: none; border-top: 1px solid #2a2a40; }
  .canvas-area { padding: 16px 8px; }
}
</style>
