import { createError } from 'h3'
import { readFileSync, existsSync } from 'fs'
import { resolve, extname } from 'path'

const UPLOAD_DIR = resolve(process.cwd(), 'data/uploads/growth')

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

export default defineEventHandler((event) => {
  const filename = getRouterParam(event, 'filename') || ''

  // Sanitize: only allow simple filenames
  if (!filename || /[\/\\]/.test(filename)) {
    throw createError({ statusCode: 400, message: 'Invalid filename' })
  }

  const filePath = resolve(UPLOAD_DIR, filename)

  // Also check old location for backwards compatibility
  const oldPath = resolve(process.cwd(), 'public/uploads/growth', filename)
  const actualPath = existsSync(filePath) ? filePath : existsSync(oldPath) ? oldPath : null

  if (!actualPath) {
    throw createError({ statusCode: 404, message: 'Photo not found' })
  }

  const ext = extname(filename).toLowerCase()
  setHeader(event, 'Content-Type', MIME[ext] || 'image/jpeg')
  setHeader(event, 'Cache-Control', 'public, max-age=31536000')

  return readFileSync(actualPath)
})
