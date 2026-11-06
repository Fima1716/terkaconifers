/**
 * Сад в тексте от нейросети — ровно как в заявке.
 *
 * Нейросеть, форматируя заявку, иногда «чинит» название сада. 02.11 Мария
 * Тарасова, как всегда, написала «Хюгге Сад Марии Тарасовой», а в канал ушло
 * «Сад Хюгге Марии Тарасовой» и «Сад Марии Тарасовой» с такими же хэштегами —
 * на сайте это выглядело как чужие сады. Промпт это запрещает, но нейросеть
 * всё равно ошибается через раз, поэтому проверяем кодом: если в заявке есть
 * название известного сада (data/gardens.json), а нейросеть вернула его
 * искажённую версию, подставляем название из заявки — и в строку сада,
 * и в хэштег.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

const GARDENS_PATH = resolve(import.meta.dirname, '../../data/gardens.json')

function knownGardens(): string[] {
  try { return Object.keys(JSON.parse(readFileSync(GARDENS_PATH, 'utf-8')).gardens || {}) } catch { return [] }
}

const squash = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[\s#_]+/g, '')

/** Значимые слова: «#СадХюггеМарииТарасовой» → хюгге, марии, тарасовой */
function words(s: string): Set<string> {
  return new Set(
    s.replace(/([а-яёa-z])([А-ЯЁA-Z])/g, '$1 $2').toLowerCase().replace(/ё/g, 'е')
      .split(/[^а-яa-z0-9]+/)
      .filter(w => w.length > 2 && w !== 'сад'),
  )
}

/** Самый длинный известный сад, чьё название целиком есть в заявке */
export function gardenFromSubmission(rawText: string, gardens = knownGardens()): string {
  const raw = squash(rawText)
  return gardens
    .filter(g => squash(g).length >= 8 && raw.includes(squash(g)))
    .sort((a, b) => squash(b).length - squash(a).length)[0] || ''
}

/**
 * Правит строку сада и хэштег сада, только если нейросеть вернула вариант
 * того же сада (есть общие слова). Другой сад или отсутствие сада в заявке —
 * текст не трогаем.
 */
export function pinGarden(rawText: string, formatted: string, gardens?: string[]): string {
  const garden = gardenFromSubmission(rawText, gardens)
  if (!garden) return formatted
  const own = words(garden)
  const related = (s: string) => [...words(s)].some(w => own.has(w))
  const tag = '#' + garden.replace(/\s+/g, '')

  const lines = formatted.split('\n')
  const firstTag = lines.findIndex(l => l.trim().startsWith('#'))

  // Строка сада — последняя непустая перед хэштегами
  for (let i = (firstTag < 0 ? lines.length : firstTag) - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (!line) continue
    if (!/^(Возраст|Размер|Оригинатор|Регион)/i.test(line) && related(line)) lines[i] = garden
    break
  }

  const out: string[] = []
  for (const line of lines) {
    const fixed = line.trim().startsWith('#') && related(line) ? tag : line
    if (fixed === tag && out.includes(tag)) continue // вариант и правильный хэштег сразу — оставляем один
    out.push(fixed)
  }
  return out.join('\n')
}
