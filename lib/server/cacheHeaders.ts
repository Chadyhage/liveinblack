export function createCacheHeaders({
  maxAgeSeconds,
  staleWhileRevalidateSeconds,
  shared = false,
}: {
  maxAgeSeconds: number
  staleWhileRevalidateSeconds?: number
  shared?: boolean
}) {
  const isShared = Boolean(shared)
  const stalePart = staleWhileRevalidateSeconds ? `, stale-while-revalidate=${staleWhileRevalidateSeconds}` : ''
  const cacheControl = isShared
    ? `public, s-maxage=${maxAgeSeconds}${stalePart}, max-age=${Math.max(1, Math.floor(maxAgeSeconds / 4))}`
    : `public, max-age=${maxAgeSeconds}${stalePart}`

  if (isShared) {
    return {
      'Cache-Control': cacheControl,
      'CDN-Cache-Control': `max-age=${maxAgeSeconds}${stalePart}`,
      'Vary': 'Accept-Encoding',
    }
  }

  return {
    'Cache-Control': cacheControl,
    'Vary': 'Accept-Encoding',
    'CDN-Cache-Control': `max-age=${maxAgeSeconds}`,
  }
}
