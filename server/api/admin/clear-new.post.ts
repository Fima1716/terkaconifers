import { execSync } from 'child_process'
import { resolve } from 'path'

export default defineEventHandler(async (event) => {
  await requireAuth(event, 'super_admin')

  const body = await readBody(event)
  const days = body?.days || 0 // 0 = clear all

  try {
    const output = execSync(
      `npx tsx scripts/clear-new.ts --days ${days}`,
      { cwd: resolve(process.cwd()), timeout: 30000, encoding: 'utf-8' }
    )

    // Re-enrich
    execSync('npx tsx scripts/enrich.ts', { cwd: resolve(process.cwd()), timeout: 60000, encoding: 'utf-8' })

    // Copy
    const { copyFileSync } = require('fs')
    const root = resolve(process.cwd())
    copyFileSync(resolve(root, 'data/catalog-enriched.json'), resolve(root, 'public/data/catalog-enriched.json'))
    copyFileSync(resolve(root, 'data/filters-enriched.json'), resolve(root, 'public/data/filters-enriched.json'))

    return { ok: true, output }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
})
