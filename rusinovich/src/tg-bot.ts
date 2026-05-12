import { Telegraf } from 'telegraf';
import { generateReply } from './llm.js';
import { addMessage, getHistory } from './history.js';
import { getGreeting } from './prompt.js';
import { logEvent } from './stats.js';

export async function startTgBot() {
  const token = process.env.TG_BOT_TOKEN;
  if (!token) { console.log('[tg] No TG_BOT_TOKEN, skipping'); return; }

  let backoff = 5000;

  while (true) {
    try {
      const bot = new Telegraf(token);

      bot.start((ctx) => {
        const userId = String(ctx.from.id);
        const userName = ctx.from.first_name || undefined;
        logEvent({ platform: 'tg', type: 'start', userId, userName });
        ctx.reply(getGreeting());
      });

      bot.on('message', async (ctx) => {
        const msg = ctx.message;
        const userId = String(msg.from.id);
        const userName = msg.from.first_name || undefined;

        if (!('text' in msg) || !msg.text?.trim()) {
          logEvent({ platform: 'tg', type: 'attachment', userId, userName });
          await ctx.reply('Я могу отвечать только на текстовые сообщения. Напишите ваш вопрос текстом, пожалуйста!');
          return;
        }

        const text = msg.text.trim();
        const key = `tg_${userId}`;

        console.log(`[tg] User ${userId}: ${text}`);

        try {
          try { await ctx.sendChatAction('typing'); } catch {}
          addMessage(key, 'user', text);
          const history = getHistory(key);
          const meta = await generateReply(text, history);
          addMessage(key, 'assistant', meta.reply);

          await ctx.reply(meta.reply, { link_preview_options: { is_disabled: true } });
          console.log(`[tg] Reply to ${userId}: ${meta.reply.slice(0, 80)}...`);

          logEvent({
            platform: 'tg', type: 'message', userId, userName,
            query: text.slice(0, 2000),
            queryType: meta.queryType,
            response: meta.reply.slice(0, 2000),
            responseLen: meta.reply.length,
            latencyMs: meta.latencyMs,
            catalogHits: meta.catalogHits,
            searchQuery: meta.searchQuery,
            catalogMatches: meta.catalogMatches,
            stockCategory: meta.stockCategory,
          });
        } catch (err: any) {
          console.error(`[tg] Error for user ${userId}:`, err);
          logEvent({ platform: 'tg', type: 'error', userId, userName, query: ('text' in msg ? msg.text?.slice(0, 200) : ''), error: String(err?.message || err) });
          try { await ctx.reply('Извините, произошла техническая ошибка. Попробуйте позже.'); } catch {}
        }
      });

      bot.catch((err: any) => {
        console.error('[tg] Handler error:', err);
        logEvent({ platform: 'tg', type: 'error', userId: '', error: String(err?.message || err) });
      });

      console.log('[tg] Bot starting (long polling)...');
      backoff = 5000;
      await bot.launch();
    } catch (err: any) {
      console.error(`[tg] Crashed: ${err?.message || err}. Restarting in ${backoff / 1000}s...`);
      logEvent({ platform: 'tg', type: 'error', userId: '', error: `Bot crashed: ${err?.message || err}` });
      await new Promise(r => setTimeout(r, backoff));
      backoff = Math.min(backoff * 1.5, 60000);
    }
  }
}
