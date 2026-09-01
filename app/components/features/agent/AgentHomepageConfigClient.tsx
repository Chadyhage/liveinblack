'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  EyeOff,
  MapPin,
  Newspaper,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import { Button, Card, Input, Switch, Skeleton } from '@/app/components/ui'
import styles from './AgentHomepageConfigClient.module.css'

const MAX_EVENTS = 12

type Accent = 'teal' | 'gold' | 'pink'

const ACCENTS: { key: Accent; label: string; dot: string; soft: string; border: string }[] = [
  { key: 'teal', label: 'Rose', dot: 'var(--accent-text)', soft: 'var(--primary-a12)', border: 'var(--primary-a34)' },
  { key: 'gold', label: 'Citron', dot: 'var(--primary)', soft: 'var(--primary-a12)', border: 'var(--border-strong)' },
  { key: 'pink', label: 'Rose', dot: 'var(--pink-strong)', soft: 'var(--pink-fill)', border: 'var(--pink-border)' },
]
const ACCENT_BY_KEY = Object.fromEntries(ACCENTS.map((accent) => [accent.key, accent])) as Record<Accent, (typeof ACCENTS)[number]>

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

function normalizeForPreview(draft: Draft): Draft {
  return {
    active: draft.active === true,
    title: draft.title.trim() ? draft.title.trim().slice(0, 80) : DEFAULT_TITLE,
    subtitle: draft.subtitle.slice(0, 140),
    accent: ACCENT_BY_KEY[draft.accent] ? draft.accent : 'teal',
    eventIds: [...new Set(draft.eventIds.filter(Boolean).map(String))].slice(0, MAX_EVENTS),
  }
}

function EventMeta({ event }: { event: EventOption }) {
  return (
    <span className={styles.eventMeta}>
      <span><CalendarDays size={14} aria-hidden="true" />{event.dateDisplay || event.date}</span>
      {event.city && <span><MapPin size={14} aria-hidden="true" />{event.city}</span>}
    </span>
  )
}

