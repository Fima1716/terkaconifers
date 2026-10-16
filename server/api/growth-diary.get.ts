import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const DATA_PATH = resolve(process.cwd(), 'data/growth-diary.json')
const UPLOAD_DIR = resolve(process.cwd(), 'data/uploads/growth')

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const plantId = parseInt(String(query.plantId || '0'))

  if (!existsSync(DATA_PATH)) return { entries: [] }
  const data = JSON.parse(readFileSync(DATA_PATH, 'utf-8'))

  let entries = data.entries || []
  if (plantId) entries = entries.filter((e: any) => e.plantId === plantId)

  // Пропускаем записи, у которых файла больше нет: в ленте они выглядели
  // как битая картинка (одна такая осталась с весны)
  entries = entries.filter((e: any) => {
    if (!e.photoFilename || /[\/\\]/.test(e.photoFilename)) return false
    return existsSync(resolve(UPLOAD_DIR, e.photoFilename))
      || existsSync(resolve(process.cwd(), 'public/uploads/growth', e.photoFilename))
  })

  // Sort by year ascending
  entries.sort((a: any, b: any) => a.year - b.year)
  return { entries }
})
