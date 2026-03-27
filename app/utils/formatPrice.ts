export function formatPrice(price: number | null | undefined): string {
  if (price == null) return 'По запросу'
  return new Intl.NumberFormat('ru-RU').format(price) + ' ₽'
}

export function shortRegion(r: string): string {
  return r ? r.split(',')[0].split('.')[0].trim() : ''
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-|-$/g, '')
}
