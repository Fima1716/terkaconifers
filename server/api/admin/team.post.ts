import { readMultipartFormData } from 'h3'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve } from 'path'

const TEAM_FILE = resolve(process.cwd(), 'data/team.json')
const PHOTO_DIR = resolve(process.cwd(), 'data/team')

interface TeamMember {
  id: string
  name: string
  role: string
  bio: string
  photo: string
  links: { type: string; url: string }[]
  tags: string[]
}

function loadTeam(): { members: TeamMember[] } {
  if (!existsSync(TEAM_FILE)) return { members: [] }
  try {
    return JSON.parse(readFileSync(TEAM_FILE, 'utf-8'))
  } catch {
    return { members: [] }
  }
}

function saveTeam(data: { members: TeamMember[] }) {
  writeFileSync(TEAM_FILE, JSON.stringify(data, null, 2))
}

export default defineEventHandler(async (event) => {
  await requireAuth(event, 'super_admin')

  const formData = await readMultipartFormData(event)
  if (!formData) throw createError({ statusCode: 400, message: 'Нет данных' })

  const fields: Record<string, string> = {}
  let photoFile: { filename: string; data: Buffer } | null = null

  for (const field of formData) {
    if (field.name === 'photo' && field.filename && field.data.length > 0) {
      photoFile = { filename: field.filename, data: field.data }
    } else if (field.name && field.data) {
      fields[field.name] = field.data.toString()
    }
  }

  const action = fields.action
  if (!action) throw createError({ statusCode: 400, message: 'Не указано действие' })

  const team = loadTeam()

  // ── Save (create / update) ──
  if (action === 'save') {
    const id = fields.id || String(Date.now())
    const name = fields.name || ''
    const role = fields.role || ''
    const bio = fields.bio || ''
    const tags: string[] = fields.tags ? JSON.parse(fields.tags) : []
    const links: { type: string; url: string }[] = fields.links ? JSON.parse(fields.links) : []

    let photo = fields.existingPhoto || ''

    if (photoFile) {
      if (!existsSync(PHOTO_DIR)) mkdirSync(PHOTO_DIR, { recursive: true })
      const ext = photoFile.filename.split('.').pop() || 'jpg'
      const filename = `team-${Date.now()}.${ext}`
      writeFileSync(resolve(PHOTO_DIR, filename), photoFile.data)
      photo = filename
    }

    const member: TeamMember = { id, name, role, bio, photo, links, tags }

    const idx = team.members.findIndex(m => m.id === id)
    if (idx >= 0) {
      // Preserve existing photo if no new upload and no explicit value
      if (!photoFile && !fields.existingPhoto && team.members[idx].photo) {
        member.photo = team.members[idx].photo
      }
      team.members[idx] = member
    } else {
      team.members.push(member)
    }
  }

  // ── Delete ──
  if (action === 'delete') {
    const id = fields.id
    if (!id) throw createError({ statusCode: 400, message: 'Не указан id' })
    team.members = team.members.filter(m => m.id !== id)
  }

  // ── Reorder ──
  if (action === 'reorder') {
    const ids: string[] = fields.ids ? JSON.parse(fields.ids) : []
    if (ids.length) {
      const memberMap = new Map(team.members.map(m => [m.id, m]))
      const reordered: TeamMember[] = []
      for (const id of ids) {
        const m = memberMap.get(id)
        if (m) reordered.push(m)
      }
      // Append any members not in the ids list (safety net)
      for (const m of team.members) {
        if (!ids.includes(m.id)) reordered.push(m)
      }
      team.members = reordered
    }
  }

  saveTeam(team)
  return { ok: true, members: team.members }
})
