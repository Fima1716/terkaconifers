import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve } from 'path'
import { randomUUID } from 'crypto'

// ── Plant ────────────────────────────────────────────────
export interface GardenPlant {
  id: string
  catalogId: number | null
  nickname: string
  status: 'growing' | 'sleeping' | 'sick' | 'dead'
  zone: string
  plantedAt: string
  source: string
  pricePaid: number | null
  notes: string
  createdAt: string
  updatedAt: string
  manualName: string
  manualSpecies: string
}

// ── Events ───────────────────────────────────────────────
export type EventType = 'photo' | 'measurement' | 'watering' | 'fertilizing' | 'pruning' | 'treatment' | 'problem' | 'note'

export interface GardenEvent {
  id: string
  plantId: string
  type: EventType
  date: string          // YYYY-MM-DD
  // Measurement
  height?: number       // cm
  width?: number        // cm
  trunkDiameter?: number // mm
  // Treatment / Fertilizing
  product?: string
  dosage?: string
  // Problem
  problemType?: string  // disease / pest / frost / other
  severity?: 'low' | 'medium' | 'high'
  // Photo
  photoUrl?: string
  // General
  text?: string
  createdAt: string
}

// ── Care Schedules ───────────────────────────────────────
export type ScheduleType = 'watering' | 'fertilizing' | 'pruning' | 'treatment' | 'measurement' | 'custom'

export interface CareSchedule {
  id: string
  plantId: string       // references GardenPlant.id
  type: ScheduleType
  name: string
  intervalDays: number
  lastDone: string | null  // ISO date
  nextDue: string | null   // ISO date (calculated)
  notes: string
  active: boolean
  createdAt: string
}

// ── Zones ────────────────────────────────────────────────
export interface GardenZone {
  id: string
  name: string
  description: string
  light?: 'sun' | 'partial' | 'shade'
  moisture?: 'dry' | 'moderate' | 'wet'
  soil?: string
  createdAt: string
}

// ── Data structure ───────────────────────────────────────
interface GardenData {
  plants: GardenPlant[]
  events: GardenEvent[]
  schedules: CareSchedule[]
  zones: GardenZone[]
}

const GARDEN_DIR = resolve(process.cwd(), 'data/my-garden')
const CATALOG_PATH = resolve(process.cwd(), 'data/catalog-enriched.json')

function ensureDir() {
  if (!existsSync(GARDEN_DIR)) mkdirSync(GARDEN_DIR, { recursive: true })
}

