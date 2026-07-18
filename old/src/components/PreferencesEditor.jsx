import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AMBIANCES,
  BUDGETS,
  EMPTY_PREFERENCES,
  EVENT_TYPES,
  FREQUENCIES,
  GROUP_PREFS,
  MUSIC_STYLES,
} from '../utils/recommendations'
import { ARTIST_SUGGESTIONS, CITY_SUGGESTIONS } from '../data/tasteOptions'
import { IconCheck } from './icons'

// ─── Éditeur de goûts client — WIZARD étape par étape ─────────────────────────
// Onboarding post-inscription + « Régler mes goûts » depuis les Paramètres.
// Tout est OPTIONNEL (chaque étape peut être passée). Sauvegarde progressive :
// à chaque avancement on persiste (setUser + lib_user + syncDoc), donc quitter
// en cours conserve ce qui est déjà rempli.

const FONT = 'Inter, system-ui, sans-serif'
const TEAL = '#4ee8c8'
const VIOLET = '#8444ff'

const norm = v => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

// Recherche d'artistes via notre proxy Deezer (catalogue mondial). Auth requise.
// Échec/hors-ligne → [] (le composant retombe sur la liste locale + ajout manuel).
async function searchArtistsRemote(q) {
  try {
    const { authHeaders } = await import('../utils/apiAuth')
    const res = await fetch(`/api/search?type=artists&q=${encodeURIComponent(q)}`, { headers: { ...(await authHeaders()) } })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data?.artists) ? data.artists : []
  } catch { return [] }
}

// Recherche de villes via notre proxy Photon/OpenStreetMap (monde entier).
async function searchCitiesRemote(q) {
  try {
    const { authHeaders } = await import('../utils/apiAuth')
    const res = await fetch(`/api/search?type=cities&q=${encodeURIComponent(q)}`, { headers: { ...(await authHeaders()) } })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data?.cities) ? data.cities : []
  } catch { return [] }
}

export function savePreferences(user, setUser, preferences) {
  const uid = user?.uid || user?.id
  if (!uid) return
  const clean = { ...EMPTY_PREFERENCES, ...preferences, updatedAt: Date.now() }
  const updated = { ...user, preferences: clean }
  setUser(updated)
  try { localStorage.setItem('lib_user', JSON.stringify(updated)) } catch {}
  import('../utils/firestore-sync').then(({ syncDoc }) => syncDoc(`users/${uid}`, { preferences: clean })).catch(() => {})
  return clean
}

// Résumé lisible des goûts (chips affichés dans la carte Paramètres)
export function summarizePreferences(prefs) {
  if (!prefs) return []
  const label = (arr, id) => arr.find(o => o.id === id)?.label || id
  const out = []
  for (const id of (prefs.musicStyles || [])) out.push(label(MUSIC_STYLES, id))
  for (const a of (prefs.artists || [])) out.push(a)
  for (const id of (prefs.eventTypes || [])) out.push(label(EVENT_TYPES, id))
  for (const c of (prefs.cities || [])) out.push(c)
  if (prefs.budget) out.push(label(BUDGETS, prefs.budget))
  for (const id of (prefs.ambiances || [])) out.push(label(AMBIANCES, id))
  return out
}

// ── Chip de sélection ─────────────────────────────────────────────────────────
function Chip({ active, color = TEAL, onClick, children }) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: '11px 16px', borderRadius: 999, cursor: 'pointer',
      border: `1px solid ${active ? color : 'rgba(255,255,255,0.14)'}`,
      background: active ? `${color}1f` : 'rgba(255,255,255,0.04)',
      color: active ? color : 'rgba(255,255,255,0.7)',
      fontFamily: FONT, fontSize: 13.5, fontWeight: 700, transition: 'all .15s',
    }}>
      {children}
    </button>
  )
}

