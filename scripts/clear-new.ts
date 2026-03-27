/**
 * Clears `is_new` flag from plants older than N days.
 * Usage: npx tsx scripts/clear-new.ts [--days 7]
 */
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(import.meta.dirname, '..')
const CATALOG_PATH = resolve(ROOT, 'data/raw/catalog.json')

const days = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--days') || '7')

const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'))
const cutoff = new Date()
cutoff.setDate(cutoff.getDate() - days)

let cleared = 0
for (const plant of catalog) {
  if (!plant.is_new) continue
  // Parse date DD.MM.YYYY
  const [d, m, y] = (plant.date || '').split('.')
  if (d && m && y) {
    const plantDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
    if (plantDate < cutoff) {
      plant.is_new = false
      cleared++
    }
  }
}

if (cleared > 0) {
  writeFileSync(CATALOG_PATH, JSON.stringify(catalog))
  console.log(`Cleared is_new from ${cleared} plants (older than ${days} days)`)
} else {
  console.log('No plants to clear')
}
