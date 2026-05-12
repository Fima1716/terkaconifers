import { VK } from 'vk-io';
import { generateReply } from './llm.js';
import { addMessage, getHistory } from './history.js';
import { getGreeting } from './prompt.js';
import { logEvent } from './stats.js';

export async function startVkBot() {
  const token = process.env.VK_TOKEN;
  if (!token) { console.log('[vk] No VK_TOKEN, skipping'); return; }

  const vk = new VK({ token });

  vk.updates.on('message_new', async (ctx) => {
    if (ctx.isOutbox) return;

    const text = ctx.text?.trim();
    const userId = String(ctx.senderId);
    const key = `vk_${userId}`;

    if (!text && ctx.hasAttachments()) {
      logEvent({ platform: 'vk', type: 'attachment', userId });
      await ctx.send('Я могу отвечать только на текстовые сообщения. Напишите ваш вопрос текстом, пожалуйста!');
      return;
    }
    if (!text) return;

    if (text.toLowerCase() === 'начать' || text === '/start') {
      logEvent({ platform: 'vk', type: 'start', userId });
      await ctx.send(getGreeting());
      return;
    }

    console.log(`[vk] User ${userId}: ${text}`);

    try {
      try { await ctx.setActivity(); } catch {}
      addMessage(key, 'user', text);
      const history = getHistory(key);
      const meta = await generateReply(text, history);
      addMessage(key, 'assistant', meta.reply);

      await ctx.send(meta.reply);
      console.log(`[vk] Reply to ${userId}: ${meta.reply.slice(0, 80)}...`);

      logEvent({
        platform: 'vk', type: 'message', userId,
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
      console.error(`[vk] Error for user ${userId}:`, err);
      logEvent({ platform: 'vk', type: 'error', userId, query: text?.slice(0, 200), error: String(err?.message || err) });
      try { await ctx.send('Извините, произошла техническая ошибка. Попробуйте позже.'); } catch {}
    }
  });

  try {
    console.log('[vk] Bot starting (long polling)...');
    await vk.updates.start();
    console.log('[vk] Bot started successfully');
  } catch (err: any) {
    console.error('[vk] Failed to start:', err?.message || err);
    logEvent({ platform: 'vk', type: 'error', userId: '', error: `Bot failed to start: ${err?.message || err}` });
  }
}
