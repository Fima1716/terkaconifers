/**
 * Garden auth: 6-digit codes (from bot) + cookie sessions (for site)
 * Zero personal data — only maps: code→garden, sessionToken→garden
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { randomBytes } from 'crypto'
import type { H3Event } from 'h3'

const DATA_DIR = resolve(process.cwd(), 'data')
const CODES_PATH = resolve(DATA_DIR, 'garden-codes.json')
const SESSIONS_PATH = resolve(DATA_DIR, 'garden-sessions.json')

const CODE_TTL = 15 * 60 * 1000  // 15 minutes
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000  // 30 days
const COOKIE_NAME = 'terka-garden'

interface GardenCode {
  code: string
  garden: string
  expiresAt: number
}

interface GardenSession {
  token: string
  garden: string
  createdAt: number
  expiresAt: number
}

// ── Codes (bot generates, site verifies) ──────────────────

function loadCodes(): GardenCode[] {
  if (!existsSync(CODES_PATH)) return []
  try { return JSON.parse(readFileSync(CODES_PATH, 'utf-8')) } catch { return [] }
}

function saveCodes(codes: GardenCode[]) {
  writeFileSync(CODES_PATH, JSON.stringify(codes, null, 2))
}

/** Generate a 6-digit code for a garden. Called by the bot. */
export function generateGardenCode(garden: string): string {
  const codes = loadCodes().filter(c => c.expiresAt > Date.now()) // prune expired
  // Remove any existing code for this garden
  const filtered = codes.filter(c => c.garden !== garden)
  const code = String(Math.floor(100000 + Math.random() * 900000))
  filtered.push({ code, garden, expiresAt: Date.now() + CODE_TTL })
  saveCodes(filtered)
  return code
}

/** Verify a 6-digit code. Returns garden name or null. */
export function verifyGardenCode(code: string): string | null {
  const codes = loadCodes()
  const match = codes.find(c => c.code === code && c.expiresAt > Date.now())
  if (!match) return null
  // Remove used code
  saveCodes(codes.filter(c => c.code !== code))
  return match.garden
}

// ── Sessions (site creates after code verification) ───────

function loadSessions(): GardenSession[] {
  if (!existsSync(SESSIONS_PATH)) return []
  try { return JSON.parse(readFileSync(SESSIONS_PATH, 'utf-8')) } catch { return [] }
}

function saveSessions(sessions: GardenSession[]) {
  writeFileSync(SESSIONS_PATH, JSON.stringify(sessions, null, 2))
}

/** Create a session for a garden. Returns the token to set in cookie. */
export function createGardenSession(garden: string): string {
  const sessions = loadSessions().filter(s => s.expiresAt > Date.now()) // prune
  const token = randomBytes(24).toString('hex')
  sessions.push({ token, garden, createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL })
  saveSessions(sessions)
  return token
}

/** Look up garden from session token. Returns garden name or null. */
function findSession(token: string): string | null {
  const sessions = loadSessions()
  const match = sessions.find(s => s.token === token && s.expiresAt > Date.now())
  return match?.garden || null
}

// ── Cookie helpers ────────────────────────────────────────

export function setGardenCookie(event: H3Event, token: string) {
  setCookie(event, COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60, // 30 days
    path: '/',
  })
}

export function clearGardenCookie(event: H3Event) {
  setCookie(event, COOKIE_NAME, '', { maxAge: 0, path: '/' })
}

/** Get garden name from cookie. Returns null if no valid session. */
export function getGardenFromCookie(event: H3Event): string | null {
  const token = getCookie(event, COOKIE_NAME)
  if (!token) return null
  return findSession(token)
}

// ── Unified access check for garden APIs ──────────────────

export interface GardenAccess {
  storageKey: string   // key for loadGarden/saveGarden
  isAdmin: boolean
  garden: string       // garden display name (for owners)
}

/**
 * Check if request has garden access via JWT (admin) or garden cookie (owner).
 * Throws 401 if neither.
 */
export async function requireGardenAccess(event: H3Event): Promise<GardenAccess> {
  // Try JWT first (admin)
  try {
    const user = await requireAuth(event, 'super_admin')
    return { storageKey: user.sub, isAdmin: true, garden: '' }
  } catch {}

  // Try garden cookie (owner)
  const garden = getGardenFromCookie(event)
  if (garden) {
    const slug = garden.replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, '_')
    return { storageKey: `g_${slug}`, isAdmin: false, garden }
  }

  throw createError({ statusCode: 401, message: 'Требуется авторизация' })
}
