// Vercel Serverless Function — Autocomplétion pour le profil de goûts.
// Endpoint unifié (économise une fonction sur le plan Hobby, limité à 12) :
//   GET /api/search?type=artists&q=kanye  → { artists: [{name, picture}] }
//   GET /api/search?type=cities&q=coton   → { cities:  [{name, sublabel}] }
//
// Pourquoi un proxy serveur : catalogues délégués à Deezer (artistes) et Photon
// (villes, OpenStreetMap) — gratuits, sans clé. On relaie côté serveur pour
// éviter les soucis CORS, masquer l'intégration et bénéficier du cache CDN.
// Aucune donnée utilisateur transmise, juste la chaîne recherchée.
//
// Auth : requireAuth (règle projet « tout /api → token »).

import { requireAuth } from '../lib/verifyAuth.js'

// Codes pays prioritaires pour les villes (ISO 3166-1 alpha-2, minuscules) :
// la scène LIVE IN BLACK remonte en tête (« Lomé » avant « Lom » en Norvège).
const CITY_PRIORITY = new Set(['tg', 'bj', 'ci', 'fr', 'sn', 'gh', 'ne', 'cm', 'ga', 'ml', 'bf', 'cg', 'cd', 'be', 'ch', 'ca', 'ma', 'gn', 'td'])

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const caller = await requireAuth(req, res)
  if (!caller) return

  const type = String(req.query.type || '').trim()
  const q = String(req.query.q || '').trim().slice(0, 60)

  if (type === 'artists') return searchArtists(q, res)
  if (type === 'cities') return searchCities(q, res)
  return res.status(400).json({ error: 'type must be "artists" or "cities"' })
}

// ─── Artistes (Deezer) ────────────────────────────────────────────────────────
async function searchArtists(q, res) {
  if (q.length < 2) return res.status(200).json({ artists: [] })
  try {
    const url = `https://api.deezer.com/search/artist?q=${encodeURIComponent(q)}&limit=8`
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 4000)
    const resp = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'liveinblack.com' } })
    clearTimeout(timer)
    if (!resp.ok) throw new Error(`deezer ${resp.status}`)
    const data = await resp.json()

    // Tri par popularité (nb_fan) : vrais artistes devant le bruit.
    const ranked = [...(data?.data || [])].sort((a, b) => (b?.nb_fan || 0) - (a?.nb_fan || 0))
    const seen = new Set()
    const artists = []
    for (const a of ranked) {
      const name = (a?.name || '').trim()
      if (!name) continue
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      artists.push({ name, picture: a.picture_small || a.picture || null })
      if (artists.length >= 8) break
    }
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800')
    return res.status(200).json({ artists })
  } catch (e) {
    console.warn('[search artists] deezer failed:', e.message)
    return res.status(200).json({ artists: [], degraded: true })
  }
}

// ─── Villes (Photon / OpenStreetMap) ─────────────────────────────────────────
async function searchCities(q, res) {
  if (q.length < 2) return res.status(200).json({ cities: [] })
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=12&lang=fr&layer=city`
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 4000)
    const resp = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'liveinblack.com' } })
    clearTimeout(timer)
    if (!resp.ok) throw new Error(`photon ${resp.status}`)
    const data = await resp.json()

    const seen = new Set()
    const rows = []
    for (const f of (data?.features || [])) {
      const p = f?.properties || {}
      const name = (p.name || '').trim()
      if (!name) continue
      const cc = (p.countrycode || '').toLowerCase()
      const key = `${name.toLowerCase()}|${cc}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({ name, country: p.country || '', priority: CITY_PRIORITY.has(cc) ? 0 : 1 })
    }
    rows.sort((a, b) => a.priority - b.priority) // pays prioritaires d'abord (tri stable)

    const byName = new Set()
    const cities = []
    for (const r of rows) {
      const nk = r.name.toLowerCase()
      if (byName.has(nk)) continue
      byName.add(nk)
      cities.push({ name: r.name, sublabel: r.country })
      if (cities.length >= 8) break
    }
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800')
    return res.status(200).json({ cities })
  } catch (e) {
    console.warn('[search cities] photon failed:', e.message)
    return res.status(200).json({ cities: [], degraded: true })
  }
}