// ── Recherche + sélection (artistes, villes) ──────────────────────────────────
// `remoteSearch(q)` (optionnel) : fonction async renvoyant [{name, picture}]
// depuis une API (Deezer pour les artistes). La liste locale sert de résultats
// instantanés + secours hors-ligne ; le distant complète le catalogue mondial.
// `photos` : map { nom: urlPhoto } pour afficher l'avatar de l'artiste dans sa
// pastille sélectionnée. `chipAvatars` : active l'avatar dans les pastilles
// (artistes) ; les villes restent en texte simple. onChange(names, photos).
function SearchMultiSelect({ value = [], photos = {}, onChange, suggestions = [], placeholder, color = TEAL, max = 15, remoteSearch, chipAvatars = false }) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [remote, setRemote] = useState([]) // [{name, picture}]
  const [loading, setLoading] = useState(false)

  // Résultats locaux (instantanés)
  const localMatches = useMemo(() => {
    const q = norm(query)
    if (!q) return []
    const selectedNorm = new Set(value.map(norm))
    return suggestions.filter(s => norm(s).includes(q) && !selectedNorm.has(norm(s))).slice(0, 6).map(name => ({ name, picture: null }))
  }, [query, suggestions, value])

  // Recherche distante debouncée (300 ms)
  useEffect(() => {
    if (!remoteSearch) { setRemote([]); return }
    const q = query.trim()
    if (q.length < 2) { setRemote([]); setLoading(false); return }
    setLoading(true)
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const res = await remoteSearch(q)
        if (!cancelled) setRemote(Array.isArray(res) ? res : [])
      } catch { if (!cancelled) setRemote([]) }
      finally { if (!cancelled) setLoading(false) }
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query, remoteSearch])

  // Fusion locale + distante. Le DISTANT est prioritaire car il porte la PHOTO :
  // pour un artiste présent dans les deux (ex. Ninho), on garde la version
  // Deezer (avec photo) plutôt que la locale (initiale seule). Le local ne sert
  // qu'à afficher un résultat instantané avant la réponse réseau, et à combler
  // les noms absents du distant.
  const matches = useMemo(() => {
    const selectedNorm = new Set(value.map(norm))
    const byKey = new Map()
    for (const r of remote) {           // distant d'abord (photos)
      const k = norm(r.name)
      if (!k || selectedNorm.has(k) || byKey.has(k)) continue
      byKey.set(k, r)
    }
    for (const m of localMatches) {      // local comble les trous
      const k = norm(m.name)
      if (!k || selectedNorm.has(k) || byKey.has(k)) continue
      byKey.set(k, m)
    }
    return [...byKey.values()].slice(0, 8)
  }, [localMatches, remote, value])

  // Proposer « Ajouter «query» » si aucune correspondance EXACTE (liste, distant ou déjà choisi)
  const exact = query.trim() && [...suggestions, ...remote.map(r => r.name), ...value].some(s => norm(s) === norm(query))
  const canAddCustom = query.trim().length >= 2 && !exact && value.length < max

  // add(item) : item = { name, picture } (résultat) ou une chaîne (ajout libre).
  const add = item => {
    const name = String(item?.name ?? item).trim()
    if (!name || value.length >= max) return
    if (value.some(v => norm(v) === norm(name))) { setQuery(''); setRemote([]); return }
    const picture = item?.picture || null
    onChange([...value, name], picture ? { ...photos, [name]: picture } : photos)
    setQuery('')
    setRemote([])
  }
  const remove = name => {
    const nextPhotos = { ...photos }; delete nextPhotos[name]
    onChange(value.filter(v => v !== name), nextPhotos)
  }

  // Enrichissement automatique : pour les pastilles d'artistes SANS photo (ex.
  // ajoutés avant cette fonctionnalité, ou en texte libre), on va chercher leur
  // image en tâche de fond. enrichTried évite de réessayer en boucle un échec.
  const enrichTried = useRef(new Set())
  useEffect(() => {
    if (!remoteSearch || !chipAvatars) return
    const missing = value.filter(n => !photos[n] && !enrichTried.current.has(norm(n))).slice(0, 6)
    if (!missing.length) return
    let cancelled = false
    ;(async () => {
      const found = {}
      for (const name of missing) {
        enrichTried.current.add(norm(name))
        try {
          const res = await remoteSearch(name)
          const hit = (res || []).find(r => norm(r.name) === norm(name))
          if (hit?.picture) found[name] = hit.picture
        } catch {}
      }
      if (!cancelled && Object.keys(found).length) onChange(value, { ...photos, ...found })
    })()
    return () => { cancelled = true }
  }, [value, photos, remoteSearch, chipAvatars]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      {/* Sélection courante */}
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
          {value.map(v => (
            <span key={v} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: chipAvatars ? '4px 8px 4px 5px' : '7px 8px 7px 13px',
              borderRadius: 999, background: `${color}1f`, border: `1px solid ${color}66`,
              color, fontFamily: FONT, fontSize: 13, fontWeight: 700,
            }}>
              {chipAvatars && (
                photos[v]
                  ? <img src={photos[v]} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', background: '#1a1c26' }} />
                  : <span style={{ width: 24, height: 24, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,0.28)', color, fontSize: 11, fontWeight: 800 }}>{v.charAt(0).toUpperCase()}</span>
              )}
              {v}
              <button type="button" onClick={() => remove(v)} aria-label={`Retirer ${v}`} style={{
                width: 18, height: 18, borderRadius: '50%', border: 'none', cursor: 'pointer',
                background: 'rgba(0,0,0,0.25)', color, fontSize: 12, lineHeight: 1, display: 'grid', placeItems: 'center', flexShrink: 0,
              }}>×</button>
            </span>
          ))}
        </div>
      )}

      {/* Barre de recherche */}
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'relative' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (matches[0]) add(matches[0]); else if (canAddCustom) add(query) } }}
            placeholder={placeholder}
            disabled={value.length >= max}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '13px 14px 13px 40px', borderRadius: 12,
              border: `1px solid ${focused ? color : 'rgba(255,255,255,0.12)'}`, background: '#0b0c12',
              color: '#fff', outline: 'none', fontFamily: FONT, fontSize: 14, transition: 'border-color .15s',
            }}
          />
        </div>

        {/* Résultats */}
        {focused && (matches.length > 0 || canAddCustom || loading) && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 5,
            maxHeight: 280, overflowY: 'auto', borderRadius: 12, padding: 6,
            background: '#12131c', border: '1px solid rgba(255,255,255,0.10)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
          }}>
            {matches.map(m => (
              <button key={m.name} type="button" onMouseDown={e => { e.preventDefault(); add(m) }} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 11, textAlign: 'left', padding: '9px 10px', borderRadius: 8, border: 'none',
                background: 'none', color: '#fff', cursor: 'pointer', fontFamily: FONT, fontSize: 14,
              }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                {m.picture
                  ? <img src={m.picture} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, background: '#1a1c26' }} />
                  : <span style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: 700 }}>{m.name.charAt(0).toUpperCase()}</span>}
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                  <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                  {m.sublabel && <span style={{ display: 'block', fontSize: 11.5, color: 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.sublabel}</span>}
                </span>
              </button>
            ))}
            {loading && matches.length === 0 && (
              <p style={{ padding: '11px 12px', fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0 }}>Recherche…</p>
            )}
            {canAddCustom && (
              <button type="button" onMouseDown={e => { e.preventDefault(); add(query) }} style={{
                width: '100%', textAlign: 'left', padding: '11px 12px', borderRadius: 8, border: 'none',
                background: 'none', color, cursor: 'pointer', fontFamily: FONT, fontSize: 14, fontWeight: 700,
              }} onMouseEnter={e => e.currentTarget.style.background = `${color}14`} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                + Ajouter « {query.trim()} »
              </button>
            )}
          </div>
        )}
      </div>
      <p style={{ fontFamily: FONT, fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: '8px 0 0' }}>
        Tape un nom et sélectionne-le, ou ajoute-le s’il n’apparaît pas. {value.length}/{max}
      </p>
    </div>
  )
}

