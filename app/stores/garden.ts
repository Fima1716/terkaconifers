import { defineStore } from 'pinia'

// ── Types ────────────────────────────────────────────────
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

export type PlantStatus = GardenPlant['status']
export type EventType = 'photo' | 'measurement' | 'watering' | 'fertilizing' | 'pruning' | 'treatment' | 'problem' | 'note'
export type ScheduleType = 'watering' | 'fertilizing' | 'pruning' | 'treatment' | 'measurement' | 'custom'

export interface GardenEvent {
  id: string
  plantId: string
  type: EventType
  date: string
  height?: number
  width?: number
  trunkDiameter?: number
  product?: string
  dosage?: string
  problemType?: string
  severity?: 'low' | 'medium' | 'high'
  photoUrl?: string
  text?: string
  createdAt: string
}

export interface CareSchedule {
  id: string
  plantId: string
  type: ScheduleType
  name: string
  intervalDays: number
  lastDone: string | null
  nextDue: string | null
  notes: string
  active: boolean
  createdAt: string
}

export interface GardenZone {
  id: string
  name: string
  description: string
  light?: 'sun' | 'partial' | 'shade'
  moisture?: 'dry' | 'moderate' | 'wet'
  soil?: string
  createdAt: string
}

// ── Labels & Colors ──────────────────────────────────────
export const STATUS_LABELS: Record<PlantStatus, string> = {
  growing: 'Растёт', sleeping: 'Спит', sick: 'Болеет', dead: 'Погибло',
}
export const STATUS_COLORS: Record<PlantStatus, string> = {
  growing: '#2e7d32', sleeping: '#5c6bc0', sick: '#e65100', dead: '#9e9e9e',
}

export const EVENT_LABELS: Record<EventType, string> = {
  watering: 'Полив', fertilizing: 'Подкормка', measurement: 'Замер',
  pruning: 'Обрезка', treatment: 'Обработка', problem: 'Проблема',
  photo: 'Фото', note: 'Заметка',
}
export const EVENT_COLORS: Record<EventType, string> = {
  watering: '#1976d2', fertilizing: '#7b1fa2', measurement: '#00897b',
  pruning: '#e65100', treatment: '#c62828', problem: '#d84315',
  photo: '#37474f', note: '#546e7a',
}
export const EVENT_ICONS: Record<EventType, string> = {
  watering: 'M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z',
  fertilizing: 'M10 2v7.31l-4.24 2.45a5 5 0 1 0 8.49 0L10 9.31V2h4v3h-2v2.17l3.83 2.21a7 7 0 1 1-11.66 0L8 7.17V5H6V2z',
  measurement: 'M2 12h4l1-3 2 6 2-8 2 10 2-5 1 2h5',
  pruning: 'M14.12 14.12L12 22l-2-7.88L3 12l7.88-2L13 3l2 7.12L22 12z',
  treatment: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  problem: 'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01',
  photo: 'M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2zM12 13a4 4 0 100-8 4 4 0 000 8z',
  note: 'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z',
}

export const SCHEDULE_LABELS: Record<ScheduleType, string> = {
  watering: 'Полив', fertilizing: 'Подкормка', pruning: 'Обрезка',
  treatment: 'Обработка', measurement: 'Замер', custom: 'Другое',
}

export const LIGHT_LABELS: Record<string, string> = { sun: 'Солнце', partial: 'Полутень', shade: 'Тень' }
export const MOISTURE_LABELS: Record<string, string> = { dry: 'Сухо', moderate: 'Умеренно', wet: 'Влажно' }

