export function createRouter() {
  const exact = new Map()
  const patterns = []
  const fallbacks = []

  return {
    add(method, path, handle) {
      const key = method + ' ' + path
      if (exact.has(key)) throw new Error('Duplicate route ' + key)
      exact.set(key, handle)
    },
    addPattern(method, pattern, handle) {
      patterns.push({ method, pattern, handle })
    },
    addFallback(matches, handle) {
      fallbacks.push({ matches, handle })
    },
    match(method, path) {
      const handle = exact.get(method + ' ' + path)
      if (handle) return handle
      for (const route of patterns) {
        if (route.method !== method) continue
        const match = route.pattern.exec(path)
        if (match) return context => route.handle(context, match)
      }
      return fallbacks.find(route => route.matches(path))?.handle
    },
  }
}
