import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export default defineEventHandler(async () => {
  // Find rusadovich directory relative to terka
  const paths = [
    '/var/www/rusadovich',         // production
    process.cwd() + '/rusinovich', // local dev
  ]

  let cwd = ''
  for (const p of paths) {
    try {
      const { existsSync } = await import('fs')
      if (existsSync(p + '/src/catalog.ts')) { cwd = p; break }
    } catch {}
  }

  if (!cwd) {
    throw createError({ statusCode: 500, message: 'Rusadovich directory not found' })
  }

  try {
    const { stdout, stderr } = await execAsync(
      `npx tsx -e "import { syncCatalog } from './src/catalog.ts'; syncCatalog().then(items => { console.log(JSON.stringify({ total: items.length, inStock: items.filter(i => i.inStock).length })); process.exit(0); });"`,
      { cwd, timeout: 120_000 }
    )

    // Parse result from last line of stdout
    const lines = stdout.trim().split('\n')
    const lastLine = lines[lines.length - 1]
    try {
      const result = JSON.parse(lastLine)
      return { ok: true, ...result, logs: lines.slice(0, -1).join('\n') }
    } catch {
      return { ok: true, logs: stdout }
    }
  } catch (err: any) {
    throw createError({ statusCode: 500, message: err.message || 'Sync failed' })
  }
})
