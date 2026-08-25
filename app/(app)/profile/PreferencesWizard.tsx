'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input, SlideOverModal, Avatar } from '@/app/components/ui'
import { stripDiacritics } from '@/lib/shared/diacritics'

// Port de src/components/PreferencesEditor.jsx ("Mes goûts", #6 phase
// profil) — mêmes 8 étapes, mêmes intitulés et mêmes options. Les artistes et
// villes utilisent le proxy distant Deezer/Photon avec repli local et ajout
// libre. Le moteur de scoring consomme ces préférences dans /events.
const TEAL = 'var(--teal)'
const VIOLET = 'var(--violet)'

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
  artistPhotos: Record<string, string>
  eventTypes: string[]
  cities: string[]
  budget: string
  ambiances: string[]
  frequency: string
  groupPref: string
}

export const EMPTY_PREFERENCES: Preferences = { musicStyles: [], artists: [], artistPhotos: {}, eventTypes: [], cities: [], budget: '', ambiances: [], frequency: '', groupPref: '' }

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
  return stripDiacritics(s)
    .toLowerCase()
    .trim()
}

function Chip({ active, color, onClick, children }: { active: boolean; color: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      variant={active ? 'primary' : 'secondary'}
      onClick={onClick}
      style={{
        padding: '11px 16px',
        borderRadius: 999,
        border: `1px solid ${active ? color : 'rgba(255,255,255,0.14)'}`,
        background: active ? `${color}1f` : 'rgba(255,255,255,0.04)',
        color: active ? color : 'rgba(255,255,255,0.7)',
        fontSize: 13.5,
        fontWeight: 700,
      }}
    >
      {children}
    </Button>
  )
}

type RemoteSearchResult = { name: string; picture?: string | null; sublabel?: string }

