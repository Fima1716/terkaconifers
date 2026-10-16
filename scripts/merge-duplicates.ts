/**
 * Склейка карточек-дублей.
 *
 * Одно и то же растение из одного сада оказывалось на сайте дважды: ключ
 * склейки собирался из первой латинской строки поста, а её переписывают
 * (дописывают город, меняют кавычки). Синк это больше не допускает, но
 * накопленные дубли остались — их и убирает этот скрипт.
 *
 * Что делает с парой:
 *   • оставляет карточку, которая дольше живёт на сайте (ранняя дата) —
 *     на неё ведут ссылки и поисковая выдача;
 *   • фотографии второй карточки уносит в «Дневник роста» оставшейся;
 *   • если у второй пост свежее, оставшаяся забирает его фото, ссылку и mid,
 *     а её прежнее фото тоже уходит в дневник;
 *   • переносит записи дневника, ручные правки и ссылки «купить» на новый id;
 *   • пишет data/plant-merges.json, чтобы старый адрес /plant/<id> уводил
 *     на оставшуюся карточку, а не в 404.
 *
 * Запуск:
 *   npx tsx scripts/merge-duplicates.ts --dry-run   # только отчёт
 *   npx tsx scripts/merge-duplicates.ts --apply     # склеить
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'
import { execSync } from 'child_process'
import { archiveOldPhotos } from './lib/growth-archive.js'
import { cultKey, regionsClash } from './lib/plant-key.js'

const ROOT = resolve(import.meta.dirname, '..')
const DATA = resolve(ROOT, 'data')
const APPLY = process.argv.includes('--apply')

function readJson(path: string, fallback: any) {
  if (!existsSync(path)) return fallback
  try { return JSON.parse(readFileSync(path, 'utf-8')) } catch { return fallback }
}

/** Дата карточки dd.mm.yyyy → число для сравнения */
function dateNum(p: any): number {
  const [d, m, y] = String(p.date || '').split('.')
  if (!d || !m || !y) return Number.MAX_SAFE_INTEGER
  return parseInt(y) * 10000 + parseInt(m) * 100 + parseInt(d)
}

/** Год снимков карточки: по времени её поста, иначе по дате карточки */
function yearOf(p: any): number {
  const ts = p._msg_ts || 0
  if (ts) return new Date(ts > 1e12 ? ts : ts * 1000).getFullYear()
  const y = parseInt(String(p.date || '').split('.')[2] || '')
  return y >= 1990 ? y : new Date().getFullYear()
}

