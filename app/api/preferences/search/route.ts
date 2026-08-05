import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { checkRateLimit } from '@/lib/server/rateLimit'

const querySchema = z.object({ type: z.enum(['artists', 'cities']), q: z.string().trim().min(2).max(60) })
const CITY_PRIORITY = new Set(['tg', 'bj', 'ci', 'fr', 'sn', 'gh', 'ne', 'cm', 'ga', 'ml', 'bf', 'cg', 'cd', 'be', 'ch', 'ca', 'ma', 'gn', 'td'])

async function fetchJson(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { 'User-Agent': 'liveinblack.com' }, next: { revalidate: 86400 } })
  if (!response.ok) throw new Error(`upstream_${response.status}`)
  return response.json() as Promise<Record<string, unknown>>
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })
  const url = new URL(req.url)
  const parsed = querySchema.safeParse({ type: url.searchParams.get('type'), q: url.searchParams.get('q') })
  if (!parsed.success) return NextResponse.json({ error: 'invalid_query' }, { status: 400 })

  const limit = await checkRateLimit({ scope: 'preference-search', identifier: session.user.id, limit: 80, windowMs: 15 * 60 * 1000 })
  if (!limit.allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } })

  try {
    if (parsed.data.type === 'artists') {
      const data = await fetchJson(`https://api.deezer.com/search/artist?q=${encodeURIComponent(parsed.data.q)}&limit=8`)
      const rows = Array.isArray(data.data) ? data.data as Array<Record<string, unknown>> : []
      const seen = new Set<string>()
      const artists = rows.sort((a, b) => Number(b.nb_fan || 0) - Number(a.nb_fan || 0)).flatMap((row) => {
        const name = String(row.name || '').trim()
        const key = name.toLocaleLowerCase('fr')
        if (!name || seen.has(key)) return []
        seen.add(key)
        return [{ name, picture: typeof row.picture_small === 'string' ? row.picture_small : typeof row.picture === 'string' ? row.picture : null }]
      }).slice(0, 8)
      return NextResponse.json({ artists })
    }

    const data = await fetchJson(`https://photon.komoot.io/api/?q=${encodeURIComponent(parsed.data.q)}&limit=12&lang=fr&layer=city`)
    const features = Array.isArray(data.features) ? data.features as Array<{ properties?: Record<string, unknown> }> : []
    const seen = new Set<string>()
    const rows = features.flatMap((feature) => {
      const props = feature.properties || {}
      const name = String(props.name || '').trim()
      const countryCode = String(props.countrycode || '').toLowerCase()
      const key = `${name.toLowerCase()}|${countryCode}`
      if (!name || seen.has(key)) return []
      seen.add(key)
      return [{ name, sublabel: String(props.country || ''), priority: CITY_PRIORITY.has(countryCode) ? 0 : 1 }]
    }).sort((a, b) => a.priority - b.priority)
    const byName = new Set<string>()
    const cities = rows.filter((row) => {
      const key = row.name.toLowerCase()
      if (byName.has(key)) return false
      byName.add(key)
      return true
    }).slice(0, 8).map(({ name, sublabel }) => ({ name, sublabel }))
    return NextResponse.json({ cities })
  } catch (error) {
    console.warn('[preferences/search] upstream unavailable:', error)
    return NextResponse.json({ [parsed.data.type]: [], degraded: true })
  }
}