function SearchMultiSelect({ value, photos = {}, onChange, suggestions, color, placeholder, remoteType, max = 15 }: { value: string[]; photos?: Record<string, string>; onChange: (v: string[], photos?: Record<string, string>) => void; suggestions: string[]; color: string; placeholder: string; remoteType: 'artists' | 'cities'; max?: number }) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [remote, setRemote] = useState<RemoteSearchResult[]>([])
  const [loading, setLoading] = useState(false)

  const localMatches = useMemo(() => {
    const q = norm(query)
    if (!q) return []
    const selected = new Set(value.map(norm))
    return suggestions.filter((s) => norm(s).includes(q) && !selected.has(norm(s))).slice(0, 6).map((name) => ({ name }))
  }, [query, suggestions, value])

  useEffect(() => {
    const q = query.trim()
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      if (q.length < 2) {
        setRemote([])
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const response = await fetch(`/api/preferences/search?type=${remoteType}&q=${encodeURIComponent(q)}`, { signal: controller.signal })
        const data = await response.json().catch(() => null) as { artists?: RemoteSearchResult[]; cities?: RemoteSearchResult[] } | null
        setRemote(response.ok ? (remoteType === 'artists' ? data?.artists || [] : data?.cities || []) : [])
      } catch {
        if (!controller.signal.aborted) setRemote([])
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, q.length < 2 ? 0 : 300)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query, remoteType])

  const matches = useMemo(() => {
    const selected = new Set(value.map(norm))
    const merged = new Map<string, RemoteSearchResult>()
    for (const item of [...remote, ...localMatches]) {
      const key = norm(item.name)
      if (key && !selected.has(key) && !merged.has(key)) merged.set(key, item)
    }
    return [...merged.values()].slice(0, 8)
  }, [localMatches, remote, value])

  const exact = query.trim() && [...suggestions, ...remote.map((item) => item.name), ...value].some((s) => norm(s) === norm(query))
  const canAddCustom = query.trim().length >= 2 && !exact && value.length < max

  function add(item: string | RemoteSearchResult) {
    const name = typeof item === 'string' ? item : item.name
    const trimmed = name.trim()
    if (!trimmed || value.length >= max) return
    if (value.some((v) => norm(v) === norm(trimmed))) {
      setQuery('')
      return
    }
    const picture = typeof item === 'string' ? null : item.picture
    onChange([...value, trimmed], picture ? { ...photos, [trimmed]: picture } : photos)
    setQuery('')
    setRemote([])
  }
  function remove(name: string) {
    const nextPhotos = { ...photos }
    delete nextPhotos[name]
    onChange(value.filter((v) => v !== name), nextPhotos)
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
              {remoteType === 'artists' && <Avatar src={photos[v] || null} name={v} size="sm" style={{ width: 24, height: 24 }} />}
              {v}
              <Button
                variant="ghost"
                onClick={() => remove(v)}
                aria-label={`Retirer ${v}`}
                style={{ width: 18, height: 18, minHeight: 18, minWidth: 18, padding: 0, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.25)', color, fontSize: 12, lineHeight: 1 }}
              >
                ×
              </Button>
            </span>
          ))}
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <Input
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
          style={{ boxSizing: 'border-box', padding: '13px 14px', borderRadius: 12, border: `1px solid ${focused ? color : 'rgba(255,255,255,0.12)'}`, background: '#0b0c12', color: '#fff', fontSize: 14 }}
        />
        {focused && (matches.length > 0 || canAddCustom || loading) && (
          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 5, maxHeight: 240, overflowY: 'auto', borderRadius: 12, padding: 6, background: '#12131c', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 24px 64px rgba(0,0,0,0.55)' }}>
            {matches.map((m) => (
              <Button
                key={`${m.name}-${m.sublabel || ''}`}
                variant="ghost"
                fullWidth
                onMouseDown={(e) => {
                  e.preventDefault()
                  add(m)
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-start', textAlign: 'left', padding: '9px 10px', borderRadius: 8, border: 'none', background: 'none', color: '#fff', fontSize: 14, fontWeight: 400 }}
              >
                <Avatar src={m.picture || null} name={m.name} size="md" style={{ width: 34, height: 34, flexShrink: 0 }} />
                <span><span style={{ display: 'block' }}>{m.name}</span>{m.sublabel && <span style={{ display: 'block', color: 'rgba(255,255,255,.4)', fontSize: 11.5 }}>{m.sublabel}</span>}</span>
              </Button>
            ))}
            {loading && matches.length === 0 && <p style={{ padding: '10px 12px', margin: 0, color: 'rgba(255,255,255,.4)', fontSize: 13 }}>Recherche…</p>}
            {canAddCustom && (
              <Button
                variant="ghost"
                fullWidth
                onMouseDown={(e) => {
                  e.preventDefault()
                  add(query)
                }}
                style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '11px 12px', borderRadius: 8, border: 'none', background: 'none', color, fontSize: 14, fontWeight: 700 }}
              >
                + Ajouter « {query.trim()} »
              </Button>
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
  const [saveError, setSaveError] = useState(false)
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current)
    }
  }, [])

  if (!open) return null

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1
  const progress = Math.round(((step + 1) / STEPS.length) * 100)
  const val = prefs[current.key]
  const hasValue = current.type === 'single' ? Boolean(val) : ((val as string[]) || []).length > 0

  async function persist(next: Preferences): Promise<boolean> {
    setSaving(true)
    onSaved(next)
    try {
      const response = await fetch('/api/profil/preferences', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) })
      return response.ok
    } catch {
      return false
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
  function setSearchValue(names: string[], photos?: Record<string, string>) {
    setPrefs((p) => ({ ...p, [current.key]: names, ...(current.key === 'artists' ? { artistPhotos: photos || {} } : {}) }))
  }
  function pickSingle(id: string) {
    const next = { ...prefs, [current.key]: prefs[current.key] === id ? '' : id }
    setPrefs(next)
    setSaveError(false)
    const savePromise = persist(next)
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    if (next[current.key]) {
      advanceTimer.current = setTimeout(async () => {
        advanceTimer.current = null
        if (isLast) {
          const ok = await savePromise
          setSaveError(!ok)
          if (ok) setDone(true)
        } else {
          setStep((s) => s + 1)
        }
      }, 260)
    }
  }
  async function goNext() {
    setSaveError(false)
    const ok = await persist(prefs)
    if (isLast) {
      if (ok) setDone(true)
      else setSaveError(true)
    } else {
      setStep((s) => s + 1)
    }
  }
  function goBack() {
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current)
      advanceTimer.current = null
    }
    setStep((s) => Math.max(0, s - 1))
  }

  return (
    <SlideOverModal onClose={onClose} ariaLabel="Personnaliser mes préférences" padded>
        {done ? (
          <div style={{ textAlign: 'center', padding: '30px 10px 20px' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', margin: '0 auto 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(184, 243, 74,0.12)', border: '1px solid rgba(184, 243, 74,0.4)' }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h2 style={{ fontSize: 23, fontWeight: 800, color: '#fff', margin: '0 0 6px' }}>C&apos;est noté !</h2>
            <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, margin: '0 0 22px' }}>Tes préférences sont enregistrées.</p>
            <Button
              onClick={onClose}
              style={{ padding: '13px 28px', borderRadius: 3, border: '1px solid rgba(255,255,255,0.14)', background: 'var(--violet-cta)', color: '#fff', fontSize: 14, fontWeight: 500, textTransform: 'none', letterSpacing: 'normal' }}
            >
              Fermer
            </Button>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 14, fontWeight: 400, letterSpacing: '3.2px', textTransform: 'uppercase', color: VIOLET, fontFamily: 'var(--font-display), sans-serif', margin: '0 0 6px' }}>Personnalisation</p>
            <h2 className="font-display" style={{ fontSize: 23, fontWeight: 800, letterSpacing: '-0.5px', color: '#fff', margin: '0 0 18px' }}>Dis-nous ce que tu aimes</h2>

            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 400, letterSpacing: '3.2px', textTransform: 'uppercase', color: current.color, fontFamily: 'var(--font-display), sans-serif' }}>
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
                <SearchMultiSelect
                  value={(val as string[]) || []}
                  photos={current.key === 'artists' ? prefs.artistPhotos : undefined}
                  onChange={setSearchValue}
                  suggestions={current.suggestions}
                  color={current.color}
                  placeholder={current.placeholder}
                  remoteType={current.key === 'artists' ? 'artists' : 'cities'}
                />
              )}
            </div>

            {saveError && (
              <p style={{ fontSize: 12.5, color: 'rgba(220,100,100,0.9)', margin: '14px 0 0' }}>
                L&apos;enregistrement a échoué — vérifie ta connexion et réessaie.
              </p>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 26 }}>
              {step > 0 && (
                <Button
                  variant="secondary"
                  onClick={goBack}
                  aria-label="Précédent"
                  style={{ width: 46, height: 46, padding: 0, borderRadius: 12, flexShrink: 0, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 18 }}
                >
                  ‹
                </Button>
              )}
              <Button
                onClick={goNext}
                disabled={saving}
                fullWidth
                style={{ flex: 1, padding: '15px 24px', borderRadius: 3, border: '1px solid rgba(255,255,255,0.14)', background: 'var(--violet-cta)', color: '#fff', fontSize: 14, fontWeight: 500, textTransform: 'none', letterSpacing: 'normal' }}
              >
                {isLast ? 'Terminer' : hasValue ? 'Continuer' : 'Passer cette étape'}
              </Button>
            </div>
          </>
        )}
    </SlideOverModal>
  )
}
