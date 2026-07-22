'use client'

import { useMemo, useState } from 'react'

// Port de src/components/PreferencesEditor.jsx ("Mes goûts", #6 phase
// profil) — MÊMES 8 étapes, mêmes intitulés, mêmes options. Deux choses
// restent volontairement HORS PÉRIMÈTRE de ce port (déclaration seule) :
//   1. la recherche distante Deezer/Photon pour les étapes "artistes"/
//      "villes" (proxy propre à recommendations, jamais construit dans cette
//      migration) — remplacée par les suggestions LOCALES + ajout libre, un
//      repli déjà prévu par le legacy lui-même en cas d'échec réseau ;
//   2. le moteur de scoring (src/utils/recommendations.js) et la section
//      homepage "Nos recommandations pour toi" qui le consomme — cette page
//      ne fait qu'ENREGISTRER la déclaration (lib/server/profile.ts:
//      updatePreferences), exactement comme le formulaire legacy le fait
//      côté Firestore ; rien ne la lit encore ailleurs dans ce port.
const TEAL = '#4ee8c8'
const VIOLET = '#8b5cf6'

const MUSIC_STYLES = [
  { id: 'afrobeat', label: 'Afrobeat' },
  { id: 'amapiano', label: 'Amapiano' },
  { id: 'rap', label: 'Rap / Hip-hop' },
  { id: 'rnb', label: 'R&B' },
  { id: 'dancehall', label: 'Dancehall' },
  { id: 'coupe-decale', label: 'Coupé-décalé' },
  { id: 'zouk', label: 'Zouk / Kompa' },
  { id: 'house', label: 'House' },
  { id: 'techno', label: 'Techno' },
  { id: 'latino', label: 'Latino' },
  { id: 'gospel', label: 'Gospel' },
  { id: 'generaliste', label: 'Généraliste' },
]
const EVENT_TYPES = [
  { id: 'club', label: 'Club' },
  { id: 'concert', label: 'Concert / Showcase' },
  { id: 'festival', label: 'Festival' },
  { id: 'rooftop', label: 'Rooftop' },
  { id: 'lounge', label: 'Lounge' },
  { id: 'gala', label: 'Gala' },
  { id: 'afterwork', label: 'Afterwork' },
  { id: 'pool-party', label: 'Pool party' },
  { id: 'plein-air', label: 'Plein air' },
  { id: 'privee', label: 'Soirée privée' },
  { id: 'anniversaire', label: 'Anniversaire' },
]
const AMBIANCES = [
  { id: 'chill', label: 'Chill' },
  { id: 'dansant', label: 'Dansant' },
  { id: 'tres-festif', label: 'Très festif' },
  { id: 'premium', label: 'Premium' },
  { id: 'select', label: 'Sélect' },
  { id: 'populaire', label: 'Populaire' },
  { id: 'etudiant', label: 'Étudiant' },
  { id: 'networking', label: 'Networking' },
  { id: 'romantique', label: 'Romantique' },
  { id: 'luxe', label: 'Luxe' },
]
const BUDGETS = [
  { id: 'gratuit', label: 'Gratuit' },
  { id: 'moins-10', label: 'Moins de 10 €' },
  { id: '10-20', label: '10 à 20 €' },
  { id: '20-50', label: '20 à 50 €' },
  { id: 'plus-50', label: 'Plus de 50 €' },
  { id: 'vip', label: 'VIP / Premium' },
]
const FREQUENCIES = [
  { id: 'rare', label: 'Rarement' },
  { id: '1-mois', label: '1 fois par mois' },
  { id: '2-3-mois', label: '2 à 3 fois par mois' },
  { id: 'semaine', label: 'Chaque semaine' },
]
const GROUP_PREFS = [
  { id: 'seul', label: 'Seul·e' },
  { id: 'amis', label: 'Avec des amis' },
  { id: 'couple', label: 'En couple' },
  { id: 'vip', label: 'Groupe VIP / table' },
]
const ARTIST_SUGGESTIONS = [
  'Burna Boy', 'Wizkid', 'Davido', 'Rema', 'Asake', 'Tems', 'Ayra Starr', 'Fireboy DML',
  'Tyla', 'Uncle Waffles', 'Kabza De Small', 'Black Coffee',
  'Ninho', 'SDM', 'Gazo', 'Tiakola', 'Damso', 'Booba', 'Niska', 'Aya Nakamura', 'Gims',
  'Dadju', 'Naza', 'Tayc', 'Jul', 'PLK', 'Ziak', 'Sch',
  'DJ Arafat', 'Serge Beynaud', 'Debordo Leekunfa', 'Safarel Obiang', 'Josey', 'Didi B',
  'Fally Ipupa', 'Ferre Gola', 'Koffi Olomide', 'Innoss B',
  'Toofan', 'Santrinos Raphael', 'King Mensah', 'Ric Hassani',
  'Drake', 'Chris Brown', 'Rihanna', 'Beyoncé', 'The Weeknd', 'Travis Scott',
  'David Guetta', 'DJ Snake', 'Martin Garrix', 'Calvin Harris',
]
const CITY_SUGGESTIONS = [
  'Lomé', 'Kara', 'Kpalimé',
  'Cotonou', 'Porto-Novo', 'Parakou',
  'Abidjan', 'Yamoussoukro', 'Bouaké',
  'Paris', 'Lyon', 'Marseille', 'Lille', 'Bordeaux', 'Toulouse', 'Nice', 'Strasbourg', 'Nantes',
  'Bruxelles', 'Londres', 'Genève', 'Dakar', 'Accra', 'Lagos', 'Douala', 'Libreville',
]

