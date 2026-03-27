import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const PHOTO_DIR = resolve(process.cwd(), 'data/team')

const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
}

export default defineEventHandler((event) => {
  const name = getRouterParam(event, 'name')
  if (!name || name.includes('..') || name.includes('/')) {
    throw createError({ statusCode: 400, message: 'Invalid name' })
  }
  const filePath = resolve(PHOTO_DIR, name)
  if (!existsSync(filePath)) throw createError({ statusCode: 404, message: 'Not found' })

  const ext = name.split('.').pop()?.toLowerCase() || ''
  setHeader(event, 'Content-Type', MIME[ext] || 'application/octet-stream')
  setHeader(event, 'Cache-Control', 'public, max-age=86400')
  return readFileSync(filePath)
})
