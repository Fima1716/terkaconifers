/**
 * Posting module — встраивается в консультант-бота.
 * Кодовое слово активирует режим публикации.
 * Фото + текст → AI → одобрение → пост в Max/TG/VK.
 */
import OpenAI from 'openai';

const CODE_WORD = (process.env.POST_CODE_WORD || 'публикация').toLowerCase();
const TG_TOKEN = process.env.TG_POST_TOKEN || '';
const TG_CHANNEL_ID = process.env.TG_POST_CHANNEL_ID || '';
const VK_TOKEN = process.env.VK_POST_TOKEN || '';
const VK_GROUP_ID = process.env.VK_POST_GROUP_ID || '';
const MAX_TOKEN = process.env.MAX_BOT_TOKEN || '';
const MAX_CHANNEL_ID = process.env.MAX_POST_CHANNEL_ID || '';
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || '';

const ai = new OpenAI({ baseURL: 'https://api.deepseek.com', apiKey: DEEPSEEK_KEY, timeout: 30_000 });

// ── Prompts per platform ──
const TG_PROMPT = `Ты — эксперт по созданию контента для Telegram. Ты представляешь питомник хвойных "Русинов Сад" и пишешь от лица его создателя Александра Русинова.

Перепиши текст для публикации в Telegram.

Важные условия:
- Сохрани мысль: смысл каждого предложения и общую идею менять нельзя.
- Сохрани стиль автора: манеру речи, интонации, юмор. Текст должен звучать как от самого Александра.
- Ничего не придумывай: не добавляй новых фактов, примеров или выводов.

Технические требования:
- Длина строго не более 1000 символов включая пробелы. Если превышает — сократи.
- Избегай избыточного оформления.
- Хештеги: 2-5 релевантных в конце.
- Начинай: Друзья, привет!
- Названия растений на русском переделывай на латынь: Сосна обыкновенная (Pinus sylvestris), ель сибирская (Picea obovata), пихта корейская (Abies koreana) и т.д.
- WB = "Ведьмина метла".
- В конце поста (перед хештегами) добавь строку:
  Сайт: rusinovsad.ru
  Консультант: @rusadovich_bot

Выдай ТОЛЬКО готовый текст без HTML-тегов, без разметки, без комментариев. Чистый текст.`;

const VK_PROMPT = `Переделай входящий текст в пост для VK. Сохрани структуру, мысль и стиль.
Убери html разметку и все форматирование от Telegram.
В конце поста (перед хештегами) добавь строку:
  Сайт: rusinovsad.ru
  Консультант: https://vk.com/im/convo/-119505417
Выдай ТОЛЬКО готовый текст без комментариев.`;

const MAX_CH_PROMPT = `Переделай входящий текст в пост для Max.ru. Сохрани структуру, мысль и стиль.
Убери html разметку и все форматирование.
В конце поста (перед хештегами) добавь строку:
  Сайт: rusinovsad.ru
  Консультант: https://max.ru/id592005855318_2_bot
Выдай ТОЛЬКО готовый текст без комментариев.`;

// ── Session state ──
interface Session {
  state: 'waiting_content' | 'waiting_approval';
  photos: string[];
  texts: { tg: string; vk: string; max: string };
}

const sessions = new Map<string, Session>();

export interface PostingContext {
  userId: string;
  text: string;
  attachments: any[];
  reply: (text: string) => Promise<any>;
}

/**
 * Returns true if message was handled by posting mode.
 * Returns false if message should go to regular consultation.
 */
