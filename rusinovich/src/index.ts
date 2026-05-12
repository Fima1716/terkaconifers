import 'dotenv/config';
import { createServer } from 'http';
import { initMaxBot, handleMaxUpdate } from './max-bot.js';
import { startTgBot } from './tg-bot.js';
import { startVkBot } from './vk-bot.js';
import { initPostBot, handlePostUpdate } from './post-bot.js';
import { syncCatalog, getLastSync, getCatalog } from './catalog.js';

const WEBHOOK_PORT = parseInt(process.env.RUSINOV_WEBHOOK_PORT || '3002');
const WEBHOOK_SECRET = process.env.RUSINOV_WEBHOOK_SECRET || '';
const WEBHOOK_URL_CONSULTANT = process.env.RUSINOV_WEBHOOK_URL_CONSULTANT || '';
const WEBHOOK_URL_POSTING = process.env.RUSINOV_WEBHOOK_URL_POSTING || '';
const MAX_API = 'https://platform-api.max.ru';

console.log(`[${new Date().toISOString()}] Starting Rusinov Sad bots...`);

async function registerWebhook(token: string, url: string, types: string[], label: string) {
  if (!token || !url) {
    console.log(`[webhook] ${label}: no token or url, skipping registration`);
    return;
  }
  const body: any = { url, update_types: types };
  if (WEBHOOK_SECRET) body.secret = WEBHOOK_SECRET;
  try {
    const resp = await fetch(`${MAX_API}/subscriptions`, {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    console.log(`[webhook] ${label} registered: ${JSON.stringify(data)}`);
  } catch (e) {
    console.error(`[webhook] ${label} registration failed:`, e);
  }
}

function startWebhookServer() {
  const server = createServer((req, res) => {
    if (req.method !== 'POST') { res.writeHead(200); res.end('ok'); return; }
    if (WEBHOOK_SECRET && req.headers['x-max-bot-api-secret'] !== WEBHOOK_SECRET) {
      console.log('[webhook] Invalid secret'); res.writeHead(403); res.end(); return;
    }

    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk; });
    req.on('end', () => {
      // Return 200 immediately, process async
      res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok');
      try {
        const update = JSON.parse(body);
        const path = req.url || '';
        if (path.includes('consultant')) {
          handleMaxUpdate(update).catch(e => console.error('[webhook] consultant error:', e));
        } else if (path.includes('posting')) {
          handlePostUpdate(update).catch(e => console.error('[webhook] posting error:', e));
        } else {
          console.log(`[webhook] Unknown path: ${path}`);
        }
      } catch (e) { console.error('[webhook] parse error:', e); }
    });
  });

  server.listen(WEBHOOK_PORT, () => {
    console.log(`[webhook] Rusinov webhook server on port ${WEBHOOK_PORT}`);
  });
}

// Sync catalog before starting bots, then every 3 hours
async function catalogLoop() {
  const threeHours = 3 * 60 * 60 * 1000;

  if (Date.now() - getLastSync() > threeHours || getCatalog().length === 0) {
    await syncCatalog().catch(err => console.error('[catalog] Sync error:', err));
  }

  setInterval(() => {
    syncCatalog().catch(err => console.error('[catalog] Sync error:', err));
  }, threeHours);
}

// Wait for initial catalog load, then start bots
catalogLoop().then(async () => {
  // Init Max bots (register handlers, get bot info)
  await initMaxBot();
  await initPostBot();

  // Start TG & VK bots (they have their own polling/webhook mechanisms)
  startTgBot().catch(err => console.error('[tg] Fatal:', err));
  startVkBot().catch(err => console.error('[vk] Fatal:', err));

  // Register webhooks with Max.ru
  await Promise.all([
    registerWebhook(
      process.env.MAX_BOT_TOKEN || '',
      WEBHOOK_URL_CONSULTANT,
      ['message_created', 'message_callback', 'bot_started'],
      'consultant',
    ),
    registerWebhook(
      process.env.MAX_POST_TOKEN || '',
      WEBHOOK_URL_POSTING,
      ['message_created', 'message_callback'],
      'posting',
    ),
  ]);

  // Start webhook HTTP server
  startWebhookServer();
});
