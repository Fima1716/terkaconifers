import { readFileSync, existsSync, statSync } from 'fs'
import { resolve } from 'path'

export default defineEventHandler(async (event) => {
  await requireAuth(event, 'super_admin')

  const cwd = process.cwd()

  // Catalog stats
  let catalogCount = 0, newCount = 0, genera: Record<string, number> = {}
  const catPath = resolve(cwd, 'public/data/catalog-enriched.json')
  if (existsSync(catPath)) {
    const catalog = JSON.parse(readFileSync(catPath, 'utf-8'))
    catalogCount = catalog.length
    newCount = catalog.filter((p: any) => p.is_new).length
    for (const p of catalog) {
      genera[p.genus_ru || p.genus] = (genera[p.genus_ru || p.genus] || 0) + 1
    }
  }

  // Sync state
  const statePath = resolve(cwd, 'data/sync-state.json')
  let syncState = { last_sync: '', total_synced: 0 }
  if (existsSync(statePath)) {
    syncState = JSON.parse(readFileSync(statePath, 'utf-8'))
  }

  // Prices
  const pricesPath = resolve(cwd, 'public/data/prices.json')
  let pricesCount = 0, inStockCount = 0
  if (existsSync(pricesPath)) {
    const prices = JSON.parse(readFileSync(pricesPath, 'utf-8'))
    const items = prices.items || {}
    pricesCount = Object.keys(items).length
    inStockCount = Object.values(items).filter((v: any) => v.status === 'in_stock').length
  }

  // Banner
  const bannerPath = resolve(cwd, 'public/banner/config.json')
  let bannerEnabled = false, bannerSlides = 0
  if (existsSync(bannerPath)) {
    const banner = JSON.parse(readFileSync(bannerPath, 'utf-8'))
    bannerEnabled = banner.enabled
    bannerSlides = (banner.slides || []).length
  }

  // Catalog file size & modified
  let catalogSize = 0, catalogModified = ''
  if (existsSync(catPath)) {
    const stat = statSync(catPath)
    catalogSize = Math.round(stat.size / 1024)
    catalogModified = stat.mtime.toISOString()
  }

  // Sync log (last 20 lines)
  const logPath = resolve(cwd, 'logs/sync.log')
  let recentLogs: string[] = []
  if (existsSync(logPath)) {
    const lines = readFileSync(logPath, 'utf-8').trim().split('\n')
    recentLogs = lines.slice(-30)
  }

  return {
    catalog: { count: catalogCount, newCount, genera, sizeKB: catalogSize, modified: catalogModified },
    sync: syncState,
    prices: { count: pricesCount, inStock: inStockCount },
    banner: { enabled: bannerEnabled, slides: bannerSlides },
    logs: recentLogs,
  }
})