// ── Définition des étapes ─────────────────────────────────────────────────────
const STEPS = [
  { key: 'musicStyles', type: 'multi', options: MUSIC_STYLES, color: TEAL, title: 'Tes styles musicaux', subtitle: 'Choisis tout ce qui te fait vibrer.' },
  { key: 'artists', type: 'search', suggestions: ARTIST_SUGGESTIONS, color: TEAL, title: 'Tes artistes & DJs', subtitle: 'Recherche tes artistes préférés et ajoute-les.' },
  { key: 'eventTypes', type: 'multi', options: EVENT_TYPES, color: VIOLET, title: 'Tes types de soirées', subtitle: 'Où aimes-tu sortir ?' },
  { key: 'cities', type: 'search', suggestions: CITY_SUGGESTIONS, color: VIOLET, title: 'Tes villes de sortie', subtitle: 'Recherche les villes où tu fais la fête.' },
  { key: 'budget', type: 'single', options: BUDGETS, color: VIOLET, title: 'Ton budget par sortie', subtitle: 'En moyenne, tu mets combien ?' },
  { key: 'ambiances', type: 'multi', options: AMBIANCES, color: TEAL, title: 'Ton ambiance idéale', subtitle: 'Sélectionne les ambiances que tu recherches.' },
  { key: 'frequency', type: 'single', options: FREQUENCIES, color: VIOLET, title: 'Tu sors…', subtitle: 'À quelle fréquence ?' },
  { key: 'groupPref', type: 'single', options: GROUP_PREFS, color: VIOLET, title: 'Tu sors plutôt…', subtitle: 'Avec qui préfères-tu faire la fête ?' },
]

