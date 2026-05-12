import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

interface PromptConfig {
  role: string;
  tone: string;
  rules: { enabled: boolean; text: string }[];
  fallbackResponse: string;
  catalogLinks: { category: string; url: string }[];
  knowledgeBase: string;
  greeting: string;
  maxLength: number;
}

// Try multiple paths for config
const PATHS = [
  join(process.cwd(), 'data', 'rusinov-prompt.json'),
  join(process.cwd(), '..', 'data', 'rusinov-prompt.json'),
  '/var/www/rusadovich/data/rusinov-prompt.json',
  '/var/www/terka/data/rusinov-prompt.json',
];

const CONFIG_PATH = PATHS.find(p => existsSync(p));
if (!CONFIG_PATH) {
  console.error('[prompt] Config not found in any of:', PATHS);
}

// Cache config, reload every 60 seconds max
let cachedConfig: PromptConfig | null = null;
let lastLoad = 0;
const CACHE_TTL = 60_000;

function loadConfig(): PromptConfig {
  if (cachedConfig && Date.now() - lastLoad < CACHE_TTL) return cachedConfig;

  try {
    if (!CONFIG_PATH) throw new Error('No config path found');
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    cachedConfig = JSON.parse(raw);
    lastLoad = Date.now();
    return cachedConfig!;
  } catch (err) {
    console.error('[prompt] Failed to load config:', err);
    if (cachedConfig) return cachedConfig; // use stale cache
    // Minimal fallback
    return {
      role: 'Ты — консультант питомника хвойных растений "Русинов Сад".',
      tone: 'Профессиональный и дружелюбный.',
      rules: [],
      fallbackResponse: 'Пожалуйста, посетите наш сайт https://rusinovsad.ru/',
      catalogLinks: [],
      knowledgeBase: '',
      greeting: 'Здравствуйте! Я консультант питомника "Русинов Сад".',
      maxLength: 1500,
    };
  }
}

export function getGreeting(): string {
  return loadConfig().greeting;
}

export function buildSystemPrompt(): string {
  const cfg = loadConfig();

  const enabledRules = cfg.rules
    .filter(r => r.enabled)
    .map((r, i) => `${i + 1}. ${r.text}`)
    .join('\n');

  const catalogSection = cfg.catalogLinks
    .map(l => `${l.category} ${l.url}`)
    .join('\n');

  // Current date context so bot knows the season
  const now = new Date();
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const dateStr = `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
  const month = now.getMonth() + 1; // 1-12

  let salesStatus: string;
  if (month >= 7 && month <= 11) {
    salesStatus = 'СЕЙЧАС ПЕРИОД ПРОДАЖ. Каталог на сайте актуален, заказы принимаются.';
  } else {
    salesStatus = 'СЕЙЧАС ПРОДАЖИ ЗАКРЫТЫ. Каталог на сайте носит ознакомительный характер. Продажи откроются в июле (после 10 числа). Весенних продаж нет. НЕ ГОВОРИ что продажи открыты или что можно оформить заказ прямо сейчас.';
  }

  return `${cfg.role}

СЕГОДНЯ: ${dateStr}
СТАТУС ПРОДАЖ: ${salesStatus}

ТОН И СТИЛЬ ОБЩЕНИЯ:
${cfg.tone}

КЛЮЧЕВЫЕ ПРАВИЛА:
${enabledRules}

ОТВЕТ ПО УМОЛЧАНИЮ (если нет информации в базе знаний):
"${cfg.fallbackResponse}"

ССЫЛКИ НА КАТАЛОГ (для вопросов о конкретных культиварах):
${catalogSection}

БАЗА ЗНАНИЙ:
${cfg.knowledgeBase}

Максимальная длина ответа: ${cfg.maxLength} символов.`;
}
