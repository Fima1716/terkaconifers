import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

export default defineEventHandler(() => {
  const statePath = resolve(process.cwd(), 'data/sync-state.json')
  const catalogPath = resolve(process.cwd(), 'public/data/catalog-enriched.json')

  let lastSync = ''
  let totalSynced = 0

  if (existsSync(statePath)) {
    const state = JSON.parse(readFileSync(statePath, 'utf-8'))
    lastSync = state.last_sync || ''
    totalSynced = state.total_synced || 0
  }

  // Count plants with is_new flag
  let newCount = 0
  if (existsSync(catalogPath)) {
    const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'))
    newCount = catalog.filter((p: any) => p.is_new).length
  }

  return { last_sync: lastSync, total_synced: totalSynced, new_count: newCount }
})