export default function PreferencesWizard({ user, setUser, onDone, doneLabel = 'Terminer' }) {
  const [prefs, setPrefs] = useState(() => ({ ...EMPTY_PREFERENCES, ...(user?.preferences || {}) }))
  const [step, setStep] = useState(0)
  const touchedRef = useRef(false)

  // Hydratation tardive (prefs arrivant après montage, sync cross-device) —
  // seulement si l'utilisateur n'a pas déjà commencé à éditer.
  useEffect(() => {
    if (touchedRef.current || !user?.preferences) return
    setPrefs({ ...EMPTY_PREFERENCES, ...user.preferences })
  }, [user?.preferences]) // eslint-disable-line react-hooks/exhaustive-deps

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1
  const progress = Math.round(((step + 1) / STEPS.length) * 100)

  const persist = next => { touchedRef.current = true; setPrefs(next); savePreferences(user, setUser, next) }

  const toggleMulti = id => {
    touchedRef.current = true
    // Mise à jour fonctionnelle basée sur p (état À JOUR) — pas sur une copie
    // figée : deux clics rapprochés ne s'écrasent plus.
    setPrefs(p => { const list = p[current.key] || []; return { ...p, [current.key]: list.includes(id) ? list.filter(x => x !== id) : [...list, id] } })
  }
  // Recherche : names[] + photos{} (les photos ne sont utilisées que pour les
  // artistes → stockées dans artistPhotos, pour afficher l'avatar des pastilles).
  const setSearch = (names, photos) => {
    touchedRef.current = true
    setPrefs(p => ({
      ...p,
      [current.key]: names,
      ...(current.key === 'artists' ? { artistPhotos: photos || {} } : {}),
    }))
  }

  const goNext = () => { savePreferences(user, setUser, prefs); if (isLast) onDone?.(prefs); else setStep(s => s + 1) }
  const goBack = () => setStep(s => Math.max(0, s - 1))
  // Choix unique → enregistre + avance automatiquement (spawn de l'étape suivante)
  const pickSingle = id => {
    const next = { ...prefs, [current.key]: prefs[current.key] === id ? '' : id }
    persist(next)
    if (next[current.key]) setTimeout(() => { if (isLast) onDone?.(next); else setStep(s => s + 1) }, 260)
  }

  const val = prefs[current.key]
  const hasValue = current.type === 'single' ? !!val : (val || []).length > 0

  return (
    <div>
      {/* Barre de progression */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: current.color }}>
            Étape {step + 1} / {STEPS.length}
          </span>
          <span style={{ fontFamily: FONT, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{progress}%</span>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress}%`, borderRadius: 999, background: VIOLET, transition: 'width .35s cubic-bezier(.4,0,.2,1)' }} />
        </div>
      </div>

      {/* Question — key force le remontage (petite animation d'entrée) */}
      <div key={current.key} style={{ animation: 'lib-step-in .3s ease' }}>
        <style>{`@keyframes lib-step-in { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }`}</style>
        <h3 style={{ fontFamily: FONT, fontSize: 21, fontWeight: 800, letterSpacing: '-0.4px', color: '#fff', margin: '0 0 4px' }}>{current.title}</h3>
        <p style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '0 0 20px', lineHeight: 1.5 }}>{current.subtitle}</p>

        <div style={{ minHeight: 120 }}>
          {current.type === 'multi' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
              {current.options.map(o => <Chip key={o.id} color={current.color} active={(val || []).includes(o.id)} onClick={() => toggleMulti(o.id)}>{o.label}</Chip>)}
            </div>
          )}
          {current.type === 'single' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
              {current.options.map(o => <Chip key={o.id} color={current.color} active={val === o.id} onClick={() => pickSingle(o.id)}>{o.label}</Chip>)}
            </div>
          )}
          {current.type === 'search' && (
            <SearchMultiSelect value={val || []} onChange={setSearch} suggestions={current.suggestions} color={current.color}
              photos={current.key === 'artists' ? (prefs.artistPhotos || {}) : {}}
              chipAvatars={current.key === 'artists'}
              remoteSearch={current.key === 'artists' ? searchArtistsRemote : current.key === 'cities' ? searchCitiesRemote : undefined}
              placeholder={current.key === 'artists' ? 'Cherche un artiste ou un DJ…' : 'Cherche une ville…'} />
          )}
        </div>
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 26 }}>
        {step > 0 && (
          <button type="button" onClick={goBack} aria-label="Précédent" style={{
            width: 46, height: 46, borderRadius: 12, flexShrink: 0, cursor: 'pointer',
            border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 18,
          }}>‹</button>
        )}
        <button type="button" onClick={goNext} style={{
          flex: 1, padding: '15px 24px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.14)', cursor: 'pointer',
          background: 'linear-gradient(180deg, #8f56ff, #7a3bf2)', color: '#fff',
          fontFamily: FONT, fontSize: 14, fontWeight: 700, boxShadow: '0 6px 20px rgba(122,59,242,0.35)',
        }}>
          {isLast ? doneLabel : (hasValue ? 'Continuer' : 'Passer cette étape')}
        </button>
      </div>
    </div>
  )
}

// ─── Modal (onboarding accueil + « Régler mes goûts ») ────────────────────────
export function PreferencesModal({ open, onClose, user, setUser }) {
  const [done, setDone] = useState(false)
  useEffect(() => { if (open) setDone(false) }, [open])
  if (!open) return null
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(3,4,8,0.72)', backdropFilter: 'blur(8px)' }} onClick={onClose} />
      <div style={{
        position: 'relative', width: '100%', maxWidth: 520, maxHeight: '88vh', overflowY: 'auto',
        background: '#12131c', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 20, padding: '22px 22px 22px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
      }}>
        <button onClick={onClose} aria-label="Fermer" style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 0, color: 'rgba(255,255,255,0.5)', fontSize: 26, cursor: 'pointer', lineHeight: 1, zIndex: 2 }}>×</button>
        {done ? (
          <div style={{ textAlign: 'center', padding: '30px 10px 20px' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', margin: '0 auto 18px', display: 'grid', placeItems: 'center', background: 'rgba(78,232,200,0.12)', border: '1px solid rgba(78,232,200,0.4)', color: TEAL }}><IconCheck size={30} color={TEAL} /></div>
            <h2 style={{ fontFamily: FONT, fontSize: 23, fontWeight: 800, color: '#fff', margin: '0 0 6px' }}>C’est noté !</h2>
            <p style={{ fontFamily: FONT, fontSize: 13.5, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, margin: '0 0 22px' }}>
              Tes recommandations sont prêtes. Retrouve-les sur l’accueil, section « Nos recommandations pour toi ».
            </p>
            <button onClick={onClose} style={{ padding: '13px 28px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.14)', cursor: 'pointer', background: 'linear-gradient(180deg, #8f56ff, #7a3bf2)', color: '#fff', fontFamily: FONT, fontSize: 14, fontWeight: 700, boxShadow: '0 6px 20px rgba(122,59,242,0.35)' }}>
              Voir mes recommandations
            </button>
          </div>
        ) : (
          <>
            <p style={{ fontFamily: FONT, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: VIOLET, margin: '0 0 6px' }}>Personnalisation</p>
            <h2 style={{ fontFamily: FONT, fontSize: 23, fontWeight: 800, letterSpacing: '-0.5px', color: '#fff', margin: '0 0 18px' }}>Dis-nous ce que tu aimes</h2>
            <PreferencesWizard user={user} setUser={setUser} onDone={() => setDone(true)} />
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
