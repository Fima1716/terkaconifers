import OpenAI from 'openai';
import { buildSystemPrompt } from './prompt.js';
import { searchCatalog, getInStockByCategory, getCatalogStats, type CatalogItem } from './catalog.js';

const client = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY,
  timeout: 45_000,
  maxRetries: 2,
});

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// Detect if user is asking about a specific plant
function extractPlantQuery(text: string): string | null {
  const lower = text.toLowerCase();
  const triggers = [
    'есть ли', 'есть у вас', 'в наличии', 'хочу купить', 'хочу заказать',
    'сколько стоит', 'цена', 'какие есть', 'подскажите сорт',
    'нужна', 'нужен', 'ищу', 'интересует', 'покажите',
  ];
  const plantWords = [
    'ель', 'сосна', 'туя', 'можжевельник', 'пихта', 'лиственница',
    'микробиота', 'кипарисовик', 'гинкго', 'тсуга', 'кедр', 'бересклет',
    'ива', 'клен', 'клён', 'picea', 'pinus', 'thuja', 'juniperus', 'abies', 'larix',
  ];

  const hasTrigger = triggers.some(t => lower.includes(t));
  const hasPlant = plantWords.some(p => lower.includes(p));

  if (hasTrigger || hasPlant) {
    const stopWords = [
      'есть ли', 'есть у вас', 'в наличии', 'хочу купить', 'хочу заказать',
      'сколько стоит', 'какие есть', 'подскажите', 'покажите', 'можно ли',
      'можете', 'у вас', 'интересует', 'нужна', 'нужен', 'нужно', 'ищу',
      'хочу', 'купить', 'заказать', 'есть', 'цена', 'можно', 'скинешь',
      'ссылки', 'ссылку', 'какие', 'растения',
    ];
    let cleaned = text.replace(/[?!.,;:]/g, '').toLowerCase();
    for (const sw of stopWords.sort((a, b) => b.length - a.length)) {
      cleaned = cleaned.replaceAll(sw, ' ');
    }
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    return cleaned || null;
  }
  return null;
}

function formatCatalogResults(items: CatalogItem[]): string {
  if (!items.length) return '';

  const lines = items.map(item => {
    if (item.inStock) {
      return `- ${item.name} >>> МОЖНО КУПИТЬ <<< ${item.url}`;
    } else {
      return `- ${item.name} >>> НЕТ В ПРОДАЖЕ <<< ${item.url}`;
    }
  });

  return `\n\nДАННЫЕ КАТАЛОГА (с сайта rusinovsad.ru, достоверные):\n${lines.join('\n')}`;
}

// Category link map for fallback
const CATEGORY_LINKS: Record<string, string> = {
  'Ели': 'https://rusinovsad.ru/eli.html',
  'Сосны 2-хвойные': 'https://rusinovsad.ru/sosni2.html',
  'Сосны 5-хвойные': 'https://rusinovsad.ru/sosny-5khvoinye.html',
  'Туи': 'https://rusinovsad.ru/tui.html',
  'Можжевельники': 'https://rusinovsad.ru/mozhzhevelniki.html',
  'Пихты': 'https://rusinovsad.ru/pikhty.html',
  'Лиственницы': 'https://rusinovsad.ru/lisvennitsy.html',
  'Микробиоты и Кипарисовики': 'https://rusinovsad.ru/mikrobioty.html',
  'Другие хвойные': 'https://rusinovsad.ru/drugie-khvoinye.html',
  'Лиственные': 'https://rusinovsad.ru/catalog/listvenie.html',
};

// Detect general "what's in stock?" questions
function isGeneralStockQuestion(text: string): boolean {
  const lower = text.toLowerCase();
  const patterns = [
    /что.*(есть|сейчас).*(в наличии|в продаже|можно купить)/,
    /какие.*(растения|товар|сорт).*(в наличии|есть|доступн)/,
    /что.*(в наличии|можно купить|доступно)/,
    /есть.*хоть.*что/,
    /что.*продает/,
    /покажи.*(ассортимент|каталог|что есть)/,
    /^что в наличии/,
    /^что есть$/,
  ];
  return patterns.some(p => p.test(lower));
}

