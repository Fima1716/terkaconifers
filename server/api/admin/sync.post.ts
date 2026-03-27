import { spawn } from 'child_process'
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const PROGRESS_FILE = resolve(process.cwd(), 'data/sync-progress.json')

function saveProgress(data: any) {
  writeFileSync(PROGRESS_FILE, JSON.stringify(data))
}

export default defineEventHandler(async (event) => {
  await requireAuth(event, 'super_admin')

  const body = await readBody(event)
  const token = body?.token || process.env.MAX_BOT_TOKEN || ''
  const chatId = body?.chatId || process.env.MAX_CHAT_ID || '-71324192443065'

  if (!token) throw createError({ statusCode: 400, message: 'Нужен токен бота MAX' })

  // Init progress
  saveProgress({ status: 'running', percent: 0, message: 'Запуск...', started: Date.now(), lines: [] })

  const cwd = resolve(process.cwd())
  const lines: string[] = []

  return new Promise((resolveHandler) => {
    const proc = spawn('npx', ['tsx', 'scripts/sync-max.ts', '--token', token, '--chat-id', chatId], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' },
    })

    // Structured results collected during sync
    const results = {
      added: 0, updated: 0, relinked: 0, total: 0,
      updatedPlants: [] as string[],
      relinkedPlants: [] as string[],
      newPlants: [] as string[],
      messagesTotal: 0,
    }

    function parseLine(line: string) {
      lines.push(line)
      if (lines.length > 50) lines.shift()

      let percent = 0
      let message = line

      // Progress tracking
      if (line.includes('Fetching messages')) { percent = 5; message = 'Загрузка сообщений из MAX...' }
      else if (line.includes('Fetched page')) {
        const match = line.match(/total: (\d+)/)
        const total = match ? parseInt(match[1]) : 0
        results.messagesTotal = total
        percent = Math.min(80, Math.round(5 + (total / 2400) * 70))
        message = `Загружено ${total} сообщений...`
      }
      else if (line.includes('Results')) { percent = 85; message = 'Обработка результатов...' }
      else if (line.includes('Running enrichment')) { percent = 90; message = 'Пересборка каталога...' }
      else if (line.includes('Updated public')) { percent = 95; message = 'Обновление данных сайта...' }
      else if (line.includes('Sync complete')) { percent = 100; message = 'Готово!' }

      // Parse structured results
      if (line.includes('New plants added:')) results.added = parseInt(line.match(/added: (\d+)/)?.[1] || '0')
      if (line.includes('Plants updated:')) results.updated = parseInt(line.match(/updated: (\d+)/)?.[1] || '0')
      if (line.includes('Total catalog now:')) results.total = parseInt(line.match(/now: (\d+)/)?.[1] || '0')
      if (line.includes('♻ Updated with newer photos:')) results.updatedPlants.push(line.replace(/.*♻ Updated with newer photos: /, ''))
      if (line.includes('~ Updated:')) results.updatedPlants.push(line.replace(/.*~ Updated: /, ''))
      if (line.includes('🔗 Re-linked')) results.relinkedPlants.push(line.replace(/.*🔗 Re-linked.*?: /, ''))
      if (line.includes('Re-linked') && line.includes('entries')) results.relinked = parseInt(line.match(/Re-linked (\d+)/)?.[1] || '0')
      if (line.includes('+ New:')) results.newPlants.push(line.replace(/.*\+ New: /, ''))

      if (percent > 0) {
        saveProgress({ status: 'running', percent, message, started: Date.now(), lines: lines.slice(-20), results })
      }
    }

    proc.stdout.on('data', (data: Buffer) => {
      data.toString().split('\n').filter(Boolean).forEach(parseLine)
    })

    proc.stderr.on('data', (data: Buffer) => {
      data.toString().split('\n').filter(Boolean).forEach(l => lines.push(`[err] ${l}`))
    })

    proc.on('close', (code) => {
      const finalStatus = code === 0 ? 'done' : 'error'
      saveProgress({ status: finalStatus, percent: 100, message: code === 0 ? 'Синхронизация завершена' : 'Ошибка синхронизации', lines: lines.slice(-30), results })
      resolveHandler({ ok: code === 0, output: lines.join('\n'), results })
    })

    // Timeout 2 min
    setTimeout(() => {
      proc.kill()
      saveProgress({ status: 'error', percent: 0, message: 'Таймаут (2 мин)', lines })
      resolveHandler({ ok: false, output: 'Timeout' })
    }, 120000)
  })
})
