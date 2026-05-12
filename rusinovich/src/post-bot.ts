/**
 * Постинг-бот для Русинов Сад.
 * Точка входа — Max.ru. Кодовое слово для авторизации.
 *
 * Флоу:
 * 1. Юзер пишет кодовое слово → авторизован
 * 2. Юзер шлёт фото/видео + текст → AI переписывает
 * 3. Превью всех 3 версий + кнопки выбора платформ
 * 4. Тогглы [Max] [TG] [VK] для выбора куда постить
 * 5. Кнопка "Публикую!" → двойное подтверждение → публикация
 * 6. Таймаут сессии: 30 мин без активности → автовыход
 */

import OpenAI from 'openai';

const MAX_TOKEN = process.env.MAX_POST_TOKEN || '';
const MAX_CHANNEL_ID = process.env.MAX_POST_CHANNEL_ID || '';
const TG_TOKEN = process.env.TG_POST_TOKEN || '';
const TG_CHANNEL_ID = process.env.TG_POST_CHANNEL_ID || '';
const VK_TOKEN = process.env.VK_POST_TOKEN || '';
const VK_USER_TOKEN = process.env.VK_USER_TOKEN || '';
const VK_GROUP_ID = process.env.VK_POST_GROUP_ID || '';
const CODE_WORD = (process.env.POST_CODE_WORD || 'публикация').toLowerCase();
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || '';

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

const MAX_API = 'https://platform-api.max.ru';

const ai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: DEEPSEEK_KEY,
  timeout: 30_000,
});

const TG_PROMPT = `Ты — эксперт по созданию контента для Telegram. Ты представляешь питомник хвойных "Русинов Сад" и пишешь от лица его создателя Александра Русинова.

Перепиши текст для публикации в Telegram.

Условия:
- Сохрани мысль и стиль автора. Ничего не придумывай.
- Длина строго не более 1000 символов.
- Хештеги: 2-5 в конце.
- Начинай: Друзья, привет!
- Названия растений переделывай на латынь: Сосна обыкновенная (Pinus sylvestris) и т.д.
- WB = "Ведьмина метла".
- В конце поста перед хештегами добавь:
  Сайт: rusinovsad.ru
  Консультант: @rusadovich_bot

ВАЖНО: выдай ТОЛЬКО чистый текст. Никакого HTML, никаких тегов <b>, <i>, <a>. Просто текст.`;

const VK_PROMPT = `Переделай входящий текст в пост для VK. Сохрани структуру, мысль и стиль.
Убери любую разметку.
В конце поста перед хештегами добавь:
  Сайт: rusinovsad.ru
  Консультант: https://vk.com/im/convo/-119505417
Выдай ТОЛЬКО чистый текст без комментариев.`;

const MAX_PROMPT = `Переделай входящий текст в пост для Max.ru. Сохрани структуру, мысль и стиль.
Убери любую разметку.
В конце поста перед хештегами добавь:
  Сайт: rusinovsad.ru
  Консультант: https://max.ru/id592005855318_2_bot
Выдай ТОЛЬКО чистый текст без комментариев.`;

// ── Media types ──
interface MediaItem {
  type: 'photo' | 'video';
  url: string;
}

// ── State ──
type Platform = 'max' | 'tg' | 'vk';

interface Session {
  authed: boolean;
  chatId: string;
  state: 'idle' | 'waiting_content' | 'waiting_approval' | 'waiting_confirm';
  media: MediaItem[];
  originalText: string;
  texts: PlatformTexts;
  platforms: Record<Platform, boolean>;
  lastActivity: number;
}

const sessions = new Map<string, Session>();

function getSession(userId: string): Session {
  if (!sessions.has(userId)) {
    sessions.set(userId, {
      authed: false, chatId: '', state: 'idle',
      media: [], originalText: '', texts: { tg: '', vk: '', max: '' },
      platforms: { max: true, tg: true, vk: true },
      lastActivity: Date.now(),
    });
  }
  const s = sessions.get(userId)!;
  s.lastActivity = Date.now();
  return s;
}

