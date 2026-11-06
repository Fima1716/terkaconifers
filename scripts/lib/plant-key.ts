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

/**
 * Сорт для сравнения: без кавычек и регистра, а притяжательная «s» у слов
 * перед последним отброшена. Авторы пишут одно и то же растение то
 * 'Carsten's Wintergold', то 'Carstens', то 'Carsten' — и получали дубль.
 */
function normCultivar(cultivar?: string): string {
  const words = (cultivar || '').replace(QUOTES, '').replace(/\s+/g, ' ').trim().toLowerCase().split(' ')
  return words.map((w, i) => (i < words.length - 1 ? w.replace(/s$/, '') : w)).join(' ')
}

export function normGarden(garden?: string): string {
  return (garden || '').replace(/\s+/g, '').toLowerCase()
}

/**
 * Ключ «род + вид + сорт + сад». Пустой, если сорта нет: без него склейка
 * слишком груба — в одном саду могут расти разные экземпляры одного вида.
 */
export function cultKey(p: Keyable): string {
  const cult = normCultivar(p.cultivar)
  if (!cult) return ''
  return `${(p.genus || '').toLowerCase()}|${(p.species || '').toLowerCase()}|${cult}|||${normGarden(p.garden)}`
}

/**
 * Один и тот же сад, записанный по-разному: «СадОльгиМолчановой» и
 * «СадМолчановойОльги», «Avalongarden» и «СадAvalongar_Den».
 * Слова «сад»/«частный» и разделители не в счёт, порядок слов тоже.
 */
export function sameGarden(a?: string, b?: string): boolean {
  const words = (s: string) => s
    .replace(/([a-zа-яё])([A-ZА-ЯЁ])/g, '$1 $2')
    .toLowerCase().split(/[^a-zа-яё0-9]+/)
    .filter(w => w && w !== 'сад' && w !== 'частный')
  // «ЧастныйсадТатарстан», «русиновсад» — слова слиплись, сравниваем сплошной строкой
  const squash = (s: string) => s.toLowerCase().replace(/[^a-zа-яё0-9]/g, '').replace(/частный|сад/g, '')
  const x = words(a || ''), y = words(b || '')
  if (!x.length || !y.length) return false
  if (squash(a || '') === squash(b || '')) return true
  return [...x].sort().join(' ') === [...y].sort().join(' ')
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
