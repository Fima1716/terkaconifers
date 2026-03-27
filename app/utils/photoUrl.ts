/** Resolves photo path — external URLs used as-is, local paths prefixed with app baseURL */
export function photoUrl(path: string): string {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  const base = useRuntimeConfig().app.baseURL || '/'
  return base + path
}

/** Returns WebP thumbnail URL for a thumb path (falls back to original for external URLs) */
export function thumbWebpUrl(path: string): string {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  const webp = path.replace(/\.jpg$/i, '.webp')
  const base = useRuntimeConfig().app.baseURL || '/'
  return base + webp
}

/** Returns micro WebP thumbnail URL (~1KB, 50px wide, for blur-up placeholder) */
export function thumbMicroUrl(path: string): string {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  const micro = path.replace(/_thumb\.jpg$/i, '_micro.webp')
  const base = useRuntimeConfig().app.baseURL || '/'
  return base + micro
}

/** Returns hi-res WebP thumbnail URL (~80KB, 500px wide, for retina upgrade) */
export function thumbHiresUrl(path: string): string {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  const hires = path.replace(/_thumb\.jpg$/i, '_hires.webp')
  const base = useRuntimeConfig().app.baseURL || '/'
  return base + hires
}