function isSessionExpired(session: Session): boolean {
  return Date.now() - session.lastActivity > SESSION_TIMEOUT_MS;
}

function resetSession(session: Session) {
  session.state = 'waiting_content';
  session.media = [];
  session.originalText = '';
  session.texts = { tg: '', vk: '', max: '' };
  session.platforms = { max: true, tg: true, vk: true };
}

function mediaSummary(media: MediaItem[]): string {
  const photos = media.filter(m => m.type === 'photo').length;
  const videos = media.filter(m => m.type === 'video').length;
  const parts: string[] = [];
  if (photos) parts.push(`${photos} фото`);
  if (videos) parts.push(`${videos} видео`);
  return parts.join(', ') || '0 медиа';
}

// ── Max API helpers ──
async function maxFetch(path: string, body?: any): Promise<any> {
  const opts: any = {
    headers: { Authorization: `${MAX_TOKEN}`, 'Content-Type': 'application/json' },
  };
  if (body) { opts.method = 'POST'; opts.body = JSON.stringify(body); }
  const res = await fetch(`${MAX_API}${path}`, opts);
  return res.json();
}

async function maxSend(chatId: string, text: string, attachments?: any[]): Promise<any> {
  const body: any = { text };
  if (attachments?.length) body.attachments = attachments;
  return maxFetch(`/messages?chat_id=${chatId}`, body);
}

async function maxGetChats(): Promise<any[]> {
  const data = await maxFetch('/chats');
  return data?.chats || [];
}

// ── Inline keyboard helpers ──
function platformToggleKeyboard(platforms: Record<Platform, boolean>): any {
  const label = (p: Platform, name: string) => platforms[p] ? `✅ ${name}` : `❌ ${name}`;
  return {
    type: 'inline_keyboard',
    payload: {
      buttons: [
        [
          { type: 'callback', text: label('max', 'Max'), payload: 'toggle_max' },
          { type: 'callback', text: label('tg', 'TG'), payload: 'toggle_tg' },
          { type: 'callback', text: label('vk', 'VK'), payload: 'toggle_vk' },
        ],
        [{ type: 'callback', text: '📤 Публикую!', payload: 'publish' }],
        [
          { type: 'callback', text: '✏️ Свой текст', payload: 'custom_text' },
          { type: 'callback', text: '❌ Отмена', payload: 'cancel' },
        ],
      ],
    },
  };
}

function confirmKeyboard(platformNames: string): any {
  return {
    type: 'inline_keyboard',
    payload: {
      buttons: [
        [{ type: 'callback', text: `✅ Да, публикую в ${platformNames}`, payload: 'confirm_yes' }],
        [{ type: 'callback', text: '⬅️ Назад к выбору', payload: 'confirm_back' }],
      ],
    },
  };
}

function platformNames(platforms: Record<Platform, boolean>): string {
  const names: string[] = [];
  if (platforms.max) names.push('Max');
  if (platforms.tg) names.push('TG');
  if (platforms.vk) names.push('VK');
  return names.join(' + ') || 'никуда';
}

function previewText(texts: PlatformTexts, media: MediaItem[]): string {
  const lines: string[] = [];
  lines.push('──── Max ────');
  lines.push(texts.max);
  lines.push('');
  lines.push('──── Telegram ────');
  lines.push(texts.tg);
  lines.push('');
  lines.push('──── VK ────');
  lines.push(texts.vk);
  lines.push('');
  lines.push(`📎 ${mediaSummary(media)}`);
  lines.push('');
  lines.push('Выберите платформы и нажмите «Публикую!»');
  return lines.join('\n');
}

// ── AI rewrite ──
interface PlatformTexts {
  tg: string;
  vk: string;
  max: string;
}

async function aiRewrite(text: string, systemPrompt: string): Promise<string> {
  if (!DEEPSEEK_KEY) return text;
  try {
    const resp = await ai.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      max_tokens: 1024,
      temperature: 0.5,
    });
    return resp.choices[0]?.message?.content?.trim() || text;
  } catch (err) {
    console.error('[post] AI rewrite error:', err);
    return text;
  }
}

