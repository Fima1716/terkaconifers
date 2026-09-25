<div align="center">

# Территория Хвойных — terkaconifers.ru

**Каталог хвойных растений России с фото из частных садов**

2 300+ сортов · 40+ регионов · 50+ коллекций

[![Live](https://img.shields.io/badge/Live-terkaconifers.ru-1a5632?style=for-the-badge)](https://terkaconifers.ru)

</div>

---

### Tech Stack

![Nuxt](https://img.shields.io/badge/Nuxt_4-00DC82?style=flat-square&logo=nuxt.js&logoColor=white)
![Vue 3](https://img.shields.io/badge/Vue_3-4FC08D?style=flat-square&logo=vue.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Pinia](https://img.shields.io/badge/Pinia-FFD859?style=flat-square&logo=vue.js&logoColor=black)
![Node.js](https://img.shields.io/badge/Node.js_22-339933?style=flat-square&logo=node.js&logoColor=white)
![PM2](https://img.shields.io/badge/PM2-2B037A?style=flat-square&logo=pm2&logoColor=white)
![DeepSeek](https://img.shields.io/badge/DeepSeek_AI-000000?style=flat-square&logo=openai&logoColor=white)
![Max.ru API](https://img.shields.io/badge/Max.ru_API-FF6600?style=flat-square)
![Telegram Bot API](https://img.shields.io/badge/Telegram_Bot-26A5E4?style=flat-square&logo=telegram&logoColor=white)
![VK API](https://img.shields.io/badge/VK_API-0077FF?style=flat-square&logo=vk&logoColor=white)

---

## О проекте

Веб-платформа для каталогизации хвойных растений из частных коллекций по всей России. Данные синхронизируются из мессенджера Max.ru, обогащаются AI и отображаются на сайте с фильтрацией, поиском, картой и карточками растений.

### Основные фичи

- **Каталог** — 2 300+ растений с фото, фильтры по роду, региону, форме кроны, цвету хвои
- **Карточка растения** — фотогалерея, характеристики, дневник роста, похожие сорта
- **Карта садов** — интерактивная карта с геокодированными коллекциями
- **Полнотекстовый поиск** — Fuse.js, поиск по латыни и русским названиям
- **Избранное** — локальное хранение, без регистрации
- **Мой сад** — личный кабинет садовода с дневником наблюдений
- **Админка** — редактирование карточек, управление контентом, аналитика
- **Менеджерская** — правка карточек и текста постов в MAX без доступа в админку
- **SEO** — SSR, Schema.org, Open Graph, sitemap

### Роли и доступы

| Роль | Что доступно |
|------|--------------|
| `super_admin` | Всё, включая админ-панель `/admin` |
| `manager` | Менеджерская `/manage`: карточки растений + текст постов в MAX. Админ-панель закрыта |
| `admin` | Садовод: свои сады и «Мой сад» |

Менеджер правит карточку через `/manage` или прямо на странице растения
(кнопки «Редактировать» и «Пост в MAX»). Правка текста уходит в канал MAX
и пересобирает каталог.

Создание менеджеров пачкой (пароли генерируются и печатаются один раз):

```bash
npx tsx scripts/create-managers.ts ivan:"Иван Петров" olga:"Ольга С."
npx tsx scripts/create-managers.ts --file managers.txt   # по строке на аккаунт
npx tsx scripts/create-managers.ts --reset ivan          # перевыдать пароль
```

Роль можно менять и вручную — админка → «Пользователи».

### Data Pipeline

```
Max.ru канал → sync-max.ts → catalog.json → enrich.ts → catalog-enriched.json → Nuxt SSR
```

- **sync-max.ts** — парсинг постов из Max-канала (фото, текст, хэштеги)
- **enrich.ts** — нормализация регионов, определение формы/цвета, зоны морозостойкости, AI-геокодинг
- **optimize-photos.ts** — генерация WebP-превью через Sharp

### Боты

| Бот | Платформа | Назначение |
|-----|-----------|------------|
| **Леший** | Max.ru | Консультант каталога Терка, FAQ, навигация |
| **РуСадович** | Max.ru | AI-консультант питомника Русинов Сад (DeepSeek) |
| **Публикатор** | Max.ru → TG → VK | Кросс-постинг: фото/видео + AI-рерайт текста |
| **Растение дня** | Max.ru + TG + VK | Автоматическая рубрика из каталога по крону |
| **TG Bridge** | Telegram | Мост сообщений Max ↔ Telegram |

---

## Архитектура

```
terka/
├── app/
│   ├── pages/           # Nuxt pages (каталог, карта, сады, админка...)
│   ├── components/      # Vue-компоненты (layout, catalog, plant, admin...)
│   ├── stores/          # Pinia stores (catalog, auth, favorites, cart)
│   └── utils/           # Хелперы (photoUrl, search)
├── server/
│   └── api/             # Nitro API routes (catalog, auth, gardens, admin)
├── scripts/
│   ├── sync-max.ts      # Синхронизация каталога из Max.ru
│   ├── enrich.ts        # Обогащение данных (регионы, формы, AI)
│   ├── bot.ts           # Бот «Леший»
│   ├── plant-of-the-day.ts  # Рубрика «Растение дня»
│   ├── tg-bridge.ts     # Telegram-мост
│   └── geocode-regions.ts   # Геокодинг садов
├── rusinovich/          # Отдельный проект: бот РуСадович + Публикатор
│   └── src/
│       ├── index.ts     # Точка входа, webhook-сервер
│       ├── max-bot.ts   # Консультант (Max.ru)
│       ├── post-bot.ts  # Публикатор (Max → TG → VK)
│       ├── llm.ts       # DeepSeek интеграция
│       └── catalog.ts   # Парсинг каталога rusinovsad.ru
├── data/
│   ├── raw/catalog.json         # Сырые данные из Max
│   └── catalog-enriched.json    # Обогащённый каталог
└── public/
    └── photos/          # Фото растений + WebP-превью
```

---

## Запуск

### Требования

- Node.js 22+
- npm

### Установка

```bash
git clone https://github.com/Fima1716/terkaconifers.git
cd terkaconifers
npm install
```

### Переменные окружения

Создайте `.env` в корне проекта:

```env
# Max.ru бот (для синхронизации и ботов)
MAX_BOT_TOKEN=...
MAX_CHAT_ID=...

# AI (DeepSeek — для обогащения и ботов)
DEEPSEEK_API_KEY=...

# Telegram (для TG-моста и кросс-постинга)
TG_BOT_TOKEN=...

# VK (для кросс-постинга)
VK_POST_TOKEN=...
VK_POST_GROUP_ID=...
```

### Разработка

```bash
npm run dev
```

Сайт будет доступен на `http://localhost:3000`

### Data Pipeline

```bash
# Синхронизация каталога из Max.ru
npm run sync

# Обогащение данных (регионы, формы, зоны)
npm run enrich
```

### Продакшен

```bash
# Сборка
npm run build

# Запуск через PM2
pm2 start ecosystem.config.cjs
```

### Деплой на сервер

```bash
npx nuxt build
rsync -avz .output/ root@server:/var/www/terka/.output/
ssh root@server "pm2 restart terka"
```