export async function handlePostingMessage(ctx: PostingContext): Promise<boolean> {
  const { userId, text, attachments } = ctx;
  const session = sessions.get(userId);

  // Code word → enter posting mode
  if (text.toLowerCase() === CODE_WORD && !session) {
    sessions.set(userId, { state: 'waiting_content', photos: [], texts: { tg: '', vk: '', max: '' } });
    await ctx.reply('🔓 Режим публикации активен.\n\nОтправьте фото + текст для поста.\nДля выхода напишите «выход».');
    console.log(`[post] User ${userId} entered posting mode`);
    return true;
  }

  // Not in posting mode → pass to consultation
  if (!session) return false;

  // Exit
  if (text.toLowerCase() === 'выход') {
    sessions.delete(userId);
    await ctx.reply('👋 Режим публикации выключен. Снова работаю как консультант.');
    console.log(`[post] User ${userId} exited posting mode`);
    return true;
  }

  // ── Waiting for content ──
  if (session.state === 'waiting_content') {
    const photoUrls = attachments
      .filter((a: any) => a.type === 'image' || a.type === 'photo')
      .map((a: any) => a.payload?.url || '')
      .filter(Boolean);

    if (photoUrls.length > 0) {
      session.photos = [...session.photos, ...photoUrls];
    }

    if (!text && photoUrls.length > 0) {
      await ctx.reply(`📸 Получено ${session.photos.length} фото. Теперь отправьте текст к посту.`);
      return true;
    }

    if (!text) {
      await ctx.reply('Отправьте фото и текст для поста.');
      return true;
    }

    // Got text → AI rewrite for all platforms
    await ctx.reply('🤖 Обрабатываю текст для 3 платформ...');
    const texts = await rewriteForAllPlatforms(text);
    session.texts = texts;
    session.state = 'waiting_approval';

    const plainPreview = texts.tg.replace(/<[^>]+>/g, '');
    await ctx.reply(
      `📝 Текст для постинга:\n——————\n${plainPreview}\n——————\n\n` +
      `📸 Фото: ${session.photos.length}\n\n` +
      `• «ок» — опубликовать на все площадки\n` +
      `• Свой текст — опубликовать с ним\n` +
      `• «-» — отмена`
    );
    console.log(`[post] AI rewrite for ${userId}, ${session.photos.length} photos`);
    return true;
  }

  // ── Waiting for approval ──
  if (session.state === 'waiting_approval') {
    if (text === '-') {
      session.state = 'waiting_content';
      session.photos = [];
      session.texts = { tg: '', vk: '', max: '' };
      await ctx.reply('❌ Отменено. Отправьте новый контент.');
      return true;
    }

    const isApprove = text.toLowerCase() === 'ок' || text.toLowerCase() === 'ok' || text === '+';
    let tgText: string, vkText: string, maxText: string;

    if (isApprove) {
      tgText = session.texts.tg;
      vkText = session.texts.vk;
      maxText = session.texts.max;
    } else {
      await ctx.reply('🤖 Адаптирую ваш текст...');
      const custom = await rewriteForAllPlatforms(text);
      tgText = custom.tg;
      vkText = custom.vk;
      maxText = custom.max;
    }

    const photos = session.photos;
    await ctx.reply('📤 Публикую на все площадки...');
    const results: string[] = [];

    const maxOk = await postToMaxChannel(maxText, photos);
    results.push(maxOk ? '✅ Max' : (MAX_CHANNEL_ID ? '❌ Max' : '⏭ Max (канал не настроен)'));

    const tgOk = await postToTelegram(tgText, photos);
    results.push(tgOk ? '✅ Telegram' : (TG_CHANNEL_ID ? '❌ Telegram' : '⏭ TG (канал не настроен)'));

    const vkOk = await postToVK(vkText, photos);
    results.push(vkOk ? '✅ VK' : (VK_GROUP_ID ? '❌ VK' : '⏭ VK (группа не настроена)'));

    await ctx.reply(`Результат:\n${results.join('\n')}\n\nОтправьте новый контент или «выход».`);

    session.state = 'waiting_content';
    session.photos = [];
    session.texts = { tg: '', vk: '', max: '' };
    console.log(`[post] Published: ${maxText.slice(0, 60)}... | ${results.join(', ')}`);
    return true;
  }

  return true;
}

// ── AI ──
async function aiRewrite(text: string, systemPrompt: string): Promise<string> {
  if (!DEEPSEEK_KEY) return text;
  try {
    const resp = await ai.chat.completions.create({
      model: 'deepseek-chat',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: text }],
      max_tokens: 1024, temperature: 0.5,
    });
    return resp.choices[0]?.message?.content?.trim() || text;
  } catch (err) {
    console.error('[post] AI error:', err);
    return text;
  }
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, '');
}

async function rewriteForAllPlatforms(text: string) {
  let tg = await aiRewrite(text, TG_PROMPT);
  tg = stripHtml(tg); // AI sometimes adds HTML despite instructions
  const [vk, max] = await Promise.all([aiRewrite(tg, VK_PROMPT), aiRewrite(tg, MAX_CH_PROMPT)]);
  return { tg: stripHtml(tg), vk: stripHtml(vk), max: stripHtml(max) };
}

