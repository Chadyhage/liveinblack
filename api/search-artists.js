// Vercel Serverless Function — Recherche d'artistes/DJs pour l'autocomplétion
// du profil de goûts. Endpoint : GET /api/search-artists?q=kanye
//
// Pourquoi un proxy serveur : le catalogue mondial est délégué à l'API Deezer
// (gratuite, SANS clé, catalogue complet). On la relaie côté serveur pour :
//  - éviter les soucis CORS (Deezer ne renvoie pas d'en-têtes CORS navigateur) ;
//  - masquer l'intégration derrière notre domaine (une seule source à changer) ;
//  - mettre en cache CDN (le même « kanye » n'appelle Deezer qu'une fois).
// Aucune donnée utilisateur n'est envoyée à Deezer, juste la chaîne recherchée.
//
// Auth : requireAuth (règle projet « tout /api → token »). L'utilisateur est
// toujours connecté quand il remplit ses goûts (bannière/onboarding gated).

import { requireAuth } from '../lib/verifyAuth.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const caller = await requireAuth(req, res)
  if (!caller) return

  const q = String(req.query.q || '').trim().slice(0, 60)
  if (q.length < 2) return res.status(200).json({ artists: [] })

  try {
    const url = `https://api.deezer.com/search/artist?q=${encodeURIComponent(q)}&limit=8`
    // AbortController : ne jamais laisser une lenteur Deezer bloquer la saisie
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 4000)
    const resp = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'liveinblack.com' } })
    clearTimeout(timer)
    if (!resp.ok) throw new Error(`deezer ${resp.status}`)
    const data = await resp.json()

    // Tri par popularité (nb_fan) : les vrais artistes (millions de fans)
    // passent devant le bruit (remixes, comptes parodiques à 0 fan).
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

    // Cache CDN : mêmes requêtes servies sans re-frapper Deezer (1 jour, +stale)
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800')
    return res.status(200).json({ artists })
  } catch (e) {
    // Jamais bloquant : en cas d'échec Deezer, le client retombe sur sa liste
    // locale + l'ajout manuel. On renvoie 200 avec liste vide.
    console.warn('[search-artists] deezer failed:', e.message)
    return res.status(200).json({ artists: [], degraded: true })
  }
}
