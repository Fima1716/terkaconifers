import { writeFileSync, readFileSync, mkdirSync, existsSync, copyFileSync } from 'fs'
import { resolve, dirname } from 'path'

const DATA_PATH = resolve(process.cwd(), 'data/conditions.json')
const PUBLIC_PATH = resolve(process.cwd(), 'public/data/conditions.json')

interface GrowingConditions {
  light?: 'full_sun' | 'partial_shade' | 'shade'
  moisture?: 'loves_water' | 'moderate' | 'drought_tolerant'
  wind?: 'wind_resistant' | 'needs_shelter'
  winter?: 'needs_cover' | 'hardy'
  soil?: ('any' | 'acidic' | 'alkaline' | 'well_drained')[]
}

interface ConditionsData {
  updated: string
  species: Record<string, GrowingConditions>
  overrides: Record<string, GrowingConditions>
}

function loadData(): ConditionsData {
  try {
    return JSON.parse(readFileSync(DATA_PATH, 'utf-8'))
  } catch {
    return { updated: '', species: {}, overrides: {} }
  }
}

function saveData(data: ConditionsData) {
  data.updated = new Date().toISOString()
  const json = JSON.stringify(data, null, 2)
  writeFileSync(DATA_PATH, json)

  const publicDir = dirname(PUBLIC_PATH)
  if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true })
  writeFileSync(PUBLIC_PATH, json)
}

export default defineEventHandler(async (event) => {
  await requireAuth(event, 'super_admin')

  const body = await readBody(event)
  if (!body || !body.action) {
    throw createError({ statusCode: 400, message: 'Не указано действие (action)' })
  }

  const data = loadData()

  if (body.action === 'saveSpecies') {
    if (!body.speciesFull || !body.conditions) {
      throw createError({ statusCode: 400, message: 'Не указаны speciesFull или conditions' })
    }
    data.species[body.speciesFull] = body.conditions as GrowingConditions
  } else if (body.action === 'saveOverride') {
    if (!body.plantId || !body.conditions) {
      throw createError({ statusCode: 400, message: 'Не указаны plantId или conditions' })
    }
    data.overrides[String(body.plantId)] = body.conditions as GrowingConditions
  } else if (body.action === 'deleteSpecies') {
    if (!body.speciesFull) {
      throw createError({ statusCode: 400, message: 'Не указан speciesFull' })
    }
    delete data.species[body.speciesFull]
  } else if (body.action === 'deleteOverride') {
    if (!body.plantId) {
      throw createError({ statusCode: 400, message: 'Не указан plantId' })
    }
    delete data.overrides[String(body.plantId)]
  } else {
    throw createError({ statusCode: 400, message: `Неизвестное действие: ${body.action}` })
  }

  saveData(data)
  return { ok: true, data }
})