async function main() {
  console.log(APPLY ? '🔗 Склейка дублей' : '🔍 Холостой прогон (ничего не записываем)')

  const catalogPath = resolve(DATA, 'raw/catalog.json')
  const catalog: any[] = JSON.parse(readFileSync(catalogPath, 'utf-8'))
  console.log(`  Карточек в каталоге: ${catalog.length}`)

  // Группы «сорт + сад»
  const groups = new Map<string, any[]>()
  for (const p of catalog) {
    const k = cultKey(p)
    if (!k) continue
    const list = groups.get(k) || []
    list.push(p)
    groups.set(k, list)
  }

  const plans: { keeper: any; donor: any }[] = []
  let skippedByRegion = 0
  for (const [, list] of groups) {
    if (list.length < 2) continue
    // Старшая карточка остаётся, остальные вливаем в неё
    const sorted = [...list].sort((a, b) => dateNum(a) - dateNum(b) || (a._site_id || 0) - (b._site_id || 0))
    const keeper = sorted[0]
    for (const donor of sorted.slice(1)) {
      if (regionsClash(keeper.region, donor.region)) { skippedByRegion++; continue }
      plans.push({ keeper, donor })
    }
  }

  console.log(`  Пар к склейке: ${plans.length}`)
  if (skippedByRegion) console.log(`  Пропущено из-за разных регионов: ${skippedByRegion}`)
  for (const { keeper, donor } of plans) {
    const fresher = (donor._msg_ts || 0) > (keeper._msg_ts || 0) ? ' (пост второй свежее — переедет на оставшуюся)' : ''
    console.log(`    ${keeper._site_id} ${keeper.latin_full} [${keeper.date}] ← ${donor._site_id} [${donor.date}, ${(donor.photos || []).length} фото]${fresher}`)
  }

  if (!plans.length) { console.log('\nДублей нет.'); return }
  if (!APPLY) {
    console.log('\nХолостой прогон завершён. Для склейки: npx tsx scripts/merge-duplicates.ts --apply')
    return
  }

  // Бэкап каталога перед правкой
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const backupDir = resolve(DATA, 'backups')
  if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true })
  const backup = resolve(backupDir, `catalog-${stamp}.json`)
  copyFileSync(catalogPath, backup)
  console.log(`  Бэкап каталога: ${backup}`)

  const diaryPath = resolve(DATA, 'growth-diary.json')
  const overridesPath = resolve(DATA, 'plant-overrides.json')
  const gardensPath = resolve(DATA, 'gardens.json')
  const mergesPath = resolve(DATA, 'plant-merges.json')

  const merges: Record<string, number> = readJson(mergesPath, {})
  const removed = new Set<number>()
  let archived = 0

  for (const { keeper, donor } of plans) {
    if (removed.has(donor._site_id)) continue

    // Фото второй карточки — в дневник оставшейся. Если снимок не скачался,
    // карточку не трогаем: лучше оставить дубль, чем потерять фото совсем.
    const donorPhotos = (donor.photos || []).filter(Boolean)
    const savedDonor = await archiveOldPhotos(keeper, donorPhotos, keeper.photos || [], {
      year: yearOf(donor),
      comment: 'Фото из объединённой карточки',
    })
    archived += savedDonor
    if (donorPhotos.length && savedDonor === 0) {
      console.log(`  ⚠ ${donor._site_id}: фото не сохранилось в дневник — карточку оставляю как есть`)
      continue
    }

    // Если пост второй карточки свежее — оставшаяся забирает его целиком
    const keeperPhotos = (keeper.photos || []).filter(Boolean)
    const savedKeeper = (donor._msg_ts || 0) > (keeper._msg_ts || 0) && donorPhotos.length
      ? await archiveOldPhotos(keeper, keeperPhotos, donorPhotos, { year: yearOf(keeper) })
      : -1
    if (savedKeeper >= 0 && (savedKeeper > 0 || !keeperPhotos.length)) {
      archived += savedKeeper
      keeper.photos = donor.photos
      keeper.thumbs = donor.thumbs || donor.photos
      keeper.max_url = donor.max_url
      keeper._mid = donor._mid
      keeper._msg_ts = donor._msg_ts
      if (donor.hashtags?.length) keeper.hashtags = donor.hashtags
    } else if (!keeper.max_url && donor.max_url) {
      keeper.max_url = donor.max_url
      keeper._mid = donor._mid
      keeper._msg_ts = donor._msg_ts
    }

    // Пустые поля дополняем данными второй карточки
    for (const f of ['region', 'age', 'size', 'originator', 'name_ru', 'garden', 'genus_ru', 'species']) {
      if (!keeper[f] && donor[f]) keeper[f] = donor[f]
    }

    merges[String(donor._site_id)] = keeper._site_id
    removed.add(donor._site_id)
    console.log(`  ↳ ${donor._site_id} → ${keeper._site_id} (${keeper.latin_full})`)
  }

  // Записи дневника, ручные правки и ссылки «купить» — на оставшийся id
  const diary = readJson(diaryPath, { entries: [], nextId: 1 })
  let moved = 0
  for (const e of diary.entries || []) {
    const target = merges[String(e.plantId)]
    if (target) { e.plantId = target; moved++ }
  }
  if (moved) { writeFileSync(diaryPath, JSON.stringify(diary, null, 2)); console.log(`  Записей дневника перенесено: ${moved}`) }

  const overrides = readJson(overridesPath, null)
  if (overrides) {
    let n = 0
    for (const [from, to] of Object.entries(merges)) {
      if (overrides[from] && !overrides[String(to)]) { overrides[String(to)] = overrides[from]; n++ }
      delete overrides[from]
    }
    if (n) { writeFileSync(overridesPath, JSON.stringify(overrides, null, 2)); console.log(`  Ручных правок перенесено: ${n}`) }
  }

  const gardens = readJson(gardensPath, null)
  if (gardens?.plantBuyLinks) {
    let n = 0
    for (const [from, to] of Object.entries(merges)) {
      const link = gardens.plantBuyLinks[from]
      if (link) { gardens.plantBuyLinks[String(to)] = gardens.plantBuyLinks[String(to)] || link; delete gardens.plantBuyLinks[from]; n++ }
    }
    if (n) { writeFileSync(gardensPath, JSON.stringify(gardens, null, 2)); console.log(`  Ссылок «купить» перенесено: ${n}`) }
  }

  // Каталог без склеенных карточек
  const cleaned = catalog.filter(p => !removed.has(p._site_id))
  writeFileSync(catalogPath, JSON.stringify(cleaned))
  writeFileSync(mergesPath, JSON.stringify(merges, null, 2))
  console.log(`  Карточек осталось: ${cleaned.length} (убрано ${catalog.length - cleaned.length})`)
  console.log(`  Фото перенесено в дневник: ${archived}`)

  // Пересборка витрины
  console.log('🔧 Пересобираем каталог...')
  execSync('npx tsx scripts/enrich.ts', { cwd: ROOT, stdio: 'inherit' })
  const publicData = resolve(ROOT, 'public/data')
  if (!existsSync(publicData)) mkdirSync(publicData, { recursive: true })
  copyFileSync(resolve(DATA, 'catalog-enriched.json'), resolve(publicData, 'catalog-enriched.json'))
  copyFileSync(resolve(DATA, 'filters-enriched.json'), resolve(publicData, 'filters-enriched.json'))
  copyFileSync(mergesPath, resolve(publicData, 'plant-merges.json'))
  console.log('✅ Готово')
}

main().catch(err => { console.error('❌', err); process.exit(1) })
