import { readMultipartFormData } from 'h3'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve } from 'path'

const BANNER_DIR = resolve(process.cwd(), 'data/banner')

export default defineEventHandler(async (event) => {
  await requireAuth(event, 'super_admin')

  const formData = await readMultipartFormData(event)
  if (!formData) throw createError({ statusCode: 400, message: 'No data' })

  if (!existsSync(BANNER_DIR)) mkdirSync(BANNER_DIR, { recursive: true })

  for (const field of formData) {
    if (field.name === 'file' && field.filename && field.data.length > 0) {
      const ext = field.filename.split('.').pop() || 'png'
      const name = `el-${Date.now()}.${ext}`
      writeFileSync(resolve(BANNER_DIR, name), field.data)
      return { ok: true, filename: name }
    }
  }

  throw createError({ statusCode: 400, message: 'No file' })
})
