import { SignJWT, jwtVerify } from 'jose'
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import type { H3Event } from 'h3'

// ── Types ──────────────────────────────────────────────────
/**
 * super_admin — полный доступ, включая админ-панель
 * manager     — правит карточки растений и текст постов в MAX, без админ-панели
 * admin       — садовод: свои сады (атрибуция)
 */
export type Role = 'super_admin' | 'manager' | 'admin'

export const ROLES: Role[] = ['super_admin', 'manager', 'admin']

/** Роли с правом правки контента каталога (карточки + текст постов в MAX) */
export const CONTENT_ROLES: Role[] = ['super_admin', 'manager']

export function normalizeRole(role: unknown): Role {
  return ROLES.includes(role as Role) ? (role as Role) : 'admin'
}

export interface User {
  username: string
  displayName: string
  role: Role
  gardens: string[]          // assigned gardens (attribution, not restriction)
  passwordHash: string
  salt: string
  createdAt: string
  lastLogin: string
}

export interface UserPayload {
  sub: string
  role: Role
  gardens: string[]
}

export interface UserPublic {
  username: string
  displayName: string
  role: Role
  gardens: string[]
  createdAt: string
  lastLogin: string
}

// ── Config ─────────────────────────────────────────────────
const USERS_FILE = resolve(process.cwd(), 'data/users.json')
const JWT_SECRET_RAW = process.env.JWT_SECRET || 'terka-dev-secret-change-me-in-production'
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW)
const COOKIE_NAME = 'terka_auth'
const TOKEN_MAX_AGE = 7 * 24 * 60 * 60 // 7 days in seconds

// ── Password hashing ───────────────────────────────────────
export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return { hash, salt }
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const derived = scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  if (derived.length !== expected.length) return false
  return timingSafeEqual(derived, expected)
}

// ── Users storage ──────────────────────────────────────────
export function loadUsers(): User[] {
  if (!existsSync(USERS_FILE)) return []
  try {
    const data = JSON.parse(readFileSync(USERS_FILE, 'utf-8'))
    return data.users || []
  } catch { return [] }
}

export function saveUsers(users: User[]) {
  writeFileSync(USERS_FILE, JSON.stringify({ users }, null, 2))
}

export function findUser(username: string): User | undefined {
  return loadUsers().find(u => u.username === username)
}

export function toPublic(user: User): UserPublic {
  return {
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    gardens: user.gardens,
    createdAt: user.createdAt,
    lastLogin: user.lastLogin,
  }
}

// ── JWT ────────────────────────────────────────────────────
export async function signToken(user: User): Promise<string> {
  return new SignJWT({ sub: user.username, role: user.role, gardens: user.gardens })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_MAX_AGE}s`)
    .sign(JWT_SECRET)
}

export async function verifyToken(event: H3Event): Promise<UserPayload | null> {
  const cookie = getCookie(event, COOKIE_NAME)
  if (!cookie) return null
  try {
    const { payload } = await jwtVerify(cookie, JWT_SECRET)
    return {
      sub: payload.sub as string,
      role: normalizeRole(payload.role),
      gardens: (payload.gardens as string[]) || [],
    }
  } catch {
    return null
  }
}

/**
 * Требует авторизацию. `required` — роль или список ролей;
 * super_admin проходит любую проверку.
 */
export async function requireAuth(event: H3Event, required?: Role | Role[]): Promise<UserPayload> {
  const payload = await verifyToken(event)
  if (!payload) throw createError({ statusCode: 401, message: 'Не авторизован' })
  if (required) {
    const allowed = Array.isArray(required) ? required : [required]
    if (payload.role !== 'super_admin' && !allowed.includes(payload.role)) {
      throw createError({ statusCode: 403, message: 'Недостаточно прав' })
    }
  }
  return payload
}

/** Доступ для редакторов контента: суперадмины и менеджеры */
export async function requireContentEditor(event: H3Event): Promise<UserPayload> {
  return requireAuth(event, CONTENT_ROLES)
}

// ── Cookie helpers ─────────────────────────────────────────
export function setAuthCookie(event: H3Event, token: string) {
  setCookie(event, COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: TOKEN_MAX_AGE,
  })
}

export function clearAuthCookie(event: H3Event) {
  deleteCookie(event, COOKIE_NAME, { path: '/' })
}

// ── Rate limiting (in-memory) ──────────────────────────────
const loginAttempts = new Map<string, { count: number; resetAt: number }>()

export function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = loginAttempts.get(ip)
  if (entry && now < entry.resetAt) {
    if (entry.count >= 5) return false
    entry.count++
    return true
  }
  loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 })
  return true
}

export function resetRateLimit(ip: string) {
  loginAttempts.delete(ip)
}