// Detect category-specific stock question: "что есть из елей?"
function detectCategoryQuestion(text: string): string | null {
  const lower = text.toLowerCase();
  const categoryMap: [RegExp, string][] = [
    [/ел[ьией]|picea|ёлк|ёлок|елок|елки/i, 'Ели'],
    [/сосн[аыу].*2|двухвойн|сосн.*обыкновен|сосн.*горн/i, 'Сосны 2-хвойные'],
    [/сосн[аыу].*5|пятихвойн|сосн.*кедров|сосн.*веймут/i, 'Сосны 5-хвойные'],
    [/сосн/i, 'Сосны 2-хвойные'], // generic "сосна" → 2-хвойные
    [/ту[яиюй]|thuja/i, 'Туи'],
    [/можжевельник|juniperus/i, 'Можжевельники'],
    [/пихт[аыу]|abies/i, 'Пихты'],
    [/лиственниц|larix/i, 'Лиственницы'],
    [/микробиот|кипарисовик/i, 'Микробиоты и Кипарисовики'],
    [/лиственн|бересклет|ив[аыу]\b|клен|клён/i, 'Лиственные'],
  ];
  const stockPatterns = [/в наличии/, /есть.*из/, /какие.*есть/, /что.*есть.*из/, /покажи/, /доступн/];
  const isStockQ = stockPatterns.some(p => p.test(lower));
  if (!isStockQ) return null;

  for (const [re, cat] of categoryMap) {
    if (re.test(lower)) return cat;
  }
  return null;
}

function buildStockResponse(filterCategory?: string): string {
  const grouped = getInStockByCategory();
  const stats = getCatalogStats();

  // Filter to specific category if requested
  if (filterCategory) {
    const items = grouped.get(filterCategory) || [];
    const catLink = CATEGORY_LINKS[filterCategory] || 'https://rusinovsad.ru/';

    if (items.length === 0) {
      return `Сейчас в категории "${filterCategory}" нет товаров в продаже.

Ознакомиться с полным ассортиментом этой категории можно здесь:
${catLink}

На карточке каждого товара есть кнопка СООБЩИТЬ О НАЛИЧИИ — нажмите, и вам придёт уведомление, когда растение появится в продаже.`;
    }

    let response = `${filterCategory.toUpperCase()} — в продаже ${items.length}:\n`;
    for (const item of items.slice(0, 15)) {
      response += `\n- ${item.name}\n${item.url}`;
    }
    if (items.length > 15) {
      response += `\n\n...и ещё ${items.length - 15}. Полный список: ${catLink}`;
    }
    return response;
  }

  // General: nothing in stock
  if (grouped.size === 0) {
    const month = new Date().getMonth() + 1;
    if (month < 7) {
      return `Сейчас продажи закрыты. Они откроются в ИЮЛЕ (после 10 числа).

В каталоге ${stats.total} сортов, но пока ни один не выставлен в продажу. Вы можете ознакомиться с ассортиментом на сайте и подписаться на уведомления (кнопка СООБЩИТЬ О НАЛИЧИИ на карточке товара).

Каталог: https://rusinovsad.ru/

Следите за новостями: https://t.me/rusinovsad`;
    }
    return `К сожалению, сейчас всё распродано. Следите за обновлениями на сайте https://rusinovsad.ru/ и в Телеграм: https://t.me/rusinovsad`;
  }

  // General: few items (<=20) → list all
  if (stats.inStock <= 20) {
    let response = `Сейчас В ПРОДАЖЕ ${stats.inStock} позиций:\n`;
    for (const [category, items] of grouped) {
      response += `\n${category.toUpperCase()}\n`;
      for (const item of items) {
        response += `- ${item.name}\n${item.url}\n`;
      }
    }
    response += `\nВесь каталог (${stats.total} сортов): https://rusinovsad.ru/`;
    return response;
  }

  // General: many items (>20) → summary by category with counts and links
  let response = `Сейчас В ПРОДАЖЕ ${stats.inStock} позиций из ${stats.total} в каталоге.\n\nПо категориям:\n`;
  for (const [category, items] of grouped) {
    const link = CATEGORY_LINKS[category] || 'https://rusinovsad.ru/';
    response += `\n${category.toUpperCase()} — ${items.length} шт.\n${link}`;
  }
  response += `\n\nПолный каталог: https://rusinovsad.ru/`;
  return response;
}

export interface ReplyMeta {
  reply: string;
  queryType: 'product' | 'stock_general' | 'stock_category' | 'conversation';
  catalogHits: number;
  latencyMs: number;
  searchQuery?: string;        // cleaned plant search term
  catalogMatches?: string[];   // names of matched catalog items
  stockCategory?: string;      // category for stock_category queries
}

