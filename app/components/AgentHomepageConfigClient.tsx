'use client'

import { useEffect, useMemo, useState } from 'react'

// Port de src/components/ActualiteAdminPanel.jsx (#9 phase agent/admin, tab
// 'actualite') — édition du carrousel « Actualité » de l'accueil : actif
// on/off, titre, sous-titre, accent (teal/or/rose), sélection ORDONNÉE
// d'événements à mettre en avant. Voir lib/server/agentHomepageConfig.ts pour
// le state serveur (config SINGLETON) et lib/models/HomepageConfig.ts.
//
// Différence assumée avec le legacy : pas d'écoute temps réel (onSnapshot)
// puisqu'il n'y a plus de Firestore ici — un simple GET au montage, comme
// tous les autres panneaux agent de ce port (AgentDossiersClient etc.), donc
// pas de `dirtyRef` anti-réécriture : le formulaire ne s'affiche qu'une fois
// le premier (et seul) chargement terminé, jamais avant.

const MAX_EVENTS = 12

type Accent = 'teal' | 'gold' | 'pink'

const ACCENTS: { key: Accent; label: string; dot: string; soft: string; border: string }[] = [
  { key: 'teal', label: 'Teal', dot: '#4ee8c8', soft: 'rgba(78,232,200,0.14)', border: 'rgba(78,232,200,0.4)' },
  { key: 'gold', label: 'Or', dot: '#c8a96e', soft: 'rgba(200,169,110,0.14)', border: 'rgba(200,169,110,0.4)' },
  { key: 'pink', label: 'Rose', dot: '#e05aaa', soft: 'rgba(224,90,170,0.14)', border: 'rgba(224,90,170,0.4)' },
]
const ACCENT_BY_KEY = Object.fromEntries(ACCENTS.map((a) => [a.key, a])) as Record<Accent, (typeof ACCENTS)[number]>

const DEFAULT_TITLE = "L'actu du moment"
const DEFAULT_SUBTITLE = 'Les temps forts à ne pas manquer'

interface Draft {
  active: boolean
  title: string
  subtitle: string
  accent: Accent
  eventIds: string[]
}

interface EventOption {
  id: string
  name: string
  date: string
  dateDisplay: string
  city: string
  region: string
}

function defaultDraft(): Draft {
  return { active: false, title: DEFAULT_TITLE, subtitle: DEFAULT_SUBTITLE, accent: 'teal', eventIds: [] }
}

// Aperçu = ce qui sera RÉELLEMENT enregistré (le serveur normalise aussi,
// voir agentHomepageConfig.ts) — jamais appliqué au brouillon pendant la
// frappe, sinon impossible de taper un espace ou de vider un champ.
function normalizeForPreview(d: Draft): Draft {
  return {
    active: d.active === true,
    title: d.title.trim() ? d.title.trim().slice(0, 80) : DEFAULT_TITLE,
    subtitle: d.subtitle.slice(0, 140),
    accent: ACCENT_BY_KEY[d.accent] ? d.accent : 'teal',
    eventIds: [...new Set(d.eventIds.filter(Boolean).map(String))].slice(0, MAX_EVENTS),
  }
}

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '16px 18px' }
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: '#fff', fontSize: 13.5, outline: 'none' }
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-faint)', marginBottom: 8 }

