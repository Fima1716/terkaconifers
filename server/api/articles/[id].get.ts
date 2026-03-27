import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { createError } from 'h3'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  const path = resolve(process.cwd(), 'data/articles.json')
  if (!existsSync(path)) throw createError({ statusCode: 404, message: 'Not found' })

  const articles = JSON.parse(readFileSync(path, 'utf-8'))
  const article = articles.find((a: any) => String(a.id) === id)
  if (!article) throw createError({ statusCode: 404, message: 'Not found' })

  return article
})