function filePath(username: string) {
  // Allow Cyrillic in garden-prefixed keys (g_Русинов_Сад)
  if (username.startsWith('g_')) {
    const safe = username.replace(/[\/\\:*?"<>|]/g, '_')
    return resolve(GARDEN_DIR, `${safe}.json`)
  }
  const safe = username.replace(/[^a-zA-Z0-9_-]/g, '_')
  return resolve(GARDEN_DIR, `${safe}.json`)
}

/** Load catalog plants for a specific garden, mapped to GardenPlant format */
export function loadCatalogPlantsForGarden(gardenName: string): GardenPlant[] {
  if (!existsSync(CATALOG_PATH)) return []
  try {
    const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8'))
    return catalog
      .filter((p: any) => p.garden_display === gardenName)
      .map((p: any): GardenPlant => ({
        id: String(p.id),
        catalogId: p.id,
        nickname: '',
        status: 'growing',
        zone: '',
        plantedAt: '',
        source: '',
        pricePaid: null,
        notes: '',
        createdAt: '',
        updatedAt: '',
        manualName: p.latin_full || '',
        manualSpecies: p.species_ru || '',
      }))
  } catch { return [] }
}

function defaults(): GardenData {
  return { plants: [], events: [], schedules: [], zones: [] }
}

export function loadGarden(username: string): GardenData {
  ensureDir()
  const path = filePath(username)
  if (!existsSync(path)) return defaults()
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    return { ...defaults(), ...raw }
  } catch {
    return defaults()
  }
}

export function saveGarden(username: string, data: GardenData) {
  ensureDir()
  writeFileSync(filePath(username), JSON.stringify(data, null, 2))
}

function uid() { return randomUUID() }
function now() { return new Date().toISOString() }

// ── Plants CRUD ──────────────────────────────────────────
export function addGardenPlant(
  username: string,
  input: Omit<GardenPlant, 'id' | 'createdAt' | 'updatedAt'>,
): GardenPlant {
  const garden = loadGarden(username)
  const plant: GardenPlant = { ...input, id: uid(), createdAt: now(), updatedAt: now() }
  garden.plants.push(plant)
  saveGarden(username, garden)
  return plant
}

export function updateGardenPlant(
  username: string, id: string, updates: Partial<GardenPlant>,
): GardenPlant | null {
  const garden = loadGarden(username)
  const idx = garden.plants.findIndex(p => p.id === id)
  if (idx === -1) return null
  const existing = garden.plants[idx]
  garden.plants[idx] = { ...existing, ...updates, id: existing.id, createdAt: existing.createdAt, updatedAt: now() }
  saveGarden(username, garden)
  return garden.plants[idx]
}

export function deleteGardenPlant(username: string, id: string): boolean {
  const garden = loadGarden(username)
  const len = garden.plants.length
  garden.plants = garden.plants.filter(p => p.id !== id)
  if (garden.plants.length === len) return false
  // Also remove related events and schedules
  garden.events = garden.events.filter(e => e.plantId !== id)
  garden.schedules = garden.schedules.filter(s => s.plantId !== id)
  saveGarden(username, garden)
  return true
}

// ── Events CRUD ──────────────────────────────────────────
export function addGardenEvent(
  username: string,
  input: Omit<GardenEvent, 'id' | 'createdAt'>,
): GardenEvent {
  const garden = loadGarden(username)
  const event: GardenEvent = { ...input, id: uid(), createdAt: now() }
  garden.events.push(event)
  saveGarden(username, garden)
  return event
}

export function getPlantEvents(username: string, plantId: string): GardenEvent[] {
  const garden = loadGarden(username)
  return garden.events
    .filter(e => e.plantId === plantId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
}

export function deleteGardenEvent(username: string, id: string): boolean {
  const garden = loadGarden(username)
  const len = garden.events.length
  garden.events = garden.events.filter(e => e.id !== id)
  if (garden.events.length === len) return false
  saveGarden(username, garden)
  return true
}

// ── Schedules CRUD ───────────────────────────────────────
function calcNextDue(lastDone: string | null, intervalDays: number): string {
  const base = lastDone ? new Date(lastDone) : new Date()
  base.setDate(base.getDate() + intervalDays)
  return base.toISOString().slice(0, 10)
}

export function addCareSchedule(
  username: string,
  input: Omit<CareSchedule, 'id' | 'nextDue' | 'createdAt'>,
): CareSchedule {
  const garden = loadGarden(username)
  const schedule: CareSchedule = {
    ...input,
    id: uid(),
    nextDue: calcNextDue(input.lastDone, input.intervalDays),
    createdAt: now(),
  }
  garden.schedules.push(schedule)
  saveGarden(username, garden)
  return schedule
}

export function markScheduleDone(username: string, id: string): CareSchedule | null {
  const garden = loadGarden(username)
  const idx = garden.schedules.findIndex(s => s.id === id)
  if (idx === -1) return null
  const today = new Date().toISOString().slice(0, 10)
  garden.schedules[idx].lastDone = today
  garden.schedules[idx].nextDue = calcNextDue(today, garden.schedules[idx].intervalDays)
  saveGarden(username, garden)
  return garden.schedules[idx]
}

export function updateCareSchedule(
  username: string, id: string, updates: Partial<CareSchedule>,
): CareSchedule | null {
  const garden = loadGarden(username)
  const idx = garden.schedules.findIndex(s => s.id === id)
  if (idx === -1) return null
  const existing = garden.schedules[idx]
  garden.schedules[idx] = { ...existing, ...updates, id: existing.id, createdAt: existing.createdAt }
  if (updates.intervalDays || updates.lastDone !== undefined) {
    garden.schedules[idx].nextDue = calcNextDue(garden.schedules[idx].lastDone, garden.schedules[idx].intervalDays)
  }
  saveGarden(username, garden)
  return garden.schedules[idx]
}

export function deleteCareSchedule(username: string, id: string): boolean {
  const garden = loadGarden(username)
  const len = garden.schedules.length
  garden.schedules = garden.schedules.filter(s => s.id !== id)
  if (garden.schedules.length === len) return false
  saveGarden(username, garden)
  return true
}

// ── Zones CRUD ───────────────────────────────────────────
export function addGardenZone(
  username: string,
  input: Omit<GardenZone, 'id' | 'createdAt'>,
): GardenZone {
  const garden = loadGarden(username)
  const zone: GardenZone = { ...input, id: uid(), createdAt: now() }
  garden.zones.push(zone)
  saveGarden(username, garden)
  return zone
}

export function updateGardenZone(
  username: string, id: string, updates: Partial<GardenZone>,
): GardenZone | null {
  const garden = loadGarden(username)
  const idx = garden.zones.findIndex(z => z.id === id)
  if (idx === -1) return null
  garden.zones[idx] = { ...garden.zones[idx], ...updates, id: garden.zones[idx].id, createdAt: garden.zones[idx].createdAt }
  saveGarden(username, garden)
  return garden.zones[idx]
}

export function deleteGardenZone(username: string, id: string): boolean {
  const garden = loadGarden(username)
  const len = garden.zones.length
  garden.zones = garden.zones.filter(z => z.id !== id)
  if (garden.zones.length === len) return false
  saveGarden(username, garden)
  return true
}

// ── Dashboard helpers ────────────────────────────────────
export function getTodayTasks(username: string): { overdue: CareSchedule[]; today: CareSchedule[]; upcoming: CareSchedule[] } {
  const garden = loadGarden(username)
  const todayStr = new Date().toISOString().slice(0, 10)
  const in3days = new Date()
  in3days.setDate(in3days.getDate() + 3)
  const in3str = in3days.toISOString().slice(0, 10)

  const active = garden.schedules.filter(s => s.active && s.nextDue)
  return {
    overdue: active.filter(s => s.nextDue! < todayStr),
    today: active.filter(s => s.nextDue === todayStr),
    upcoming: active.filter(s => s.nextDue! > todayStr && s.nextDue! <= in3str),
  }
}
