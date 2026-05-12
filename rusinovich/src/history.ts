import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const MAX_HISTORY = 10;
const MAX_CONVERSATIONS = 500;
const HISTORY_FILE = join(process.cwd(), 'history.json');

let conversations = new Map<string, Message[]>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function load() {
  try {
    if (existsSync(HISTORY_FILE)) {
      const data = JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'));
      conversations = new Map(Object.entries(data).map(([k, v]) => [k, v as Message[]]));
      console.log(`[history] Loaded ${conversations.size} conversations`);
    }
  } catch (err) {
    console.error('[history] Failed to load:', err);
  }
}

// Debounced save — batch writes, avoid race conditions
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      // Trim old conversations if too many
      if (conversations.size > MAX_CONVERSATIONS) {
        const keys = [...conversations.keys()];
        const toRemove = keys.slice(0, keys.length - MAX_CONVERSATIONS);
        for (const k of toRemove) conversations.delete(k);
      }
      const obj: Record<string, Message[]> = {};
      for (const [k, v] of conversations) obj[k] = v;
      writeFileSync(HISTORY_FILE, JSON.stringify(obj), 'utf-8');
    } catch (err) {
      console.error('[history] Failed to save:', err);
    }
  }, 2000);
}

load();

export function addMessage(key: string, role: 'user' | 'assistant', content: string): void {
  if (!conversations.has(key)) {
    conversations.set(key, []);
  }
  const history = conversations.get(key)!;
  history.push({ role, content });
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }
  scheduleSave();
}

export function getHistory(key: string): Message[] {
  return conversations.get(key) ?? [];
}
