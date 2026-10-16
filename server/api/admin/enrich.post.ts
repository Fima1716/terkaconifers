import { execSync } from 'child_process'
import { copyFileSync } from 'fs'
import { resolve } from 'path'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event, 'super_admin')

  const root = resolve(process.cwd())

  try {
    const output = execSync('npx tsx scripts/enrich.ts', { cwd: root, timeout: 60000, encoding: 'utf-8' })
    copyFileSync(resolve(root, 'data/catalog-enriched.json'), resolve(root, 'public/data/catalog-enriched.json'))
    copyFileSync(resolve(root, 'data/filters-enriched.json'), resolve(root, 'public/data/filters-enriched.json'))
    logFor(event, user, 'enrich.run', { ok: true })
    return { ok: true, output }
  } catch (err: any) {
    logFor(event, user, 'enrich.run', { ok: false, note: String(err.message).slice(0, 200) })
    return { ok: false, error: err.message }
  }
})