// ── TG posting ──
async function postToTelegram(text: string, photoUrls: string[]): Promise<boolean> {
  if (!TG_TOKEN || !TG_CHANNEL_ID) return false;
  try {
    const base = `https://api.telegram.org/bot${TG_TOKEN}`;
    if (photoUrls.length === 0) {
      const r = await fetch(`${base}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TG_CHANNEL_ID, text }) });
      return (await r.json()).ok;
    } else if (photoUrls.length === 1) {
      const r = await fetch(`${base}/sendPhoto`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TG_CHANNEL_ID, photo: photoUrls[0], caption: text.slice(0, 1024) }) });
      return (await r.json()).ok;
    } else {
      const media = photoUrls.map((url, i) => ({ type: 'photo', media: url, ...(i === 0 ? { caption: text.slice(0, 1024) } : {}) }));
      const r = await fetch(`${base}/sendMediaGroup`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TG_CHANNEL_ID, media }) });
      return (await r.json()).ok;
    }
  } catch (err) { console.error('[post] TG error:', err); return false; }
}

// ── VK posting ──
async function postToVK(text: string, photoUrls: string[]): Promise<boolean> {
  if (!VK_TOKEN || !VK_GROUP_ID) return false;
  try {
    let attachments = '';
    if (photoUrls.length > 0) {
      const srvRes = await fetch(`https://api.vk.com/method/photos.getWallUploadServer?group_id=${VK_GROUP_ID}&access_token=${VK_TOKEN}&v=5.199`);
      const uploadUrl = (await srvRes.json())?.response?.upload_url;
      if (uploadUrl) {
        const uploaded: string[] = [];
        for (const url of photoUrls.slice(0, 4)) {
          try {
            console.log(`[post] VK: downloading photo from ${url.slice(0, 80)}...`);
            const blob = await (await fetch(url)).blob();
            console.log(`[post] VK: photo size ${blob.size}, uploading to VK...`);
            const form = new FormData();
            form.append('photo', blob, 'photo.jpg');
            const upRes = await fetch(uploadUrl, { method: 'POST', body: form });
            const upData = await upRes.json();
            console.log(`[post] VK upload result: photo=${!!upData.photo}, server=${upData.server}`);
            if (!upData.photo || upData.photo === '[]') { console.error('[post] VK: empty photo after upload'); continue; }
            const saveRes = await fetch(`https://api.vk.com/method/photos.saveWallPhoto?group_id=${VK_GROUP_ID}&photo=${encodeURIComponent(upData.photo)}&server=${upData.server}&hash=${upData.hash}&access_token=${VK_TOKEN}&v=5.199`);
            const saveData = await saveRes.json();
            const saved = saveData?.response?.[0];
            if (saved) uploaded.push(`photo${saved.owner_id}_${saved.id}`);
            else console.error('[post] VK save photo error:', JSON.stringify(saveData));
          } catch (e) { console.error('[post] VK photo upload:', e); }
        }
        attachments = uploaded.join(',');
      }
    }
    const params = new URLSearchParams({ owner_id: `-${VK_GROUP_ID}`, from_group: '1', message: text, access_token: VK_TOKEN, v: '5.199' });
    if (attachments) params.set('attachments', attachments);
    const data = await (await fetch(`https://api.vk.com/method/wall.post?${params}`)).json();
    if (data.error) console.error('[post] VK wall.post:', data.error);
    return !!data?.response?.post_id;
  } catch (err) { console.error('[post] VK error:', err); return false; }
}

// ── Max channel posting ──
async function postToMaxChannel(text: string, photos: string[]): Promise<boolean> {
  if (!MAX_CHANNEL_ID || !MAX_TOKEN) return false;
  try {
    const body: any = { text };
    if (photos.length) body.attachments = photos.map(url => ({ type: 'image', payload: { url } }));
    const res = await fetch(`https://platform-api.max.ru/messages?chat_id=${MAX_CHANNEL_ID}`, {
      method: 'POST',
      headers: { Authorization: `access_token_${MAX_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return !!(await res.json())?.message;
  } catch (err) { console.error('[post] Max channel error:', err); return false; }
}
