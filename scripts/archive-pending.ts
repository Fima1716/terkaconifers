/**
 * Разовое архивирование заявок, которые уже висят в очереди бота.
 *
 * Их фото пока отдаются по ссылкам MAX, но однажды перестанут. Скрипт
 * скачивает фото на диск и записывает полный текст в журнал заявок,
 * чтобы такие заявки всегда можно было восстановить.
 *
 * Usage:
 *   npx tsx scripts/archive-pending.ts            # показать, что будет сделано
 *   npx tsx scripts/archive-pending.ts --apply    # выполнить
 */
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { archivePhotos, logSubmission, archiveSizeMb } from './lib/submission-log.js'

const ROOT = resolve(import.meta.dirname, '..')
const apply = process.argv.includes('--apply')

interface Pending {
  mid: string
  source: 'max' | 'tg'
  userName?: string
  photos: string[]
  aiText?: string
}

function collect(): Pending[] {
  const out: Pending[] = []
  const sources: Array<[string, 'max' | 'tg']> = [
    ['data/bot-state.json', 'max'],
    ['data/tg-bridge-state.json', 'tg'],
  ]
  for (const [file, source] of sources) {
    const path = resolve(ROOT, file)
    if (!existsSync(path)) continue
    let state: any
    try { state = JSON.parse(readFileSync(path, 'utf-8')) } catch { continue }
    for (const [mid, v] of Object.entries<any>(state.pendingPublish || {})) {
      out.push({ mid, source, userName: v.userName, photos: v.photos || [], aiText: v.aiText })
    }
  }
  return out
}

function whenOf(mid: string): string | undefined {
  const m = mid.match(/mid\.[0-9a-f]{16}([0-9a-f]{12})/)
  if (!m) return undefined
  const ms = parseInt(m[1], 16)
  return ms > 1.6e12 && ms < 2.2e12 ? new Date(ms).toISOString() : undefined
}

const pending = collect()
console.log(`Заявок в очереди: ${pending.length}`)
console.log(`  с фото: ${pending.filter(p => p.photos.length).length}`)
console.log(`  с текстом: ${pending.filter(p => p.aiText).length}`)
console.log(`  фото всего: ${pending.reduce((n, p) => n + p.photos.length, 0)}`)

if (!apply) {
  console.log('\nПробный запуск. Для выполнения добавьте --apply')
  for (const p of pending) {
    const first = p.aiText ? p.aiText.split('\n').filter(Boolean)[0] : '— без текста —'
    console.log(`  ${(whenOf(p.mid) || '?').slice(0, 16).replace('T', ' ')}  ${(p.userName || '?').padEnd(18).slice(0, 18)} ф${p.photos.length}  ${first.slice(0, 44)}`)
  }
  process.exit(0)
}

const run = async () => {
  let okFiles = 0, failed = 0
  for (const p of pending) {
    const files = await archivePhotos(p.mid, p.photos)
    okFiles += files.length
    failed += p.photos.length - files.length

    // Пишем как 'received': заявка сохранена. Стадию 'accepted' не ставим,
    // чтобы сторож не поднимал тревогу по старым тестовым заявкам.
    logSubmission({
      ts: whenOf(p.mid),
      stage: 'received',
      source: p.source,
      author: p.userName,
      latin: p.aiText ? p.aiText.split('\n').filter(Boolean)[0]?.slice(0, 80) : undefined,
      aiText: p.aiText,
      photos: p.photos.length,
      photoUrls: p.photos,
      files,
      srcMid: p.mid,
    })
    console.log(`  ${(p.userName || '?').padEnd(18).slice(0, 18)} → сохранено фото: ${files.length}/${p.photos.length}`)
  }
  console.log(`\nГотово. Фото в архиве: ${okFiles}, не скачалось: ${failed}`)
  console.log(`Размер архива: ${archiveSizeMb()} МБ`)
}

run().catch(e => { console.error('Ошибка:', e); process.exit(1) })
