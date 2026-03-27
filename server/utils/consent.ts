import { readFileSync, existsSync, statSync } from 'fs'
import { resolve } from 'path'

const GARDENS_PATH = resolve(process.cwd(), 'data/gardens.json')

/**
 * Returns the set of consented garden names, or null if consent system is not active
 * (i.e., no gardens have any consent flag set).
 */
export function getConsentedGardens(): Set<string> | null {
  if (!existsSync(GARDENS_PATH)) return null
  try {
    const data = JSON.parse(readFileSync(GARDENS_PATH, 'utf-8'))
    const gardens = data.gardens || {}
    const hasAnyConsentField = Object.values(gardens).some((g: any) => typeof g.consent === 'boolean')
    if (!hasAnyConsentField) return null
    const consented = new Set<string>()
    for (const [name, profile] of Object.entries(gardens)) {
      if ((profile as any).consent === true) consented.add(name)
    }
    return consented
  } catch { return null }
}

export function getGardensMtime(): number {
  if (!existsSync(GARDENS_PATH)) return 0
  try {
    return statSync(GARDENS_PATH).mtimeMs
  } catch { return 0 }
}
