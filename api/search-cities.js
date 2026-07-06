// Vercel Serverless Function — Recherche de villes pour l'autocomplétion du
// profil de goûts. Endpoint : GET /api/search-cities?q=coton
//
// Source : Photon (photon.komoot.io), géocodeur bâti sur OpenStreetMap et
// CONÇU pour l'autocomplétion (préfixes), contrairement à Nominatim qui exige
// des mots complets. Gratuit, sans clé. On relaie côté serveur (CORS + cache).
//
// Priorité : les villes des pays de la scène LIVE IN BLACK (Togo, Bénin, Côte
// d'Ivoire, France, francophonie…) remontent en tête, sinon « Lomé » se
// retrouvait derrière « Lom » (Norvège).

import { requireAuth } from '../lib/verifyAuth.js'

// Codes pays prioritaires (ISO 3166-1 alpha-2, minuscules)
const PRIORITY = new Set(['tg', 'bj', 'ci', 'fr', 'sn', 'gh', 'ne', 'cm', 'ga', 'ml', 'bf', 'cg', 'cd', 'be', 'ch', 'ca', 'ma', 'gn', 'td'])

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const caller = await requireAuth(req, res)
  if (!caller) return

  const q = String(req.query.q || '').trim().slice(0, 60)
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
      const country = p.country || ''
      // Dédup par nom+pays (Abidjan CI ≠ Abidjan GH), une seule fois chacun
      const key = `${name.toLowerCase()}|${cc}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({ name, country, priority: PRIORITY.has(cc) ? 0 : 1 })
    }
    // Pays prioritaires d'abord, ordre Photon conservé à l'intérieur (tri stable)
    rows.sort((a, b) => a.priority - b.priority)

    // Une seule entrée par NOM de ville (on stocke juste le nom ; le pays sert à
    // désambiguïser à l'affichage). Le tri ci-dessus fait gagner la bonne.
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
    console.warn('[search-cities] photon failed:', e.message)
    return res.status(200).json({ cities: [], degraded: true })
  }
}