function stripHtml(t: string): string { return t.replace(/<[^>]+>/g, ''); }

async function rewriteForAllPlatforms(text: string): Promise<PlatformTexts> {
  const tg = stripHtml(await aiRewrite(text, TG_PROMPT));
  const [vk, max] = await Promise.all([
    aiRewrite(tg, VK_PROMPT).then(stripHtml),
    aiRewrite(tg, MAX_PROMPT).then(stripHtml),
  ]);
  return { tg, vk, max };
}

// ── TG posting ──
async function postToTelegram(text: string, media: MediaItem[]): Promise<boolean> {
  if (!TG_TOKEN || !TG_CHANNEL_ID) { console.log('[post] TG not configured, skipping'); return false; }
  try {
    const base = `https://api.telegram.org/bot${TG_TOKEN}`;

    if (media.length === 0) {
      const res = await fetch(`${base}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TG_CHANNEL_ID, text }),
      });
      const data = await res.json();
      if (!data.ok) console.error('[post] TG sendMessage error:', data);
      return !!data.ok;
    }

    if (media.length === 1) {
      const m = media[0];
      if (m.type === 'photo') {
        const res = await fetch(`${base}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: TG_CHANNEL_ID, photo: m.url, caption: text.slice(0, 1024) }),
        });
        const data = await res.json();
        if (!data.ok) console.error('[post] TG sendPhoto error:', data);
        return !!data.ok;
      } else {
        const res = await fetch(`${base}/sendVideo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: TG_CHANNEL_ID, video: m.url, caption: text.slice(0, 1024) }),
        });
        const data = await res.json();
        if (!data.ok) console.error('[post] TG sendVideo error:', data);
        return !!data.ok;
      }
    }

    // Multiple media → sendMediaGroup
    const tgMedia = media.map((m, i) => ({
      type: m.type,
      media: m.url,
      ...(i === 0 ? { caption: text.slice(0, 1024) } : {}),
    }));
    const res = await fetch(`${base}/sendMediaGroup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHANNEL_ID, media: tgMedia }),
    });
    const data = await res.json();
    if (!data.ok) console.error('[post] TG sendMediaGroup error:', data);
    return !!data.ok;
  } catch (err) {
    console.error('[post] TG error:', err);
    return false;
  }
}

// ── VK helpers ──
async function vkUploadPhotos(photoUrls: string[]): Promise<string[]> {
  const photoToken = VK_USER_TOKEN || VK_TOKEN;
  const serverRes = await fetch(`https://api.vk.com/method/photos.getWallUploadServer?group_id=${VK_GROUP_ID}&access_token=${photoToken}&v=5.199`);
  const serverData = await serverRes.json();
  const uploadUrl = serverData?.response?.upload_url;
  if (!uploadUrl) { console.error('[post] VK: no photo upload URL', JSON.stringify(serverData)); return []; }

  const uploaded: string[] = [];
  for (const photoUrl of photoUrls.slice(0, 10)) {
    try {
      console.log(`[post] VK: downloading photo ${photoUrl.slice(0, 80)}...`);
      const photoResp = await fetch(photoUrl);
      if (!photoResp.ok) { console.error(`[post] VK: download failed ${photoResp.status}`); continue; }
      const buf = Buffer.from(await photoResp.arrayBuffer());
      console.log(`[post] VK: got ${buf.length} bytes, uploading photo...`);

      const boundary = '----VK' + Date.now();
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="photo.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
        buf,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      const upRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
        body,
      });
      const upData = await upRes.json();
      if (!upData.photo || upData.photo === '[]') { console.error('[post] VK: empty photo after upload'); continue; }

      const saveRes = await fetch(`https://api.vk.com/method/photos.saveWallPhoto?group_id=${VK_GROUP_ID}&photo=${encodeURIComponent(upData.photo)}&server=${upData.server}&hash=${upData.hash}&access_token=${photoToken}&v=5.199`);
      const saveData = await saveRes.json();
      const saved = saveData?.response?.[0];
      if (saved) {
        uploaded.push(`photo${saved.owner_id}_${saved.id}`);
        console.log(`[post] VK: saved photo${saved.owner_id}_${saved.id}`);
      } else {
        console.error('[post] VK photo save error:', JSON.stringify(saveData));
      }
    } catch (e) {
      console.error('[post] VK photo error:', e);
    }
  }
  return uploaded;
}

