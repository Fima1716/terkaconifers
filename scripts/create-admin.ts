/**
 * Create a super_admin user from command line.
 * Usage: npx tsx scripts/create-admin.ts <username> <password> [displayName]
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { randomBytes, scryptSync } from 'crypto'

const ROOT = resolve(import.meta.dirname, '..')
const USERS_FILE = resolve(ROOT, 'data/users.json')

const [,, username, password, displayName] = process.argv

if (!username || !password) {
  console.error('Usage: npx tsx scripts/create-admin.ts <username> <password> [displayName]')
  process.exit(1)
}

// Load existing users
let users: any[] = []
if (existsSync(USERS_FILE)) {
  try { users = JSON.parse(readFileSync(USERS_FILE, 'utf-8')).users || [] } catch {}
}

// Check for duplicate
if (users.find((u: any) => u.username === username)) {
  console.error(`User "${username}" already exists`)
  process.exit(1)
}

// Hash password
const salt = randomBytes(16).toString('hex')
const hash = scryptSync(password, salt, 64).toString('hex')

// Create user
const user = {
  username,
  displayName: displayName || username,
  role: 'super_admin',
  gardens: [],
  passwordHash: hash,
  salt,
  createdAt: new Date().toISOString(),
  lastLogin: '',
}

users.push(user)
writeFileSync(USERS_FILE, JSON.stringify({ users }, null, 2))
console.log(`✅ Super admin "${username}" created successfully`)
