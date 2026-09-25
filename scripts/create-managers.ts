/**
 * Пакетное создание менеджерских аккаунтов.
 *
 * Менеджер видит «Менеджерскую» (/manage) — правку карточек растений и текста
 * постов в MAX. Админ-панель (/admin) для него закрыта.
 *
 * Usage:
 *   npx tsx scripts/create-managers.ts <username>[:Имя] ...
 *   npx tsx scripts/create-managers.ts --file managers.txt
 *   npx tsx scripts/create-managers.ts --reset ivan petr   # перевыдать пароли
 *
 * В файле — по одному аккаунту на строку, формат тот же: `username:Имя`.
 * Пароли генерируются и печатаются один раз — сохраните вывод.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { randomBytes, randomInt, scryptSync } from 'crypto'

const ROOT = resolve(import.meta.dirname, '..')
const USERS_FILE = resolve(ROOT, 'data/users.json')

// Без похожих символов (0/O, 1/l/I) — пароли передаются голосом и в мессенджерах
const PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789'

function generatePassword(length = 10): string {
  let out = ''
  for (let i = 0; i < length; i++) out += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)]
  return out
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return { hash, salt }
}

// ── Разбор аргументов ───────────────────────────────────────
const args = process.argv.slice(2)
const entries: string[] = []
let reset = false
let filePath = ''

for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--reset') reset = true
  else if (a === '--file') filePath = args[++i] || ''
  else entries.push(a)
}

if (filePath) {
  if (!existsSync(resolve(filePath))) {
    console.error(`Файл не найден: ${filePath}`)
    process.exit(1)
  }
  for (const line of readFileSync(resolve(filePath), 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) entries.push(trimmed)
  }
}

if (!entries.length) {
  console.error('Usage: npx tsx scripts/create-managers.ts <username>[:Имя] ... | --file <path> [--reset]')
  process.exit(1)
}

// ── Загрузка пользователей ──────────────────────────────────
let users: any[] = []
if (existsSync(USERS_FILE)) {
  try { users = JSON.parse(readFileSync(USERS_FILE, 'utf-8')).users || [] } catch {}
}

const created: Array<{ username: string; displayName: string; password: string; action: string }> = []
const skipped: string[] = []

for (const entry of entries) {
  const sep = entry.indexOf(':')
  const username = (sep >= 0 ? entry.slice(0, sep) : entry).trim()
  const displayName = (sep >= 0 ? entry.slice(sep + 1) : '').trim() || username

  if (!/^[a-zA-Z0-9_]{2,30}$/.test(username)) {
    console.error(`  ✗ ${username || entry}: username — 2-30 символов, латиница, цифры, _`)
    skipped.push(username || entry)
    continue
  }

  const existing = users.find(u => u.username === username)
  if (existing && !reset) {
    console.error(`  ✗ ${username}: уже существует (--reset — перевыдать пароль)`)
    skipped.push(username)
    continue
  }

  const password = generatePassword()
  const { hash, salt } = hashPassword(password)

  if (existing) {
    existing.role = 'manager'
    existing.displayName = displayName
    existing.passwordHash = hash
    existing.salt = salt
    created.push({ username, displayName, password, action: 'пароль обновлён' })
  } else {
    users.push({
      username,
      displayName,
      role: 'manager',
      gardens: [],
      passwordHash: hash,
      salt,
      createdAt: new Date().toISOString(),
      lastLogin: '',
    })
    created.push({ username, displayName, password, action: 'создан' })
  }
}

if (!created.length) {
  console.error('\nНичего не создано.')
  process.exit(1)
}

writeFileSync(USERS_FILE, JSON.stringify({ users }, null, 2))

// ── Вывод учётных данных ────────────────────────────────────
const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length))
const userCol = Math.max(8, ...created.map(c => c.username.length))
const nameCol = Math.max(4, ...created.map(c => c.displayName.length))

console.log(`\n✅ Менеджеров: ${created.length}${skipped.length ? `, пропущено: ${skipped.length}` : ''}\n`)
console.log(`${pad('Логин', userCol)}  ${pad('Имя', nameCol)}  Пароль`)
console.log('─'.repeat(userCol + nameCol + 14))
for (const c of created) {
  console.log(`${pad(c.username, userCol)}  ${pad(c.displayName, nameCol)}  ${c.password}  (${c.action})`)
}
console.log('\nПароли больше не будут показаны — сохраните вывод.')
console.log('Вход: /login → откроется «Менеджерская» (/manage).')
