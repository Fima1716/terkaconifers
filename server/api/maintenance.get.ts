import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const FILE = resolve(process.cwd(), 'data/maintenance.json')

export default defineEventHandler(() => {
  let manual = { enabled: false, message: '' }
  if (existsSync(FILE)) {
    try { manual = JSON.parse(readFileSync(FILE, 'utf-8')) } catch {}
  }

  // If manually enabled — return as-is
  if (manual.enabled) return manual

  // Auto-maintenance: if consent system is active but 0 gardens are consented
  const consented = getConsentedGardens()
  if (consented && consented.size === 0) {
    return {
      enabled: true,
      message: manual.message || 'Сайт временно закрыт. Пожалуйста, зайдите позже.',
      auto: true,
    }
  }

  return manual
})
