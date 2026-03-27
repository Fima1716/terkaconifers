import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

export default defineEventHandler(() => {
  const urls: { loc: string; changefreq: string; priority: number }[] = []

  // Static pages
  urls.push(
    { loc: '/', changefreq: 'daily', priority: 1.0 },
    { loc: '/catalog', changefreq: 'daily', priority: 0.9 },
    { loc: '/articles', changefreq: 'weekly', priority: 0.6 },
    { loc: '/gardens', changefreq: 'weekly', priority: 0.6 },
    { loc: '/about', changefreq: 'monthly', priority: 0.4 },
    { loc: '/contacts', changefreq: 'monthly', priority: 0.4 },
    { loc: '/exchange', changefreq: 'weekly', priority: 0.5 },
  )

  // All plant pages
  const catalogPath = resolve(process.cwd(), 'data/catalog-enriched.json')
  if (existsSync(catalogPath)) {
    try {
      const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'))
      for (const plant of catalog) {
        urls.push({
          loc: `/plant/${plant.id}`,
          changefreq: 'monthly',
          priority: 0.7,
        })
      }
    } catch {}
  }

  // Articles
  const articlesPath = resolve(process.cwd(), 'data/articles.json')
  if (existsSync(articlesPath)) {
    try {
      const articles = JSON.parse(readFileSync(articlesPath, 'utf-8'))
      for (const article of articles) {
        urls.push({
          loc: `/articles/${article.id}`,
          changefreq: 'monthly',
          priority: 0.6,
        })
      }
    } catch {}
  }

  return urls
})
