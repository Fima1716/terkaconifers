import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve } from 'path'
import { createHash } from 'crypto'

/**
 * Архив прежних фотографий карточки в «Дневник роста».
 *
 * Когда автор перезаливает растение свежим фото, старый снимок просто
 * исчезал: синк переписывал photos, а дневник наполнялся только вручную.
 * Отсюда и жалобы «в одних карточках история есть, в других старое фото
 * пропало». Теперь перед заменой фото уезжает в дневник — карточка одна,
 * а история роста накапливается сама.
 */

const ROOT = resolve(import.meta.dirname, '../..')
const DATA_PATH = resolve(ROOT, 'data/growth-diary.json')
const UPLOAD_DIR = resolve(ROOT, 'data/uploads/growth')
const PUBLIC_DIR = resolve(ROOT, 'public')

/** Сколько снимков одного поста уносим в историю (остальные — шум в ленте) */
const MAX_PER_POST = 4
/** Потолок автозаписей на карточку — страховка от разрастания дневника */
const MAX_AUTO_PER_PLANT = 12

export interface ArchivablePlant {
  _site_id?: number
  _msg_ts?: number
  date?: string
  latin_full?: string
  photos?: string[]
}

interface DiaryFile {
  entries: any[]
  nextId: number
}

function loadDiary(): DiaryFile {
  if (!existsSync(DATA_PATH)) return { entries: [], nextId: 1 }
  try {
    const data = JSON.parse(readFileSync(DATA_PATH, 'utf-8'))
    const entries = Array.isArray(data.entries) ? data.entries : []
    const maxId = entries.reduce((m: number, e: any) => Math.max(m, e.id || 0), 0)
    return { entries, nextId: Math.max(data.nextId || 1, maxId + 1) }
  } catch {
    return { entries: [], nextId: 1 }
  }
}

/** Год съёмки: из времени поста, иначе из даты карточки, иначе текущий */
function guessYear(plant: ArchivablePlant): number {
  const ts = plant._msg_ts || 0
  if (ts) {
    const ms = ts > 1e12 ? ts : ts * 1000
    const y = new Date(ms).getFullYear()
    if (y >= 1990 && y <= new Date().getFullYear()) return y
  }
  const [, , dy] = String(plant.date || '').split('.')
  const parsed = parseInt(dy || '')
  if (parsed >= 1990 && parsed <= new Date().getFullYear()) return parsed
  return new Date().getFullYear()
}

function extOf(source: string): string {
  const m = source.split('?')[0].match(/\.(jpe?g|png|webp)$/i)
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg'
}

/** Байты снимка: по сети для URL из MAX, с диска — для локальных photos/ */
async function readPhoto(source: string): Promise<Buffer | null> {
  try {
    if (/^https?:\/\//i.test(source)) {
      const resp = await fetch(source)
      if (!resp.ok) return null
      return Buffer.from(await resp.arrayBuffer())
    }
    const local = resolve(PUBLIC_DIR, source.replace(/^\/+/, ''))
    if (!local.startsWith(PUBLIC_DIR) || !existsSync(local)) return null
    return readFileSync(local)
  } catch {
    return null
  }
}

/**
 * Переносит старые фото карточки в дневник роста.
 * Возвращает количество добавленных записей.
 */
export async function archiveOldPhotos(
  plant: ArchivablePlant,
  oldPhotos: string[] | undefined,
  newPhotos: string[],
  opts: { year?: number; comment?: string } = {},
): Promise<number> {
  const plantId = plant._site_id
  if (!plantId) return 0  // карточка ещё не получила site id — архивировать некуда

  const fresh = new Set(newPhotos)
  const sources = (oldPhotos || [])
    .filter(p => typeof p === 'string' && p && !fresh.has(p))
    .slice(0, MAX_PER_POST)
  if (!sources.length) return 0

  const diary = loadDiary()
  const mine = diary.entries.filter((e: any) => e.plantId === plantId)
  if (mine.filter((e: any) => e.auto).length >= MAX_AUTO_PER_PLANT) return 0

  // Узнаём уже сохранённое и по ссылке, и по содержимому: MAX умеет отдавать
  // новый URL для той же самой картинки, иначе дневник забьётся дублями.
  const seenUrls = new Set(mine.filter((e: any) => e.source).map((e: any) => String(e.source)))
  const seenHashes = new Set(mine.filter((e: any) => e.sourceHash).map((e: any) => String(e.sourceHash)))

  // Год съёмки: подсказка вызывающего (год того поста, откуда фото) — точнее,
  // чем время текущего поста карточки
  const year = opts.year && opts.year >= 1990 && opts.year <= new Date().getFullYear()
    ? opts.year
    : guessYear(plant)
  const comment = opts.comment ?? 'Фото из прежней версии карточки'
  let added = 0

  for (const source of sources) {
    if (seenUrls.has(source)) continue
    const data = await readPhoto(source)
    if (!data || !data.length) continue
    const hash = createHash('md5').update(data).digest('hex')
    if (seenHashes.has(hash)) continue

    if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true })
    const photoFilename = `archived-${plantId}-${hash.slice(0, 8)}.${extOf(source)}`
    writeFileSync(resolve(UPLOAD_DIR, photoFilename), data)

    diary.entries.push({
      id: diary.nextId++,
      plantId,
      year,
      photoFilename,
      authorContact: 'archive',
      comment,
      createdAt: new Date().toISOString(),
      source,
      sourceHash: hash,
      auto: true,
    })
    seenUrls.add(source)
    seenHashes.add(hash)
    added++
  }

  if (added > 0) writeFileSync(DATA_PATH, JSON.stringify(diary, null, 2))
  return added
}