export interface Preferences {
  musicStyles: string[]
  artists: string[]
  eventTypes: string[]
  cities: string[]
  budget: string
  ambiances: string[]
  frequency: string
  groupPref: string
}

export const EMPTY_PREFERENCES: Preferences = { musicStyles: [], artists: [], eventTypes: [], cities: [], budget: '', ambiances: [], frequency: '', groupPref: '' }

export function summarizePreferences(prefs: Partial<Preferences> | null | undefined): string[] {
  if (!prefs) return []
  const label = (arr: { id: string; label: string }[], id: string) => arr.find((o) => o.id === id)?.label || id
  const out: string[] = []
  for (const id of prefs.musicStyles || []) out.push(label(MUSIC_STYLES, id))
  for (const a of prefs.artists || []) out.push(a)
  for (const id of prefs.eventTypes || []) out.push(label(EVENT_TYPES, id))
  for (const c of prefs.cities || []) out.push(c)
  if (prefs.budget) out.push(label(BUDGETS, prefs.budget))
  for (const id of prefs.ambiances || []) out.push(label(AMBIANCES, id))
  return out
}

type StepDef =
  | { key: keyof Preferences; type: 'multi'; options: { id: string; label: string }[]; color: string; title: string; subtitle: string }
  | { key: keyof Preferences; type: 'single'; options: { id: string; label: string }[]; color: string; title: string; subtitle: string }
  | { key: keyof Preferences; type: 'search'; suggestions: string[]; color: string; title: string; subtitle: string; placeholder: string }

const STEPS: StepDef[] = [
  { key: 'musicStyles', type: 'multi', options: MUSIC_STYLES, color: TEAL, title: 'Tes styles musicaux', subtitle: 'Choisis tout ce qui te fait vibrer.' },
  { key: 'artists', type: 'search', suggestions: ARTIST_SUGGESTIONS, color: TEAL, title: 'Tes artistes & DJs', subtitle: 'Recherche tes artistes préférés et ajoute-les.', placeholder: 'Cherche un artiste ou un DJ…' },
  { key: 'eventTypes', type: 'multi', options: EVENT_TYPES, color: VIOLET, title: 'Tes types de soirées', subtitle: 'Où aimes-tu sortir ?' },
  { key: 'cities', type: 'search', suggestions: CITY_SUGGESTIONS, color: VIOLET, title: 'Tes villes de sortie', subtitle: 'Recherche les villes où tu fais la fête.', placeholder: 'Cherche une ville…' },
  { key: 'budget', type: 'single', options: BUDGETS, color: VIOLET, title: 'Ton budget par sortie', subtitle: 'En moyenne, tu mets combien ?' },
  { key: 'ambiances', type: 'multi', options: AMBIANCES, color: TEAL, title: 'Ton ambiance idéale', subtitle: 'Sélectionne les ambiances que tu recherches.' },
  { key: 'frequency', type: 'single', options: FREQUENCIES, color: VIOLET, title: 'Tu sors…', subtitle: 'À quelle fréquence ?' },
  { key: 'groupPref', type: 'single', options: GROUP_PREFS, color: VIOLET, title: 'Tu sors plutôt…', subtitle: 'Avec qui préfères-tu faire la fête ?' },
]

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

