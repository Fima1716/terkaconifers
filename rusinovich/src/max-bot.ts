import { Bot } from '@maxhub/max-bot-api';
import { generateReply } from './llm.js';
import { addMessage, getHistory } from './history.js';
import { getGreeting } from './prompt.js';
import { logEvent } from './stats.js';

let bot: Bot | null = null;

export async function initMaxBot(): Promise<void> {
  const token = process.env.MAX_BOT_TOKEN;
  if (!token) { console.log('[max] No MAX_BOT_TOKEN, skipping'); return; }

  bot = new Bot(token);

  bot.catch((err: any) => {
    console.error('[max] Handler error:', err);
    logEvent({ platform: 'max', type: 'error', userId: '', error: String(err?.message || err) });
  });

  bot.on('bot_started', (ctx) => {
    logEvent({ platform: 'max', type: 'start', userId: '' });
    ctx.reply(getGreeting());
  });

  bot.on('message_created', async (ctx) => {
    const msg = ctx.message;
    if (msg.sender?.is_bot) return;

    const hasAttachments = msg.body?.attachments?.length;
    const text = msg.body?.text?.trim() || '';
    const userId = String(msg.sender?.user_id || '');
    const userName = msg.sender?.name || undefined;
    if (!userId) return;

    if (!text && hasAttachments) {
      logEvent({ platform: 'max', type: 'attachment', userId, userName });
      await ctx.reply('Я могу отвечать только на текстовые сообщения. Напишите ваш вопрос текстом, пожалуйста!', { disable_link_preview: true });
      return;
    }
    if (!text) return;

    const key = `max_${userId}`;
    console.log(`[max] User ${userId}: ${text}`);

    try {
      try { await ctx.sendAction('typing_on'); } catch {}
      addMessage(key, 'user', text);
      const history = getHistory(key);
      const meta = await generateReply(text, history);
      addMessage(key, 'assistant', meta.reply);

      await ctx.reply(meta.reply, { disable_link_preview: true });
      console.log(`[max] Reply to ${userId}: ${meta.reply.slice(0, 80)}...`);

      logEvent({
        platform: 'max', type: 'message', userId, userName,
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
      console.error(`[max] Error for user ${userId}:`, err);
      logEvent({ platform: 'max', type: 'error', userId, userName, query: text.slice(0, 200), error: String(err?.message || err) });
      try { await ctx.reply('Извините, произошла техническая ошибка. Попробуйте позже.'); } catch {}
    }
  });

  // Get bot info (needed for context creation in handleUpdate)
  try {
    (bot as any).botInfo = await (bot as any).api.getMyInfo();
    console.log(`[max] Bot initialized: @${(bot as any).botInfo?.username}`);
  } catch (e) {
    console.error('[max] Failed to get bot info:', e);
  }
}

export async function handleMaxUpdate(update: any): Promise<void> {
  if (!bot) return;
  await (bot as any).handleUpdate(update);
}
