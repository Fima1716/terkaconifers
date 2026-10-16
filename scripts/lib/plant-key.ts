/**
 * Ключи склейки карточек — общие для синка, бэкфилла и склейки дублей.
 *
 * Исторически карточка узнавалась по первой латинской строке поста плюс
 * хэштегу сада. Строку автор переписывает (дописывает город, меняет кавычки),
 * хэштег то появляется, то исчезает — и на сайте заводилась вторая карточка.
 * Поэтому решает пара «род + вид + сорт + сад», а не сырой текст.
 */

const QUOTES = /[‘’“”''""'"`]/g

export interface Keyable {
  genus?: string
  species?: string
  cultivar?: string
  garden?: string
  region?: string
}

export function normGarden(garden?: string): string {
  return (garden || '').replace(/\s+/g, '').toLowerCase()
}

/**
 * Ключ «род + вид + сорт + сад». Пустой, если сорта нет: без него склейка
 * слишком груба — в одном саду могут расти разные экземпляры одного вида.
 */
export function cultKey(p: Keyable): string {
  const cult = (p.cultivar || '').replace(QUOTES, '').replace(/\s+/g, ' ').trim().toLowerCase()
  if (!cult) return ''
  return `${(p.genus || '').toLowerCase()}|${(p.species || '').toLowerCase()}|${cult}|||${normGarden(p.garden)}`
}

/** Разные регионы — разные растения, даже если сорт и сад совпали */
export function regionsClash(a?: string, b?: string): boolean {
  const x = (a || '').trim().toLowerCase()
  const y = (b || '').trim().toLowerCase()
  if (!x || !y) return false
  const head = (s: string) => s.split(',')[0].trim()
  return !x.includes(head(y)) && !y.includes(head(x))
}

/** Сорт из первой строки поста: между первой и последней кавычкой */
export function extractCultivar(line: string): string {
  const chars = new Set([`'`, '‘', '’', '“', '”', '`', '"'])
  let open = -1
  for (let i = 0; i < line.length; i++) if (chars.has(line[i])) { open = i; break }
  if (open < 0) return ''
  let close = -1
  for (let i = line.length - 1; i > open; i--) if (chars.has(line[i])) { close = i; break }
  return close <= open ? '' : line.slice(open + 1, close).trim()
}
