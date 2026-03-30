/**
 * Генерация оптимизированных WebP-вариантов фотографий каталога.
 *
 * Фотки уже сжаты Telegram'ом, поэтому тупая конвертация в WebP
 * может быть БОЛЬШЕ оригинала. Скрипт умно подходит к каждому файлу:
 *
 * Из _thumb.jpg:
 *   - _thumb.webp  — только если WebP меньше JPEG (quality 75)
 *   - _micro.webp  — 50px blur-up placeholder (~0.4-1KB)  ← ВСЕГДА создаём
 *   - _hires.webp  — 500px retina upgrade (~60-100KB)      ← ВСЕГДА создаём
 *
 * Из оригинала (.jpg):
 *   - .webp        — только если WebP меньше JPEG (quality 80, max 1200px)
 *
 * Качество: WebP quality 75-85 визуально неотличим от JPEG 90+.
 * Микро: качество 20, но размер 50px — используется только как blur.
 *
 * Запуск:  npx tsx scripts/optimize-photos.ts
 * Пробный: npx tsx scripts/optimize-photos.ts --dry-run
 */

import sharp from 'sharp'
import { readdirSync, existsSync, statSync, unlinkSync } from 'fs'
import { resolve, join } from 'path'

const PHOTOS_DIR = resolve(process.cwd(), 'public/photos')
const DRY_RUN = process.argv.includes('--dry-run')

// Prevent sharp from caching too much and eating RAM
sharp.cache({ memory: 50, files: 20, items: 200 })
sharp.concurrency(1)

const stats = {
  thumbWebp: 0, thumbSkipped: 0,
  micro: 0,
  hires: 0,
  fullWebp: 0, fullSkipped: 0,
  skipped: 0, errors: 0,
  origTotalBytes: 0,
  webpTotalBytes: 0,
}

async function createIfSmaller(
  sourcePath: string,
  destPath: string,
  opts: { width?: number; quality: number },
): Promise<boolean> {
  if (existsSync(destPath)) { stats.skipped++; return false }
  if (DRY_RUN) return true

  const pipeline = sharp(sourcePath)
  if (opts.width) pipeline.resize(opts.width, null, { withoutEnlargement: true })
  const result = await pipeline.webp({ quality: opts.quality, effort: 6 }).toBuffer()

  const origSize = statSync(sourcePath).size
  if (result.length < origSize) {
    const { writeFileSync } = await import('fs')
    writeFileSync(destPath, result)
    stats.origTotalBytes += origSize
    stats.webpTotalBytes += result.length
    return true
  }
  // WebP is larger — don't create it, browser will use JPEG fallback
  return false
}

async function createAlways(
  sourcePath: string,
  destPath: string,
  opts: { width?: number; quality: number },
): Promise<void> {
  if (existsSync(destPath)) { stats.skipped++; return }
  if (DRY_RUN) return

  const pipeline = sharp(sourcePath)
  if (opts.width) pipeline.resize(opts.width, null, { withoutEnlargement: true })
  const info = await pipeline.webp({ quality: opts.quality, effort: 4 }).toFile(destPath)
  stats.webpTotalBytes += info.size
}

async function processThumb(thumbPath: string, thumbName: string) {
  const base = thumbName.replace(/_thumb\.jpg$/i, '')
  const origPath = join(PHOTOS_DIR, `${base}.jpg`)
  const hiresSource = existsSync(origPath) ? origPath : thumbPath

  // _micro.webp — blur-up placeholder (always create, ~0.4-1KB)
  const microPath = join(PHOTOS_DIR, `${base}_micro.webp`)
  if (!existsSync(microPath)) {
    await createAlways(thumbPath, microPath, { width: 50, quality: 20 })
    stats.micro++
  } else { stats.skipped++ }

  // _hires.webp — retina upgrade 500px (always create from original)
  const hiresPath = join(PHOTOS_DIR, `${base}_hires.webp`)
  if (!existsSync(hiresPath)) {
    await createAlways(hiresSource, hiresPath, { width: 500, quality: 82 })
    stats.hires++
  } else { stats.skipped++ }

  // _thumb.webp — only if smaller than JPEG thumb
  const webpPath = join(PHOTOS_DIR, `${base}_thumb.webp`)
  if (!existsSync(webpPath)) {
    const created = await createIfSmaller(thumbPath, webpPath, { quality: 75 })
    if (created) stats.thumbWebp++
    else stats.thumbSkipped++
  } else { stats.skipped++ }
}

