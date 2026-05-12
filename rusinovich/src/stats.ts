import { appendFileSync, readFileSync, renameSync, statSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const STATS_FILE = join(DATA_DIR, 'bot-stats.jsonl');
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export interface BotEvent {
  ts: number;
  platform: 'max' | 'tg' | 'vk';
  userId: string;
  userName?: string;
  type: 'message' | 'start' | 'attachment' | 'error';
  query?: string;
  queryType?: 'product' | 'stock_general' | 'stock_category' | 'conversation';
  response?: string;
  responseLen?: number;
  latencyMs?: number;
  catalogHits?: number;
  searchQuery?: string;        // cleaned plant search term
  catalogMatches?: string[];   // matched catalog item names
  stockCategory?: string;      // category for stock_category queries
  error?: string;
}

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function rotate() {
  try {
    if (!existsSync(STATS_FILE)) return;
    const st = statSync(STATS_FILE);
    if (st.size > MAX_SIZE) {
      const old = STATS_FILE + '.old';
      renameSync(STATS_FILE, old);
    }
  } catch {}
}

export function logEvent(event: Partial<BotEvent> & { platform: BotEvent['platform']; type: BotEvent['type'] }) {
  try {
    ensureDir();
    rotate();
    const line = JSON.stringify({ ts: Date.now(), ...event }) + '\n';
    appendFileSync(STATS_FILE, line);
  } catch (err) {
    console.error('[stats] Write error:', err);
  }
}

function readEvents(fromTs?: number, toTs?: number): BotEvent[] {
  const events: BotEvent[] = [];
  const files = [STATS_FILE + '.old', STATS_FILE];
  for (const f of files) {
    if (!existsSync(f)) continue;
    try {
      const lines = readFileSync(f, 'utf-8').split('\n').filter(l => l.trim());
      for (const line of lines) {
        try {
          const ev = JSON.parse(line) as BotEvent;
          if (fromTs && ev.ts < fromTs) continue;
          if (toTs && ev.ts > toTs) continue;
          events.push(ev);
        } catch {}
      }
    } catch {}
  }
  return events;
}

export function getStats(fromTs: number, toTs: number) {
  const events = readEvents(fromTs, toTs);
  const messages = events.filter(e => e.type === 'message');
  const errors = events.filter(e => e.type === 'error');
  const uniqueUsers = new Set(events.filter(e => e.userId).map(e => `${e.platform}_${e.userId}`));

  // By platform
  const byPlatform: Record<string, { messages: number; errors: number; users: Set<string>; lastActivity: number }> = {};
  for (const p of ['max', 'tg', 'vk'] as const) {
    byPlatform[p] = { messages: 0, errors: 0, users: new Set(), lastActivity: 0 };
  }
  for (const ev of events) {
    const bp = byPlatform[ev.platform];
    if (!bp) continue;
    if (ev.type === 'message') bp.messages++;
    if (ev.type === 'error') bp.errors++;
    if (ev.userId) bp.users.add(ev.userId);
    if (ev.ts > bp.lastActivity) bp.lastActivity = ev.ts;
  }

  // Query types
  const queryTypes: Record<string, number> = {};
  for (const m of messages) {
    const qt = m.queryType || 'conversation';
    queryTypes[qt] = (queryTypes[qt] || 0) + 1;
  }

  // Hourly distribution
  const hourly: Record<string, number> = {};
  for (const m of messages) {
    const h = new Date(m.ts).getHours().toString().padStart(2, '0');
    hourly[h] = (hourly[h] || 0) + 1;
  }

  // Top queries
  const queryCounts: Record<string, number> = {};
  for (const m of messages) {
    if (m.query) {
      const q = m.query.toLowerCase().slice(0, 100);
      queryCounts[q] = (queryCounts[q] || 0) + 1;
    }
  }
  const topQueries = Object.entries(queryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([query, count]) => ({ query, count }));

  // Average latency
  const latencies = messages.filter(m => m.latencyMs).map(m => m.latencyMs!);
  const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;

  const byPlatformSerialized: Record<string, any> = {};
  for (const [k, v] of Object.entries(byPlatform)) {
    byPlatformSerialized[k] = {
      messages: v.messages,
      errors: v.errors,
      users: v.users.size,
      lastActivity: v.lastActivity || null,
    };
  }

  return {
    period: { from: new Date(fromTs).toISOString(), to: new Date(toTs).toISOString() },
    totals: { messages: messages.length, errors: errors.length, uniqueUsers: uniqueUsers.size },
    byPlatform: byPlatformSerialized,
    queryTypes,
    hourly: Object.entries(hourly).sort((a, b) => a[0].localeCompare(b[0])).map(([hour, count]) => ({ hour, count })),
    topQueries,
    avgLatency,
  };
}

export function getRecentErrors(limit = 50): BotEvent[] {
  const events = readEvents();
  return events.filter(e => e.type === 'error').slice(-limit).reverse();
}

export function getRecentEvents(limit = 100, platform?: string): BotEvent[] {
  let events = readEvents();
  if (platform) events = events.filter(e => e.platform === platform);
  return events.slice(-limit).reverse();
}