export default function AgentHomepageConfigClient() {
  const [draft, setDraft] = useState<Draft>(defaultDraft())
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [candidateEvents, setCandidateEvents] = useState<EventOption[]>([])
  const [selectedLabels, setSelectedLabels] = useState<Record<string, EventOption>>({})
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [savedDraft, setSavedDraft] = useState<Draft | null>(null)

  const dirty = loaded && savedDraft !== null && JSON.stringify(draft) !== JSON.stringify(savedDraft)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoaded(false)
      setLoadError(false)
      try {
        const response = await fetch('/api/agent/homepage-config')
        const data = await response.json()
        if (!response.ok || !data.ok) throw new Error('load_failed')
        if (cancelled) return
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
      } catch {
        if (!cancelled) setLoadError(true)
      } finally {
        if (!cancelled) setLoaded(true)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  function patchDraft(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }))
    setMessage(null)
  }

  const eventIds = draft.eventIds
  const selectedSet = useMemo(() => new Set(eventIds), [eventIds])
  const eventById = useMemo(() => {
    const map = new Map<string, EventOption>()
    for (const event of candidateEvents) map.set(event.id, event)
    for (const [id, event] of Object.entries(selectedLabels)) if (!map.has(id)) map.set(id, event)
    return map
  }, [candidateEvents, selectedLabels])

  const query = search.trim().toLowerCase()
  const candidates = useMemo(
    () => candidateEvents
      .filter((event) => !selectedSet.has(event.id))
      .filter((event) => !query || `${event.name} ${event.city} ${event.region}`.toLowerCase().includes(query))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 30),
    [candidateEvents, selectedSet, query]
  )

  const preview = normalizeForPreview(draft)
  const previewAccent = ACCENT_BY_KEY[preview.accent]
  const visibleEvents = preview.eventIds.map((id) => eventById.get(id)).filter((event): event is EventOption => Boolean(event))
  const canAppear = preview.active && visibleEvents.length > 0

  function addEvent(id: string) {
    if (eventIds.length >= MAX_EVENTS || selectedSet.has(id)) return
    patchDraft({ eventIds: [...eventIds, id] })
  }

  function removeEvent(id: string) {
    patchDraft({ eventIds: eventIds.filter((eventId) => eventId !== id) })
  }

  function moveEvent(id: string, direction: -1 | 1) {
    const from = eventIds.indexOf(id)
    const to = from + direction
    if (from < 0 || to < 0 || to >= eventIds.length) return
    const next = [...eventIds]
    ;[next[from], next[to]] = [next[to], next[from]]
    patchDraft({ eventIds: next })
  }

  async function save() {
    setSaving(true)
    setMessage(null)
    try {
      const clean = normalizeForPreview(draft)
      const response = await fetch('/api/agent/homepage-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clean),
      })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error('save_failed')
      setSavedDraft(clean)
      setDraft(clean)
      setMessage({ ok: true, text: 'La sélection est à jour sur l’accueil.' })
    } catch {
      setMessage({ ok: false, text: 'Enregistrement impossible. Réessayez.' })
    } finally {
      setSaving(false)
    }
  }

  function discardChanges() {
    if (!savedDraft) return
    setDraft(savedDraft)
    setMessage(null)
  }

  if (!loaded) {
    return (
      <main className="lb-dashboard-page">
        <div className={styles.loadingGrid}>
          <Card className={styles.loadingCard}><Skeleton width="32%" height={18} /><Skeleton width="82%" height={44} /><Skeleton width="100%" height={120} radius={18} /></Card>
          <Card className={styles.loadingCard}><Skeleton width="46%" height={18} /><Skeleton width="100%" height={300} radius={18} /></Card>
        </div>
      </main>
    )
  }

  return (
    <main className="lb-dashboard-page lb-agent-screen lb-agent-screen--homepage">
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <div className={styles.titleGroup}>
            <span className={styles.titleIcon}><Newspaper size={22} aria-hidden="true" /></span>
            <div>
              <span className={styles.eyebrow}>Édition de l’accueil</span>
              <h1>Actualité</h1>
              <p>Composez la sélection éditoriale visible par tous les visiteurs.</p>
            </div>
          </div>
          <Link className={styles.publicLink} href="/home" target="_blank" rel="noreferrer">
            Voir l’accueil <ExternalLink size={16} aria-hidden="true" />
          </Link>
          <div className={styles.summaryBar} aria-label="État de la rubrique">
            <span><small>Publication</small><strong>{draft.active ? 'Activée' : 'Masquée'}</strong></span>
            <span><small>Sélection</small><strong>{eventIds.length} sur {MAX_EVENTS}</strong></span>
            <span aria-live="polite"><small>Version</small><strong>{dirty ? 'À publier' : 'À jour'}</strong></span>
          </div>
        </header>

        {loadError && (
          <div className={`${styles.notice} ${styles.noticeError}`} role="alert">
            <AlertCircle size={18} aria-hidden="true" />
            <span><strong>La configuration n’a pas pu être chargée.</strong> Rechargez la page avant de modifier la sélection.</span>
          </div>
        )}

        <div className={styles.workspace}>
          <div className={styles.editorColumn}>
            <Card className={styles.panel}>
              <div className={styles.panelHeading}>
                <span className={styles.step}>1</span>
                <div><h2>Visibilité et identité</h2><p>Définissez le message affiché au-dessus de la sélection.</p></div>
              </div>

              <div className={styles.visibilityRow}>
                <span className={`${styles.visibilityIcon} ${draft.active ? styles.visibilityIconActive : ''}`}>
                  {draft.active ? <Eye size={21} aria-hidden="true" /> : <EyeOff size={21} aria-hidden="true" />}
                </span>
                <span className={styles.visibilityCopy}>
                  <strong>Afficher sur l’accueil</strong>
                  <small>{draft.active ? 'La rubrique sera visible après l’enregistrement.' : 'La rubrique reste masquée pour les visiteurs.'}</small>
                </span>
                <Switch checked={draft.active} onChange={() => patchDraft({ active: !draft.active })} aria-label="Afficher la rubrique Actualité sur l’accueil" />
              </div>

              <div className={styles.formGrid}>
                <label className={styles.field}>
                  <span>Titre <small>{draft.title.length}/80</small></span>
                  <Input value={draft.title} maxLength={80} onChange={(event) => patchDraft({ title: event.target.value })} placeholder={DEFAULT_TITLE} />
                </label>
                <label className={styles.field}>
                  <span>Sous-titre <small>{draft.subtitle.length}/140</small></span>
                  <Input value={draft.subtitle} maxLength={140} onChange={(event) => patchDraft({ subtitle: event.target.value })} placeholder={DEFAULT_SUBTITLE} />
                </label>
              </div>

              <fieldset className={styles.accentFieldset}>
                <legend>Couleur d’accent</legend>
                <div className={styles.accentPicker}>
                  {ACCENTS.map((accent) => (
                    <Button
                      key={accent.key}
                      variant="ghost"
                      aria-pressed={draft.accent === accent.key}
                      onClick={() => patchDraft({ accent: accent.key })}
                      className={styles.accentButton}
                      style={{ '--accent-dot': accent.dot, '--accent-soft': accent.soft, '--accent-border': accent.border } as React.CSSProperties}
                    >
                      <span className={styles.accentDot} />{accent.label}
                      {draft.accent === accent.key && <Check size={16} aria-hidden="true" />}
                    </Button>
                  ))}
                </div>
              </fieldset>
            </Card>

            <Card className={styles.panel}>
              <div className={styles.panelHeading}>
                <span className={styles.step}>2</span>
                <div><h2>Sélection à la une</h2><p>Le premier événement sera présenté en priorité.</p></div>
                <span className={styles.counter}>{eventIds.length}/{MAX_EVENTS}</span>
              </div>

              {eventIds.length === 0 ? (
                <div className={styles.emptySelection}>
                  <Sparkles size={23} aria-hidden="true" />
                  <strong>Votre sélection est vide</strong>
                  <span>Ajoutez un événement depuis la bibliothèque ci-dessous.</span>
                </div>
              ) : (
                <ol className={styles.selectedList} aria-label="Ordre des événements à la une">
                  {eventIds.map((id, index) => {
                    const event = eventById.get(id)
                    return (
                      <li key={id} className={`${styles.selectedItem} ${!event ? styles.missingItem : ''}`}>
                        <span className={styles.position}>{index + 1}</span>
                        <span className={styles.eventCopy}>
                          <strong>{event?.name ?? 'Événement indisponible'}</strong>
                          {event ? <EventMeta event={event} /> : <small>Retirez cet élément de la sélection.</small>}
                        </span>
                        <span className={styles.rowActions}>
                          <Button variant="ghost" aria-label={`Monter ${event?.name ?? 'cet événement'}`} disabled={index === 0} onClick={() => moveEvent(id, -1)}><ChevronUp size={18} /></Button>
                          <Button variant="ghost" aria-label={`Descendre ${event?.name ?? 'cet événement'}`} disabled={index === eventIds.length - 1} onClick={() => moveEvent(id, 1)}><ChevronDown size={18} /></Button>
                          <Button variant="ghost" aria-label={`Retirer ${event?.name ?? 'cet événement'}`} className={styles.removeButton} onClick={() => removeEvent(id)}><X size={18} /></Button>
                        </span>
                      </li>
                    )
                  })}
                </ol>
              )}
            </Card>

            <Card className={styles.panel}>
              <div className={styles.panelHeading}>
                <span className={styles.step}>3</span>
                <div><h2>Bibliothèque d’événements</h2><p>Recherchez puis ajoutez les prochains rendez-vous.</p></div>
              </div>
              <label className={styles.searchField}>
                <Search size={18} aria-hidden="true" />
                <Input aria-label="Rechercher un événement" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher par nom, ville ou région" />
              </label>
              {eventIds.length >= MAX_EVENTS && <p className={styles.limitMessage}>La sélection contient déjà le maximum de {MAX_EVENTS} événements.</p>}
              <div className={styles.libraryList}>
                {candidates.length === 0 ? (
                  <p className={styles.noResult}>{query ? 'Aucun événement ne correspond à cette recherche.' : 'Aucun autre événement à venir.'}</p>
                ) : candidates.map((event) => (
                  <div className={styles.libraryItem} key={event.id}>
                    <span className={styles.calendarTile}><strong>{new Date(event.date).toLocaleDateString('fr-FR', { day: '2-digit' })}</strong><small>{new Date(event.date).toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')}</small></span>
                    <span className={styles.eventCopy}><strong>{event.name}</strong><EventMeta event={event} /></span>
                    <Button variant="secondary" disabled={eventIds.length >= MAX_EVENTS} onClick={() => addEvent(event.id)}><Plus size={17} aria-hidden="true" /> Ajouter</Button>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <aside className={styles.previewColumn} aria-label="Aperçu avant publication">
            <Card className={styles.previewPanel}>
              <div className={styles.previewHeader}>
                <div><span>Aperçu en direct</span><small>Accueil public</small></div>
                <span className={`${styles.statusPill} ${canAppear ? styles.statusLive : ''}`}>
                  <span />{canAppear ? 'Visible' : 'Masqué'}
                </span>
              </div>
              <div className={styles.browserPreview}>
                <div className={styles.browserBar}><span /><span /><span /></div>
                <div className={styles.previewCanvas}>
                  <span className={styles.previewBadge} style={{ color: previewAccent.dot, background: previewAccent.soft, borderColor: previewAccent.border }}>
                    <span style={{ background: previewAccent.dot }} /> À la une
                  </span>
                  <h3>{preview.title}</h3>
                  {preview.subtitle && <p>{preview.subtitle}</p>}
                  <div className={styles.previewEvents}>
                    {(visibleEvents.length ? visibleEvents.slice(0, 3) : [null, null]).map((event, index) => (
                      <div className={styles.previewEvent} key={event?.id ?? index}>
                        <span className={styles.previewArtwork} style={{ '--preview-accent': previewAccent.dot } as React.CSSProperties} />
                        <span><strong>{event?.name ?? 'Votre événement apparaîtra ici'}</strong><small>{event ? [event.dateDisplay || event.date, event.city].filter(Boolean).join(' · ') : 'Ajoutez un rendez-vous à la sélection'}</small></span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <p className={styles.previewNote}>
                {canAppear ? `${visibleEvents.length} événement${visibleEvents.length > 1 ? 's' : ''} prêt${visibleEvents.length > 1 ? 's' : ''} à être affiché${visibleEvents.length > 1 ? 's' : ''}.` : preview.active ? 'Ajoutez au moins un événement disponible pour rendre la rubrique visible.' : 'Activez la rubrique pour la rendre visible sur l’accueil.'}
              </p>
            </Card>

            <Card className={styles.publishPanel}>
              <div className={styles.publishState} aria-live="polite">
                <span className={dirty ? styles.unsavedDot : styles.savedDot} />
                <span><strong>{dirty ? 'Modifications non enregistrées' : 'Tout est à jour'}</strong><small>{dirty ? 'Publiez pour appliquer cette version.' : 'La version affichée est enregistrée.'}</small></span>
              </div>
              <Button variant="primary" className={styles.saveButton} onClick={save} disabled={saving || !dirty || loadError} loading={saving} loadingText="Publication…">
                Publier les modifications
              </Button>
              {dirty && (
                <Button variant="ghost" className={styles.discardButton} onClick={discardChanges} disabled={saving}>
                  <RotateCcw size={16} aria-hidden="true" /> Annuler les changements
                </Button>
              )}
              {message && <p className={message.ok ? styles.successMessage : styles.errorMessage} role={message.ok ? 'status' : 'alert'}>{message.ok && <Check size={16} aria-hidden="true" />}{message.text}</p>}
            </Card>
          </aside>
        </div>
      </div>
    </main>
  )
}