export async function generateReply(userMessage: string, history: Message[]): Promise<ReplyMeta> {
  const startTs = Date.now();

  // Handle category-specific stock question: "что есть из елей?"
  const categoryQ = detectCategoryQuestion(userMessage);
  if (categoryQ) {
    console.log(`[llm] Category stock question: ${categoryQ}`);
    const reply = buildStockResponse(categoryQ);
    return { reply, queryType: 'stock_category', catalogHits: 0, latencyMs: Date.now() - startTs, stockCategory: categoryQ };
  }

  // Handle general stock questions deterministically (no LLM)
  if (isGeneralStockQuestion(userMessage)) {
    console.log('[llm] General stock question — deterministic response');
    const reply = buildStockResponse();
    return { reply, queryType: 'stock_general', catalogHits: 0, latencyMs: Date.now() - startTs };
  }

  const systemPrompt = buildSystemPrompt();

  // Search catalog for plant queries
  const plantQuery = extractPlantQuery(userMessage);
  let catalogContext = '';
  let catalogHits = 0;
  let queryType: ReplyMeta['queryType'] = 'conversation';
  let searchQuery: string | undefined;
  let catalogMatches: string[] | undefined;

  if (plantQuery) {
    queryType = 'product';
    searchQuery = plantQuery;
    // Split by "и" to search for each plant separately
    const subQueries = plantQuery.split(/\s+и\s+|,\s*|а также/i).map(s => s.trim()).filter(s => s.length > 2);
    const allResults = new Map<string, CatalogItem>();
    for (const sq of subQueries.length > 1 ? subQueries : [plantQuery]) {
      for (const item of searchCatalog(sq)) {
        allResults.set(item.url, item);
      }
    }
    const results = [...allResults.values()].slice(0, 8);
    catalogHits = results.length;
    catalogMatches = results.map(r => r.name);
    catalogContext = formatCatalogResults(results);

    if (results.length) {
      const allOutOfStock = results.every(r => !r.inStock);
      if (allOutOfStock) {
        catalogContext += '\n\nВСЕ НАЙДЕННЫЕ ТОВАРЫ НЕ В ПРОДАЖЕ. Скажи клиенту что сейчас этих сортов нет в продаже. Дай ссылки на карточки. На каждой карточке есть кнопка СООБЩИТЬ О НАЛИЧИИ — предложи нажать её для уведомления. НЕ ГОВОРИ что товар в наличии или что можно оформить заказ.';
      } else {
        catalogContext += '\n\nИспользуй статус из данных выше. "МОЖНО КУПИТЬ" = в наличии, "НЕТ В ПРОДАЖЕ" = нельзя купить. Для товаров не в продаже предложи кнопку СООБЩИТЬ О НАЛИЧИИ на странице товара.';
      }
      catalogContext += ' Не выдумывай цены.';
    } else {
      catalogContext += '\n\nВ каталоге точного совпадения не найдено. Направь клиента на соответствующий раздел сайта.';
    }

    console.log(`[llm] Search "${plantQuery}" -> ${results.length} results`);
  }

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt + catalogContext },
    ...history,
    { role: 'user', content: userMessage },
  ];

  try {
    const response = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages,
      max_tokens: 1024,
      temperature: 0.2,
    });

    let reply = response.choices[0]?.message?.content?.trim() ?? 'Извините, произошла ошибка. Попробуйте позже.';

    // Post-processing: fix hallucinations about sales status
    const month = new Date().getMonth() + 1;
    if (month < 7 || month > 11) {
      // Sales are CLOSED — fix if LLM says otherwise
      const falsePositives = [
        /сейчас продажи открыты/gi,
        /продажи уже открыты/gi,
        /продажи открыты/gi,
        /можете оформить заказ/gi,
        /можно оформить заказ/gi,
        /оформить заказ прямо сейчас/gi,
      ];
      for (const re of falsePositives) {
        reply = reply.replace(re, 'продажи откроются в июле (после 10 числа)');
      }
    }

    return { reply, queryType, catalogHits, latencyMs: Date.now() - startTs, searchQuery, catalogMatches };
  } catch (err) {
    console.error('[llm] API error:', err);
    throw err;
  }
}