function Chip({ active, color, onClick, children }: { active: boolean; color: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '11px 16px',
        borderRadius: 999,
        cursor: 'pointer',
        border: `1px solid ${active ? color : 'rgba(255,255,255,0.14)'}`,
        background: active ? `${color}1f` : 'rgba(255,255,255,0.04)',
        color: active ? color : 'rgba(255,255,255,0.7)',
        fontSize: 13.5,
        fontWeight: 700,
      }}
    >
      {children}
    </button>
  )
}

function SearchMultiSelect({ value, onChange, suggestions, color, placeholder, max = 15 }: { value: string[]; onChange: (v: string[]) => void; suggestions: string[]; color: string; placeholder: string; max?: number }) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)

  const matches = useMemo(() => {
    const q = norm(query)
    if (!q) return []
    const selected = new Set(value.map(norm))
    return suggestions.filter((s) => norm(s).includes(q) && !selected.has(norm(s))).slice(0, 8)
  }, [query, suggestions, value])

  const exact = query.trim() && [...suggestions, ...value].some((s) => norm(s) === norm(query))
  const canAddCustom = query.trim().length >= 2 && !exact && value.length < max

  function add(name: string) {
    const trimmed = name.trim()
    if (!trimmed || value.length >= max) return
    if (value.some((v) => norm(v) === norm(trimmed))) {
      setQuery('')
      return
    }
    onChange([...value, trimmed])
    setQuery('')
  }
  function remove(name: string) {
    onChange(value.filter((v) => v !== name))
  }

  return (
    <div>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
          {value.map((v) => (
            <span
              key={v}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '7px 8px 7px 13px',
                borderRadius: 999,
                background: `${color}1f`,
                border: `1px solid ${color}66`,
                color,
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {v}
              <button
                type="button"
                onClick={() => remove(v)}
                aria-label={`Retirer ${v}`}
                style={{ width: 18, height: 18, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'rgba(0,0,0,0.25)', color, fontSize: 12, lineHeight: 1 }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (matches[0]) add(matches[0])
              else if (canAddCustom) add(query)
            }
          }}
          placeholder={placeholder}
          disabled={value.length >= max}
          style={{ width: '100%', boxSizing: 'border-box', padding: '13px 14px', borderRadius: 12, border: `1px solid ${focused ? color : 'rgba(255,255,255,0.12)'}`, background: '#0b0c12', color: '#fff', outline: 'none', fontSize: 14 }}
        />
        {focused && (matches.length > 0 || canAddCustom) && (
          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 5, maxHeight: 240, overflowY: 'auto', borderRadius: 12, padding: 6, background: '#12131c', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 24px 64px rgba(0,0,0,0.55)' }}>
            {matches.map((m) => (
              <button
                key={m}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  add(m)
                }}
                style={{ width: '100%', textAlign: 'left', padding: '9px 10px', borderRadius: 8, border: 'none', background: 'none', color: '#fff', cursor: 'pointer', fontSize: 14 }}
              >
                {m}
              </button>
            ))}
            {canAddCustom && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  add(query)
                }}
                style={{ width: '100%', textAlign: 'left', padding: '11px 12px', borderRadius: 8, border: 'none', background: 'none', color, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}
              >
                + Ajouter « {query.trim()} »
              </button>
            )}
          </div>
        )}
      </div>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: '8px 0 0' }}>
        Tape un nom et sélectionne-le, ou ajoute-le s&apos;il n&apos;apparaît pas. {value.length}/{max}
      </p>
    </div>
  )
}

