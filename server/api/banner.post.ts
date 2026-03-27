import { readMultipartFormData } from 'h3'
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs'
import { resolve } from 'path'

const BANNER_DIR = resolve(process.cwd(), 'data/banner')

export default defineEventHandler(async (event) => {
  await requireAuth(event, 'super_admin')

  const formData = await readMultipartFormData(event)
  if (!formData) throw createError({ statusCode: 400, message: 'Нет данных' })

  if (!existsSync(BANNER_DIR)) mkdirSync(BANNER_DIR, { recursive: true })

  const fields: Record<string, string> = {}
  let imageFile: { filename: string; data: Buffer } | null = null

  for (const field of formData) {
    if (field.name === 'bgImageFile' && field.filename && field.data.length > 0) {
      imageFile = { filename: field.filename, data: field.data }
    } else if (field.name && field.data) {
      fields[field.name] = field.data.toString()
    }
  }

  const page = (fields.page || 'home').replace(/[^a-z0-9-]/gi, '')
  const configFilename = page === 'home' ? 'config.json' : `config-${page}.json`
  const configPath = resolve(BANNER_DIR, configFilename)
  let config: any = { enabled: true, slides: [], interval: 6000 }
  try { config = JSON.parse(readFileSync(configPath, 'utf-8')) } catch {}
  if (!config.slides) config.slides = []

  const action = fields.action || 'save'

  // ── New: save entire config with elements ──
  if (action === 'saveCanvas') {
    const incoming = JSON.parse(fields.config)

    // Handle bg image upload
    if (imageFile) {
      const ext = imageFile.filename.split('.').pop() || 'jpg'
      const name = `bg-${Date.now()}.${ext}`
      writeFileSync(resolve(BANNER_DIR, name), imageFile.data)
      const idx = parseInt(fields.uploadSlideIndex || '0')
      if (incoming.slides?.[idx]) {
        incoming.slides[idx].bgImage = name
        incoming.slides[idx].bgType = 'image'
      }
    }

    // Preserve bgImage filenames for slides without new uploads
    for (let i = 0; i < (incoming.slides?.length || 0); i++) {
      const slide = incoming.slides[i]
      if (!slide.bgImage && config.slides[i]?.bgImage) {
        slide.bgImage = config.slides[i].bgImage
      }
    }

    // Auto-fix: if a slide has bgImage but bgType is not 'image', correct it
    for (const slide of incoming.slides || []) {
      if (slide.bgImage && slide.bgType !== 'image') slide.bgType = 'image'
    }

    config = { ...incoming }
  }

  // ── Legacy actions (admin panel still uses these) ──
  if (action === 'saveSlide' || action === 'saveSlideAndLayout') {
    let bgImageName = fields.bgImage || ''
    if (imageFile) {
      const ext = imageFile.filename.split('.').pop() || 'jpg'
      bgImageName = `bg-${Date.now()}.${ext}`
      writeFileSync(resolve(BANNER_DIR, bgImageName), imageFile.data)
    }

    const slide: any = {
      type: fields.type || 'constructed',
      bgType: imageFile ? 'image' : (fields.bgType || 'gradient'),
      bgColor1: fields.bgColor1 || '#1a5632',
      bgColor2: fields.bgColor2 || '#2d8b4e',
      bgImage: bgImageName,
      overlay: parseFloat(fields.overlay || '0.4'),
      title: fields.title || '',
      subtitle: fields.subtitle || '',
      buttonText: fields.buttonText || '',
      buttonLink: fields.buttonLink || '/catalog',
    }

    const idx = parseInt(fields.slideIndex || '-1')
    if (idx >= 0 && idx < config.slides.length) {
      if (!imageFile && config.slides[idx].bgImage) slide.bgImage = config.slides[idx].bgImage
      config.slides[idx] = slide
    } else {
      config.slides.push(slide)
    }

    if (action === 'saveSlideAndLayout') {
      config.layout = {
        bannerHeight: parseInt(fields.bannerHeight || '280'),
        titlePos: fields.titlePos ? JSON.parse(fields.titlePos) : config.layout?.titlePos,
        subtitlePos: fields.subtitlePos ? JSON.parse(fields.subtitlePos) : config.layout?.subtitlePos,
        buttonPos: fields.buttonPos ? JSON.parse(fields.buttonPos) : config.layout?.buttonPos,
        textColor: fields.textColor || '#ffffff',
      }
    }
  }

  if (action === 'delete') {
    const idx = parseInt(fields.slideIndex || '-1')
    if (idx >= 0 && idx < config.slides.length) config.slides.splice(idx, 1)
  }

  if (action === 'toggle') { config.enabled = fields.enabled === 'true' }
  if (action === 'updateSettings') { config.enabled = fields.enabled === 'true'; config.interval = parseInt(fields.interval || '6000') }

  writeFileSync(configPath, JSON.stringify(config, null, 2))
  return { ok: true, config }
})
