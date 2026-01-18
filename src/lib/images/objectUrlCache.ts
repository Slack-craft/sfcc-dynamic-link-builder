type CacheEntry = {
  url: string
  lastUsed: number
}

const cache = new Map<string, CacheEntry>()

export function getObjectUrl(cacheKey: string, blob: Blob) {
  const existing = cache.get(cacheKey)
  if (existing) {
    existing.lastUsed = Date.now()
    return existing.url
  }
  const url = URL.createObjectURL(blob)
  cache.set(cacheKey, { url, lastUsed: Date.now() })
  return url
}

export function revokeObjectUrl(cacheKey: string) {
  const entry = cache.get(cacheKey)
  if (!entry) return
  URL.revokeObjectURL(entry.url)
  cache.delete(cacheKey)
}

export function clearObjectUrlCache() {
  cache.forEach((entry) => URL.revokeObjectURL(entry.url))
  cache.clear()
}