export default function PreferencesModal({
  open,
  onClose,
  initialPreferences,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  initialPreferences: Partial<Preferences> | null
  onSaved: (next: Preferences) => void
}) {
  const [done, setDone] = useState(false)
  const [prefs, setPrefs] = useState<Preferences>({ ...EMPTY_PREFERENCES, ...(initialPreferences || {}) })
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)

  if (!open) return null

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1
  const progress = Math.round(((step + 1) / STEPS.length) * 100)
  const val = prefs[current.key]
  const hasValue = current.type === 'single' ? Boolean(val) : ((val as string[]) || []).length > 0

  async function persist(next: Preferences) {
    setSaving(true)
    onSaved(next)
    try {
      await fetch('/api/profil/preferences', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) })
    } catch {
      // Silencieux — même logique que le legacy (fire-and-forget), l'état
      // local reste la source de vérité affichée pendant l'édition.
    } finally {
      setSaving(false)
    }
  }

  function toggleMulti(id: string) {
    setPrefs((p) => {
      const list = (p[current.key] as string[]) || []
      return { ...p, [current.key]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] }
    })
  }
  function setSearchValue(names: string[]) {
    setPrefs((p) => ({ ...p, [current.key]: names }))
  }
  function pickSingle(id: string) {
    const next = { ...prefs, [current.key]: prefs[current.key] === id ? '' : id }
    setPrefs(next)
    persist(next)
    if (next[current.key]) setTimeout(() => (isLast ? setDone(true) : setStep((s) => s + 1)), 260)
  }
  function goNext() {
    persist(prefs)
    if (isLast) setDone(true)
    else setStep((s) => s + 1)
  }
  function goBack() {
    setStep((s) => Math.max(0, s - 1))
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(3,4,8,0.72)', backdropFilter: 'blur(8px)' }} onClick={onClose} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 520, maxHeight: '88vh', overflowY: 'auto', background: '#12131c', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 20, padding: 22, boxShadow: '0 24px 64px rgba(0,0,0,0.55)' }}>
        <button onClick={onClose} aria-label="Fermer" style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 0, color: 'rgba(255,255,255,0.5)', fontSize: 26, cursor: 'pointer', lineHeight: 1 }}>
          ×
        </button>
        {done ? (
          <div style={{ textAlign: 'center', padding: '30px 10px 20px' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', margin: '0 auto 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(78,232,200,0.12)', border: '1px solid rgba(78,232,200,0.4)' }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h2 style={{ fontSize: 23, fontWeight: 800, color: '#fff', margin: '0 0 6px' }}>C&apos;est noté !</h2>
            <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, margin: '0 0 22px' }}>Tes préférences sont enregistrées.</p>
            <button
              onClick={onClose}
              style={{ padding: '13px 28px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.14)', cursor: 'pointer', background: 'var(--violet-cta)', color: '#fff', fontSize: 14, fontWeight: 700 }}
            >
              Fermer
            </button>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: VIOLET, margin: '0 0 6px' }}>Personnalisation</p>
            <h2 style={{ fontSize: 23, fontWeight: 800, letterSpacing: '-0.5px', color: '#fff', margin: '0 0 18px' }}>Dis-nous ce que tu aimes</h2>

            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: current.color }}>
                  Étape {step + 1} / {STEPS.length}
                </span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{progress}%</span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progress}%`, borderRadius: 999, background: VIOLET }} />
              </div>
            </div>

            <h3 style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.4px', color: '#fff', margin: '0 0 4px' }}>{current.title}</h3>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '0 0 20px', lineHeight: 1.5 }}>{current.subtitle}</p>

            <div style={{ minHeight: 120 }}>
              {current.type === 'multi' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
                  {current.options.map((o) => (
                    <Chip key={o.id} color={current.color} active={((val as string[]) || []).includes(o.id)} onClick={() => toggleMulti(o.id)}>
                      {o.label}
                    </Chip>
                  ))}
                </div>
              )}
              {current.type === 'single' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
                  {current.options.map((o) => (
                    <Chip key={o.id} color={current.color} active={val === o.id} onClick={() => pickSingle(o.id)}>
                      {o.label}
                    </Chip>
                  ))}
                </div>
              )}
              {current.type === 'search' && (
                <SearchMultiSelect value={(val as string[]) || []} onChange={setSearchValue} suggestions={current.suggestions} color={current.color} placeholder={current.placeholder} />
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 26 }}>
              {step > 0 && (
                <button
                  type="button"
                  onClick={goBack}
                  aria-label="Précédent"
                  style={{ width: 46, height: 46, borderRadius: 12, flexShrink: 0, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 18 }}
                >
                  ‹
                </button>
              )}
              <button
                type="button"
                onClick={goNext}
                disabled={saving}
                style={{ flex: 1, padding: '15px 24px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.14)', cursor: 'pointer', background: 'var(--violet-cta)', color: '#fff', fontSize: 14, fontWeight: 700 }}
              >
                {isLast ? 'Terminer' : hasValue ? 'Continuer' : 'Passer cette étape'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