export default function AgentHomepageConfigClient() {
  const [draft, setDraft] = useState<Draft>(defaultDraft())
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState(false)

  const [candidateEvents, setCandidateEvents] = useState<EventOption[]>([])
  const [selectedLabels, setSelectedLabels] = useState<Record<string, EventOption>>({})
  const [search, setSearch] = useState('')

  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Dernier brouillon connu du serveur (chargement ou enregistrement réussi)
  // — sert uniquement à détecter les modifications non enregistrées (bandeau
  // d'avertissement ci-dessous), jamais affiché tel quel.
  const [savedDraft, setSavedDraft] = useState<Draft | null>(null)
  const dirty = loaded && savedDraft !== null && JSON.stringify(draft) !== JSON.stringify(savedDraft)

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoaded(false)
      setLoadError(false)
      try {
        const res = await fetch('/api/agent/homepage-config')
        const data = await res.json()
        if (!res.ok || !data.ok) throw new Error('load_failed')
        if (!cancelled) {
          const loadedDraft: Draft = {
            active: Boolean(data.config.active),
            title: data.config.title ?? DEFAULT_TITLE,
            subtitle: data.config.subtitle ?? DEFAULT_SUBTITLE,
            accent: ACCENT_BY_KEY[data.config.accent as Accent] ? data.config.accent : 'teal',
            eventIds: Array.isArray(data.config.eventIds) ? data.config.eventIds.map(String) : [],
          }
          setDraft(loadedDraft)
          setSavedDraft(loadedDraft)
          setCandidateEvents(data.candidateEvents ?? [])
          setSelectedLabels(data.selectedEventLabels ?? {})
        }
      } catch {
        if (!cancelled) setLoadError(true)
      } finally {
        if (!cancelled) setLoaded(true)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [])

  function patch(p: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...p }))
    setMsg(null)
  }

  const eventIds = draft.eventIds
  const selectedSet = useMemo(() => new Set(eventIds), [eventIds])
  const atMax = eventIds.length >= MAX_EVENTS

  const byId = useMemo(() => {
    const map = new Map<string, EventOption>()
    for (const e of candidateEvents) map.set(e.id, e)
    for (const id of Object.keys(selectedLabels)) if (!map.has(id)) map.set(id, selectedLabels[id])
    return map
  }, [candidateEvents, selectedLabels])

  const q = search.trim().toLowerCase()
  const candidates = useMemo(
    () =>
      candidateEvents
        .filter((e) => !selectedSet.has(e.id))
        .filter((e) => !q || `${e.name} ${e.city} ${e.region}`.toLowerCase().includes(q))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(0, 30),
    [candidateEvents, selectedSet, q]
  )

  function addEvent(id: string) {
    if (eventIds.length >= MAX_EVENTS || selectedSet.has(id)) return
    patch({ eventIds: [...eventIds, id] })
  }
  function removeEvent(id: string) {
    patch({ eventIds: eventIds.filter((x) => x !== id) })
  }
  function move(id: string, dir: -1 | 1) {
    const i = eventIds.indexOf(id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= eventIds.length) return
    const next = [...eventIds]
    ;[next[i], next[j]] = [next[j], next[i]]
    patch({ eventIds: next })
  }

  async function onSave() {
    setSaving(true)
    setMsg(null)
    try {
      const clean = normalizeForPreview(draft)
      const res = await fetch('/api/agent/homepage-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clean),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setMsg({ ok: false, text: "Échec de l'enregistrement : réessaie." })
        return
      }
      setSavedDraft(clean)
      setDraft(clean)
      setMsg({ ok: true, text: "Enregistré. Le carrousel est à jour sur l'accueil." })
    } catch {
      setMsg({ ok: false, text: "Échec de l'enregistrement : réessaie." })
    } finally {
      setSaving(false)
    }
  }

  const preview = normalizeForPreview(draft)
  const previewAccent = ACCENT_BY_KEY[preview.accent]
  const candidateIds = useMemo(() => new Set(candidateEvents.map((e) => e.id)), [candidateEvents])
  const willShowCount = preview.eventIds.filter((id) => candidateIds.has(id)).length

  if (!loaded) {
    return (
      <main style={{ minHeight: '100vh', padding: '32px 16px 80px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{ ...cardStyle, padding: '28px 18px', textAlign: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>Chargement de la configuration…</span>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main style={{ minHeight: '100vh', padding: '32px 16px 80px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', margin: 0 }}>Actualité</h1>

        {loadError && (
          <div style={{ ...cardStyle, border: '1px solid rgba(224,90,170,0.35)' }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
              Lecture impossible — la configuration ci-dessous peut être incomplète. Recharge la page pour réessayer.
            </p>
          </div>
        )}

        {dirty && (
          <div style={{ ...cardStyle, border: '1px solid rgba(200,169,110,0.35)', background: 'rgba(200,169,110,0.06)', padding: '10px 14px' }}>
            <p style={{ fontSize: 12.5, color: 'var(--gold)', margin: 0, fontWeight: 700 }}>Modifications non enregistrées — pense à cliquer sur « Enregistrer ».</p>
          </div>
        )}

      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800, color: '#fff' }}>Carrousel « Actualité »</h3>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Un bandeau éditorial en haut de l&apos;accueil pour mettre en avant une sélection d&apos;événements (le gros
          événement du week-end, les nouveautés, une saison…). Il n&apos;apparaît que s&apos;il est activé et qu&apos;au
          moins un événement choisi est encore à venir.
        </p>
      </div>

      <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer' }}>
          <span>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#fff' }}>Afficher sur l&apos;accueil</span>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-faint)', marginTop: 2 }}>
              {draft.active ? 'Le carrousel est visible par les visiteurs.' : 'Masqué — personne ne le voit.'}
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={draft.active}
            onClick={() => patch({ active: !draft.active })}
            style={{
              flexShrink: 0,
              width: 48,
              height: 28,
              borderRadius: 999,
              border: 'none',
              cursor: 'pointer',
              background: draft.active ? '#3ed6b5' : 'rgba(255,255,255,0.14)',
              position: 'relative',
              transition: 'background 0.2s',
            }}
          >
            <span style={{ position: 'absolute', top: 3, left: draft.active ? 23 : 3, width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
          </button>
        </label>

        <div>
          <span style={labelStyle}>Accent</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {ACCENTS.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => patch({ accent: a.key })}
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  background: draft.accent === a.key ? a.soft : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${draft.accent === a.key ? a.border : 'rgba(255,255,255,0.08)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  fontSize: 12,
                  fontWeight: 700,
                  color: draft.accent === a.key ? a.dot : 'var(--text-muted)',
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: a.dot }} />
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <span style={labelStyle}>Titre</span>
          <input style={inputStyle} value={draft.title} maxLength={80} onChange={(e) => patch({ title: e.target.value })} placeholder="L'actu du moment" />
          <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-faint)', marginTop: 4, textAlign: 'right' }}>{draft.title.length}/80</span>
        </div>
        <div>
          <span style={labelStyle}>Sous-titre</span>
          <input style={inputStyle} value={draft.subtitle} maxLength={140} onChange={(e) => patch({ subtitle: e.target.value })} placeholder="Les temps forts à ne pas manquer" />
          <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-faint)', marginTop: 4, textAlign: 'right' }}>{draft.subtitle.length}/140</span>
        </div>
      </div>

      <div style={cardStyle}>
        <span style={{ ...labelStyle, marginBottom: 10 }}>
          À la une ({eventIds.length}/{MAX_EVENTS})
        </span>
        {eventIds.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--text-faint)' }}>Aucun événement choisi. Ajoute-en depuis la liste ci-dessous.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {eventIds.map((id, i) => {
              const ev = byId.get(id)
              return (
                <div
                  key={id}
                  style={
                    ev
                      ? { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 10 }
                      : { background: 'rgba(224,90,170,0.08)', border: '1px solid rgba(224,90,170,0.35)', borderRadius: 10, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 10 }
                  }
                >
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-faint)', width: 18, textAlign: 'center' }}>{i + 1}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {ev ? (
                      <>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.name}</span>
                        <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--text-faint)' }}>{[ev.dateDisplay || ev.date, ev.city].filter(Boolean).join(' · ')}</span>
                      </>
                    ) : (
                      <>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#ff9ed2' }}>Événement introuvable</span>
                        <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--text-faint)' }}>Supprimé ou indisponible — retire-le</span>
                      </>
                    )}
                  </span>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <IconBtn label="Monter" disabled={i === 0} onClick={() => move(id, -1)}>
                      ↑
                    </IconBtn>
                    <IconBtn label="Descendre" disabled={i === eventIds.length - 1} onClick={() => move(id, 1)}>
                      ↓
                    </IconBtn>
                    <IconBtn label="Retirer" danger onClick={() => removeEvent(id)}>
                      ✕
                    </IconBtn>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <span style={{ ...labelStyle, marginBottom: 10 }}>Ajouter un événement</span>
        {atMax && (
          <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 600, color: '#c8a96e' }}>Maximum atteint ({MAX_EVENTS} événements). Retire-en un pour en ajouter un autre.</p>
        )}
        <input style={{ ...inputStyle, marginBottom: 10 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher par nom, ville…" />
        {candidates.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--text-faint)' }}>{q ? 'Aucun événement à venir ne correspond.' : 'Aucun autre événement à venir.'}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
            {candidates.map((ev) => (
              <button
                key={ev.id}
                type="button"
                onClick={() => addEvent(ev.id)}
                disabled={atMax}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  textAlign: 'left',
                  cursor: atMax ? 'not-allowed' : 'pointer',
                  opacity: atMax ? 0.5 : 1,
                  padding: '8px 10px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.name}</span>
                  <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--text-faint)' }}>{[ev.dateDisplay || ev.date, ev.city].filter(Boolean).join(' · ')}</span>
                </span>
                <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: '#4ee8c8' }}>+ Ajouter</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <span style={{ ...labelStyle, marginBottom: 10 }}>Aperçu</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 12px', borderRadius: 8, background: previewAccent.soft, border: `1px solid ${previewAccent.border}` }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: previewAccent.dot }} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: previewAccent.dot }}>{preview.title}</span>
          </span>
          {preview.subtitle && <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>{preview.subtitle}</span>}
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 12, fontWeight: 500, color: 'var(--text-faint)' }}>
          {draft.active
            ? willShowCount > 0
              ? `Visible sur l'accueil avec ${willShowCount} événement${willShowCount > 1 ? 's' : ''}.`
              : "Activé, mais aucun événement à venir → rien ne s'affichera."
            : "Désactivé → masqué sur l'accueil."}
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          style={{ padding: '12px 22px', borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 700, cursor: saving ? 'default' : 'pointer', background: 'var(--teal)', color: 'var(--obsidian)', opacity: saving ? 0.6 : 1 }}
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        {msg && <span style={{ fontSize: 13, fontWeight: 600, color: msg.ok ? '#4ee8c8' : '#ff9ed2' }}>{msg.text}</span>}
      </div>
      </div>
    </main>
  )
}

function IconBtn({ children, label, onClick, disabled, danger }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 30,
        height: 30,
        borderRadius: 8,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: danger ? 'rgba(224,90,170,0.14)' : 'rgba(255,255,255,0.06)',
        border: `1px solid ${danger ? 'rgba(224,90,170,0.4)' : 'rgba(255,255,255,0.1)'}`,
        color: disabled ? 'rgba(255,255,255,0.25)' : danger ? '#ff9ed2' : 'rgba(255,255,255,0.8)',
        fontSize: 13,
        fontWeight: 700,
      }}
    >
      {children}
    </button>
  )
}