// ── Store ────────────────────────────────────────────────
export const useGardenStore = defineStore('garden', {
  state: () => ({
    plants: [] as GardenPlant[],
    schedules: [] as CareSchedule[],
    zones: [] as GardenZone[],
    loaded: false,
    loading: false,
    // Per-plant event cache
    eventCache: {} as Record<string, GardenEvent[]>,
  }),

  getters: {
    count: (state) => state.plants.length,
    byStatus: (state) => (status: PlantStatus) => state.plants.filter(p => p.status === status),
    growingCount: (state) => state.plants.filter(p => p.status === 'growing').length,
    sleepingCount: (state) => state.plants.filter(p => p.status === 'sleeping').length,
    sickCount: (state) => state.plants.filter(p => p.status === 'sick').length,
    deadCount: (state) => state.plants.filter(p => p.status === 'dead').length,
    zoneNames: (state) => state.zones.map(z => z.name),
    getPlant: (state) => (id: string) => state.plants.find(p => p.id === id),
    hasCatalogPlant: (state) => (catalogId: number) => state.plants.some(p => p.catalogId === catalogId),
    getPlantSchedules: (state) => (plantId: string) => state.schedules.filter(s => s.plantId === plantId),
    getPlantEvents: (state) => (plantId: string) => state.eventCache[plantId] || [],
    getZone: (state) => (id: string) => state.zones.find(z => z.id === id),
    plantsByZone: (state) => (zoneName: string) => state.plants.filter(p => p.zone === zoneName),
  },

  actions: {
    // ── Load ─────────────────────────────────────────────
    async load() {
      if (this.loaded || this.loading) return
      this.loading = true
      try {
        const [plantsRes, schedulesRes, zonesRes] = await Promise.all([
          $fetch<{ plants: GardenPlant[] }>('/api/garden/plants'),
          $fetch<{ schedules: CareSchedule[] }>('/api/garden/schedules'),
          $fetch<{ zones: GardenZone[] }>('/api/garden/zones'),
        ])
        this.plants = plantsRes.plants
        this.schedules = schedulesRes.schedules
        this.zones = zonesRes.zones
        this.loaded = true
      } catch {
        this.plants = []
        this.schedules = []
        this.zones = []
      }
      this.loading = false
    },

    // ── Plants ───────────────────────────────────────────
    async addPlant(data: Partial<GardenPlant>): Promise<GardenPlant> {
      const { plant } = await $fetch<{ plant: GardenPlant }>('/api/garden/plants', { method: 'POST', body: data })
      this.plants.push(plant)
      return plant
    },
    async updatePlant(id: string, data: Partial<GardenPlant>): Promise<GardenPlant> {
      const { plant } = await $fetch<{ plant: GardenPlant }>(`/api/garden/plants/${id}`, { method: 'PUT', body: data })
      const idx = this.plants.findIndex(p => p.id === id)
      if (idx >= 0) this.plants[idx] = plant
      return plant
    },
    async removePlant(id: string) {
      await $fetch(`/api/garden/plants/${id}`, { method: 'DELETE' })
      this.plants = this.plants.filter(p => p.id !== id)
      this.schedules = this.schedules.filter(s => s.plantId !== id)
      delete this.eventCache[id]
    },

    // ── Events ───────────────────────────────────────────
    async loadEvents(plantId: string) {
      const { events } = await $fetch<{ events: GardenEvent[] }>('/api/garden/events', { params: { plantId } })
      this.eventCache[plantId] = events
    },
    async addEvent(data: Partial<GardenEvent>): Promise<GardenEvent> {
      const res = await $fetch<{ event: GardenEvent }>('/api/garden/events', { method: 'POST', body: data })
      const ev = res.event
      if (!this.eventCache[ev.plantId]) this.eventCache[ev.plantId] = []
      this.eventCache[ev.plantId].unshift(ev)
      return ev
    },
    async removeEvent(plantId: string, eventId: string) {
      await $fetch(`/api/garden/events/${eventId}`, { method: 'DELETE' })
      if (this.eventCache[plantId]) {
        this.eventCache[plantId] = this.eventCache[plantId].filter(e => e.id !== eventId)
      }
    },

    // ── Schedules ────────────────────────────────────────
    async addSchedule(data: Partial<CareSchedule>): Promise<CareSchedule> {
      const { schedule } = await $fetch<{ schedule: CareSchedule }>('/api/garden/schedules', { method: 'POST', body: data })
      this.schedules.push(schedule)
      return schedule
    },
    async markDone(id: string): Promise<CareSchedule> {
      const { schedule } = await $fetch<{ schedule: CareSchedule }>(`/api/garden/schedules/${id}`, { method: 'PUT', body: { _action: 'done' } })
      const idx = this.schedules.findIndex(s => s.id === id)
      if (idx >= 0) this.schedules[idx] = schedule
      return schedule
    },
    async updateSchedule(id: string, data: Partial<CareSchedule>): Promise<CareSchedule> {
      const { schedule } = await $fetch<{ schedule: CareSchedule }>(`/api/garden/schedules/${id}`, { method: 'PUT', body: data })
      const idx = this.schedules.findIndex(s => s.id === id)
      if (idx >= 0) this.schedules[idx] = schedule
      return schedule
    },
    async removeSchedule(id: string) {
      await $fetch(`/api/garden/schedules/${id}`, { method: 'DELETE' })
      this.schedules = this.schedules.filter(s => s.id !== id)
    },

    // ── Zones ────────────────────────────────────────────
    async addZone(data: Partial<GardenZone>): Promise<GardenZone> {
      const { zone } = await $fetch<{ zone: GardenZone }>('/api/garden/zones', { method: 'POST', body: data })
      this.zones.push(zone)
      return zone
    },
    async updateZone(id: string, data: Partial<GardenZone>): Promise<GardenZone> {
      const { zone } = await $fetch<{ zone: GardenZone }>(`/api/garden/zones/${id}`, { method: 'PUT', body: data })
      const idx = this.zones.findIndex(z => z.id === id)
      if (idx >= 0) this.zones[idx] = zone
      return zone
    },
    async removeZone(id: string) {
      await $fetch(`/api/garden/zones/${id}`, { method: 'DELETE' })
      this.zones = this.zones.filter(z => z.id !== id)
    },
  },
})
