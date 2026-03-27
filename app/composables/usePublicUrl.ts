/** Returns full URL for a file in public/ — respects app.baseURL */
export function usePublicUrl() {
  const base = useRuntimeConfig().app.baseURL || '/'
  return (path: string) => base + path
}