async function vkUploadVideos(videoUrls: string[]): Promise<string[]> {
  const videoToken = VK_USER_TOKEN || VK_TOKEN;
  const uploaded: string[] = [];

  for (const videoUrl of videoUrls.slice(0, 4)) {
    try {
      // 1. Create video entry — VK returns upload URL
      console.log(`[post] VK: creating video entry...`);
      const saveRes = await fetch(`https://api.vk.com/method/video.save?group_id=${VK_GROUP_ID}&is_private=0&wallpost=0&privacy_view=all&access_token=${videoToken}&v=5.199`);
      const saveData = await saveRes.json();
      const uploadUrl = saveData?.response?.upload_url;
      const ownerId = saveData?.response?.owner_id;
      const videoId = saveData?.response?.video_id;
      if (!uploadUrl) { console.error('[post] VK: no video upload URL', JSON.stringify(saveData)); continue; }

      // 2. Download video
      console.log(`[post] VK: downloading video ${videoUrl.slice(0, 80)}...`);
      const videoResp = await fetch(videoUrl);
      if (!videoResp.ok) { console.error(`[post] VK: video download failed ${videoResp.status}`); continue; }
      const buf = Buffer.from(await videoResp.arrayBuffer());
      console.log(`[post] VK: got ${buf.length} bytes, uploading video...`);

      // 3. Upload video file
      const boundary = '----VK' + Date.now();
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="video_file"; filename="video.mp4"\r\nContent-Type: video/mp4\r\n\r\n`),
        buf,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      const upRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
        body,
      });
      const upData = await upRes.json();
      console.log(`[post] VK video upload result: size=${upData.size || '?'}`);

      if (ownerId && videoId) {
        uploaded.push(`video${ownerId}_${videoId}`);
        console.log(`[post] VK: saved video${ownerId}_${videoId}`);
      }
    } catch (e) {
      console.error('[post] VK video error:', e);
    }
  }
  return uploaded;
}

async function postToVK(text: string, media: MediaItem[]): Promise<boolean> {
  if (!VK_TOKEN || !VK_GROUP_ID) { console.log('[post] VK not configured, skipping'); return false; }
  try {
    const photoUrls = media.filter(m => m.type === 'photo').map(m => m.url);
    const videoUrls = media.filter(m => m.type === 'video').map(m => m.url);

    const attachmentParts: string[] = [];

    if (photoUrls.length > 0) {
      const photos = await vkUploadPhotos(photoUrls);
      attachmentParts.push(...photos);
    }
    if (videoUrls.length > 0) {
      const videos = await vkUploadVideos(videoUrls);
      attachmentParts.push(...videos);
    }

    const params = new URLSearchParams({
      owner_id: `-${VK_GROUP_ID}`,
      from_group: '1',
      message: text,
      access_token: VK_TOKEN,
      v: '5.199',
    });
    if (attachmentParts.length) params.set('attachments', attachmentParts.join(','));

    const res = await fetch(`https://api.vk.com/method/wall.post?${params}`);
    const data = await res.json();
    if (data.error) console.error('[post] VK wall.post error:', data.error);
    return !!data?.response?.post_id;
  } catch (err) {
    console.error('[post] VK error:', err);
    return false;
  }
}

// ── Max media upload ──
// Upload photo/video to Max and get a token for attachment.
// Direct URLs from oneme.ru expire, so we always upload via Max API.
async function maxUploadMedia(mediaUrl: string, type: 'image' | 'video'): Promise<string | null> {
  try {
    const ext = type === 'image' ? 'jpg' : 'mp4';
    const mime = type === 'image' ? 'image/jpeg' : 'video/mp4';

    // 1. Get upload URL + token
    console.log(`[post] Max: getting ${type} upload URL...`);
    const uploadRes = await fetch(`${MAX_API}/uploads?type=${type}`, {
      method: 'POST',
      headers: { Authorization: MAX_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const uploadData = await uploadRes.json();
    const maxUploadUrl = uploadData?.url;
    if (!maxUploadUrl) { console.error(`[post] Max: no upload URL`, JSON.stringify(uploadData)); return null; }

    // 2. Download from source
    console.log(`[post] Max: downloading ${type} ${mediaUrl.slice(0, 80)}...`);
    const resp = await fetch(mediaUrl);
    if (!resp.ok) { console.error(`[post] Max: ${type} download failed ${resp.status}`); return null; }
    const buf = Buffer.from(await resp.arrayBuffer());
    console.log(`[post] Max: got ${buf.length} bytes, uploading ${type} to Max...`);

    // 3. Upload to Max
    const boundary = '----MAX' + Date.now();
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="data"; filename="file.${ext}"\r\nContent-Type: ${mime}\r\n\r\n`),
      buf,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const upRes = await fetch(maxUploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body,
    });
    const upJson = await upRes.json();
    console.log(`[post] Max ${type} upload result (${upRes.status}): ${JSON.stringify(upJson).slice(0, 300)}`);

    // For videos, token is at top level; for images, it's inside photos[id].token
    if (type === 'video') {
      return uploadData.token || null;
    }
    const photoEntry = Object.values(upJson.photos || {}) as any[];
    return photoEntry[0]?.token || null;
  } catch (err) {
    console.error(`[post] Max ${type} upload error:`, err);
    return null;
  }
}

async function postToMaxChannel(text: string, media: MediaItem[]): Promise<boolean> {
  if (!MAX_CHANNEL_ID) { console.log('[post] Max channel not configured, skipping'); return false; }
  try {
    const attachments: any[] = [];

    for (const m of media) {
      const token = await maxUploadMedia(m.url, m.type === 'video' ? 'video' : 'image');
      if (token) {
        attachments.push({ type: m.type === 'video' ? 'video' : 'image', payload: { token } });
      } else {
        console.error(`[post] Max: failed to upload ${m.type}, skipping`);
      }
    }

    const result = await maxSend(MAX_CHANNEL_ID, text, attachments.length ? attachments : undefined);
    if (result?.code) { console.error('[post] Max channel error:', JSON.stringify(result)); return false; }
    if (!result?.message?.body) { console.error('[post] Max channel unexpected:', JSON.stringify(result)); return false; }
    return true;
  } catch (err) {
    console.error('[post] Max channel error:', err);
    return false;
  }
}

// ── Publish to selected platforms ──
async function publishToSelected(session: Session): Promise<string[]> {
  const results: string[] = [];

  if (session.platforms.max) {
    const ok = await postToMaxChannel(session.texts.max, session.media);
    results.push(ok ? '✅ Max' : '❌ Max');
  }
  if (session.platforms.tg) {
    const ok = await postToTelegram(session.texts.tg, session.media);
    results.push(ok ? '✅ Telegram' : '❌ Telegram');
  }
  if (session.platforms.vk) {
    const ok = await postToVK(session.texts.vk, session.media);
    results.push(ok ? '✅ VK' : '❌ VK');
  }

  return results;
}

// ── Extract media from Max attachments ──
function extractMedia(attachments: any[]): MediaItem[] {
  const media: MediaItem[] = [];
  for (const a of attachments) {
    if (a.type === 'image' || a.type === 'photo') {
      const url = a.payload?.url
        || (a.payload?.token && `https://platform-api.max.ru/uploads/${a.payload.token}`)
        || '';
      if (!url && a.payload?.photos) {
        const sizes = Object.values(a.payload.photos) as any[];
        const best = sizes.sort((x: any, y: any) => (y.width || 0) - (x.width || 0))[0];
        if (best?.url) media.push({ type: 'photo', url: best.url });
        continue;
      }
      if (url) media.push({ type: 'photo', url });
    } else if (a.type === 'video') {
      const url = a.payload?.url
        || (a.payload?.token && `https://platform-api.max.ru/uploads/${a.payload.token}`)
        || '';
      if (!url && a.payload?.videos) {
        const sizes = Object.values(a.payload.videos) as any[];
        const best = sizes.sort((x: any, y: any) => (y.width || 0) - (x.width || 0))[0];
        if (best?.url) media.push({ type: 'video', url: best.url });
        continue;
      }
      if (url) media.push({ type: 'video', url });
    }
  }
  return media;
}

// ── Handle message ──
async function handleMessage(msg: any) {
  const text = msg.body?.text?.trim() || '';
  const userId = String(msg.sender?.user_id || '');
  const chatId = msg.recipient?.chat_id;
  const chatType = msg.recipient?.chat_type;
  if (!userId || !chatId) return;
  if (msg.sender?.is_bot) return;

  // Only work in private DMs
  if (chatType && chatType !== 'dialog') return;

  const session = getSession(userId);

  // Check session timeout
  if (session.authed && isSessionExpired(session)) {
    sessions.delete(userId);
    await maxSend(chatId, '⏰ Сессия публикации истекла (30 мин). Напишите «' + CODE_WORD + '» чтобы начать заново.');
    console.log(`[post] Session expired for ${userId}`);
    return;
  }

  // Extract media from attachments
  const attachments = msg.body?.attachments || [];
  const newMedia = extractMedia(attachments);
  if (newMedia.length) console.log(`[post] Extracted ${newMedia.length} media: ${newMedia.map(m => m.type).join(', ')}`);

  // ── Code word → auth ──
  if (text.toLowerCase() === CODE_WORD && !session.authed) {
    session.authed = true;
    session.chatId = chatId;
    session.state = 'waiting_content';
    await maxSend(chatId, '🔓 Режим публикации активен.\n\nОтправьте фото/видео + текст для поста.\nДля выхода: «выход».\nСессия истечёт через 30 мин.');
    console.log(`[post] User ${userId} authenticated`);
    return;
  }

  if (!session.authed) return;
  session.chatId = chatId;

  // ── Exit ──
  if (text.toLowerCase() === 'выход') {
    sessions.delete(userId);
    await maxSend(chatId, '👋 Режим публикации выключен.');
    console.log(`[post] User ${userId} exited posting mode`);
    return;
  }

  // ── Waiting for content ──
  if (session.state === 'waiting_content') {
    if (!text && newMedia.length === 0) {
      await maxSend(chatId, 'Отправьте фото/видео и текст к посту.');
      return;
    }

    if (newMedia.length > 0) {
      session.media = [...session.media, ...newMedia];
    }

    if (!text && newMedia.length > 0) {
      await maxSend(chatId, `📎 Получено (всего ${mediaSummary(session.media)}). Теперь отправьте текст к посту.`);
      return;
    }

    session.originalText = text;

    // AI rewrite
    await maxSend(chatId, '🤖 Адаптирую текст для площадок...');
    const texts = await rewriteForAllPlatforms(text);
    session.texts = texts;
    session.state = 'waiting_approval';
    session.platforms = { max: true, tg: true, vk: true };

    const preview = previewText(texts, session.media);
    await maxSend(chatId, preview, [platformToggleKeyboard(session.platforms)]);
    console.log(`[post] AI rewrite for ${userId}, ${mediaSummary(session.media)}`);
    return;
  }

  // ── Waiting for approval (text input = custom text) ──
  if (session.state === 'waiting_approval') {
    if (text === '-') {
      resetSession(session);
      await maxSend(chatId, '❌ Отменено. Отправьте новый контент.');
      return;
    }

    // Any text = custom text for re-adaptation
    await maxSend(chatId, '🤖 Адаптирую ваш текст для площадок...');
    const custom = await rewriteForAllPlatforms(text);
    session.texts = custom;
    session.platforms = { max: true, tg: true, vk: true };

    const preview = previewText(custom, session.media);
    await maxSend(chatId, preview, [platformToggleKeyboard(session.platforms)]);
    console.log(`[post] Custom text rewrite for ${userId}`);
    return;
  }

  // ── Waiting for confirm (text input = cancel) ──
  if (session.state === 'waiting_confirm') {
    if (text === '-' || text.toLowerCase() === 'отмена') {
      resetSession(session);
      await maxSend(chatId, '❌ Отменено. Отправьте новый контент.');
    }
    return;
  }
}

// ── Handle callback buttons ──
async function handleCallback(update: any) {
  const payload = update.callback?.payload;
  const uid = String(update.callback?.user?.user_id || update.user?.user_id || '');
  if (!payload || !uid) return;

  const session = sessions.get(uid);
  if (!session || !session.authed) return;

  const chatId = session.chatId;
  if (!chatId) return;

  session.lastActivity = Date.now();

  // ── Platform toggles ──
  if (payload === 'toggle_max' || payload === 'toggle_tg' || payload === 'toggle_vk') {
    const platform = payload.replace('toggle_', '') as Platform;
    session.platforms[platform] = !session.platforms[platform];

    // At least one must be selected
    if (!session.platforms.max && !session.platforms.tg && !session.platforms.vk) {
      session.platforms[platform] = true;
      await maxSend(chatId, '⚠️ Нужно выбрать хотя бы одну платформу.');
      return;
    }

    const preview = previewText(session.texts, session.media);
    await maxSend(chatId, preview, [platformToggleKeyboard(session.platforms)]);
    return;
  }

  // ── Publish button → show confirmation ──
  if (payload === 'publish') {
    const names = platformNames(session.platforms);
    session.state = 'waiting_confirm';
    await maxSend(chatId,
      `⚠️ Публикуем в: ${names}\n📎 ${mediaSummary(session.media)}\n\nПодтвердите публикацию:`,
      [confirmKeyboard(names)]
    );
    return;
  }

  // ── Custom text button ──
  if (payload === 'custom_text') {
    session.state = 'waiting_approval';
    await maxSend(chatId, '✏️ Отправьте свой текст — я адаптирую его для всех площадок.');
    return;
  }

  // ── Cancel ──
  if (payload === 'cancel') {
    resetSession(session);
    await maxSend(chatId, '❌ Отменено. Отправьте новый контент или «выход».');
    return;
  }

  // ── Confirm YES → publish ──
  if (payload === 'confirm_yes') {
    const names = platformNames(session.platforms);
    await maxSend(chatId, `📤 Публикую в ${names}...`);

    const results = await publishToSelected(session);
    await maxSend(chatId, `Результат:\n${results.join('\n')}\n\nОтправьте новый контент или «выход».`);

    console.log(`[post] Published: ${session.texts.max.slice(0, 60)}... | ${results.join(', ')}`);
    resetSession(session);
    return;
  }

  // ── Confirm BACK → back to platform selection ──
  if (payload === 'confirm_back') {
    session.state = 'waiting_approval';
    const preview = previewText(session.texts, session.media);
    await maxSend(chatId, preview, [platformToggleKeyboard(session.platforms)]);
    return;
  }
}

// ── Init & webhook handler ──
export async function initPostBot(): Promise<void> {
  if (!MAX_TOKEN) { console.log('[post] No MAX_POST_TOKEN, skipping'); return; }

  console.log(`[post] Posting bot starting (code word: "${CODE_WORD}")...`);

  try {
    const chats = await maxGetChats();
    console.log(`[post] Bot is in ${chats.length} chats:`);
    for (const c of chats) {
      console.log(`  - ${c.title || c.chat_id} (type: ${c.type}, id: ${c.chat_id})`);
    }
    if (!MAX_CHANNEL_ID) {
      const channel = chats.find((c: any) => c.type === 'channel');
      if (channel) console.log(`[post] Hint: set MAX_POST_CHANNEL_ID=${channel.chat_id}`);
    }
  } catch (err) {
    console.error('[post] Failed to list chats:', err);
  }
}

export async function handlePostUpdate(update: any): Promise<void> {
  if (update.update_type === 'message_created' && update.message) {
    await handleMessage(update.message);
  }
  if (update.update_type === 'message_callback' && update.callback) {
    await handleCallback(update);
  }
}