async function processOriginal(origPath: string, origName: string) {
  const base = origName.replace(/\.jpg$/i, '')
  const webpPath = join(PHOTOS_DIR, `${base}.webp`)

  if (!existsSync(webpPath)) {
    const created = await createIfSmaller(origPath, webpPath, { width: 1200, quality: 80 })
    if (created) stats.fullWebp++
    else stats.fullSkipped++
  } else { stats.skipped++ }
}

async function main() {
  if (!existsSync(PHOTOS_DIR)) {
    console.error(`Папка не найдена: ${PHOTOS_DIR}`)
    process.exit(1)
  }

  const files = readdirSync(PHOTOS_DIR).filter(f => f.endsWith('.jpg'))
  const thumbs = files.filter(f => f.includes('_thumb.'))
  const originals = files.filter(f => !f.includes('_thumb.'))

  console.log(`📸 Найдено: ${originals.length} оригиналов, ${thumbs.length} thumbnails`)
  console.log(`   Режим: ${DRY_RUN ? 'DRY RUN' : 'ГЕНЕРАЦИЯ'}`)
  console.log(`   Стратегия: WebP создаётся ТОЛЬКО если меньше JPEG (кроме micro/hires)`)
  console.log('')

  // Process thumbs → generates _micro.webp, _hires.webp, _thumb.webp
  let n = 0
  for (const f of thumbs) {
    try {
      await processThumb(join(PHOTOS_DIR, f), f)
    } catch (err: any) {
      stats.errors++
      if (stats.errors <= 5) console.error(`  ✗ ${f}: ${err.message}`)
    }
    if (++n % 200 === 0) console.log(`  thumbs ${n}/${thumbs.length}`)
  }
  console.log(`  thumbs ${n}/${thumbs.length} ✓`)

  // Process originals → generates .webp
  n = 0
  for (const f of originals) {
    try {
      await processOriginal(join(PHOTOS_DIR, f), f)
    } catch (err: any) {
      stats.errors++
      if (stats.errors <= 5) console.error(`  ✗ ${f}: ${err.message}`)
    }
    if (++n % 200 === 0) console.log(`  originals ${n}/${originals.length}`)
  }
  console.log(`  originals ${n}/${originals.length} ✓`)

  const savedMB = ((stats.origTotalBytes - stats.webpTotalBytes) / 1024 / 1024).toFixed(1)
  const ratio = stats.origTotalBytes > 0
    ? ((1 - stats.webpTotalBytes / stats.origTotalBytes) * 100).toFixed(0)
    : '0'

  console.log('')
  console.log(`✅ Готово!`)
  console.log(`   Micro WebP:      ${stats.micro} создано (blur-up ~0.5KB каждый)`)
  console.log(`   Hires WebP:      ${stats.hires} создано (retina 500px)`)
  console.log(`   Thumb WebP:      ${stats.thumbWebp} создано, ${stats.thumbSkipped} пропущено (JPEG уже меньше)`)
  console.log(`   Original WebP:   ${stats.fullWebp} создано, ${stats.fullSkipped} пропущено (JPEG уже меньше)`)
  console.log(`   Уже существовали: ${stats.skipped}`)
  console.log(`   Ошибки:          ${stats.errors}`)
  if (!DRY_RUN && stats.origTotalBytes > 0) {
    console.log(`   Экономия:        ${savedMB} MB (${ratio}% меньше где WebP создан)`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
