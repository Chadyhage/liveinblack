'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { AlertTriangle, Ban, CalendarCheck2, CalendarDays, CalendarX2, ExternalLink, MapPin, RefreshCw, Search, UserRound } from 'lucide-react'
import { Button, Card, Input, Textarea, Label, Pagination, SkeletonRow, pagedSlice, EmptyState, Modal, ToastViewport } from '@/app/components/ui'
import { useQueryParamState, useSetQueryParams } from '@/lib/client/useQueryParamState'
import styles from './AgentEventsClient.module.css'

const PAGE_SIZE = 15

// Port de la section « Événements » (tab === 'events') de
// src/pages/AgentPage.jsx (#9 phase agent/admin) — vue admin de TOUS les
// événements publiés, recherche + filtres pills, annulation admin. Voir
// lib/server/agentEvents.ts (listEventsForAgent / adminCancelEvent) : cette
// dernière RÉUTILISE le même flux autoritaire que l'organisateur
// (lib/server/organizerEventLifecycle.ts::cancelOrganizerEvent), jamais de
// remboursement/annulation dupliqués ici.
//
// Différence volontaire avec le legacy : la liste est chargée via un fetch
// classique (GET /api/agent/events) plutôt que le listener Firestore
// temps-réel (listenEvents) — ce port n'a pas d'équivalent temps-réel côté
// Mongo ; le bouton « Recharger » et le rafraîchissement après annulation
// couvrent le même besoin.

type EventStatus = 'upcoming' | 'past' | 'cancelled'

interface AgentEvent {
  id: string
  name: string
  date: string
  dateDisplay: string
  city: string
  organizerName: string
  organizer: string
  imageUrl: string | null
  cancelled: boolean
  cancelledAt: string | null
  cancellationMessage: string
  status: EventStatus
}

type FilterKey = 'all' | EventStatus

const STATUS_LABEL: Record<EventStatus, string> = { upcoming: 'À venir', past: 'Passé', cancelled: 'Annulé' }
interface ToastState {
  message: string
  kind: 'success' | 'error'
}

function fmtCancelledAt(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  } catch {
    return ''
  }
}

export default function AgentEventsClient() {
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState(false)
  const [search] = useQueryParamState<string>('q', '')
  const [filter] = useQueryParamState<FilterKey>('filter', 'all')
  const [pageParam, setPageParam] = useQueryParamState<string>('page', '1')
  const page = Number(pageParam)
  const setPage = (n: number) => setPageParam(String(n))
  // Recherche/filtre + reset de page doivent être écrits dans l'URL en une
  // seule fois (voir useSetQueryParams) — deux setValue() successifs
  // écrasent l'un l'autre.
  const setQueryParams = useSetQueryParams()

  const [adminCancel, setAdminCancel] = useState<{ id: string; name: string } | null>(null)
  const [adminCancelMsg, setAdminCancelMsg] = useState('')
  const [adminCancelBusy, setAdminCancelBusy] = useState(false)

  const [toast, setToast] = useState<ToastState | null>(null)

  function showToast(message: string, kind: ToastState['kind']) {
    setToast({ message, kind })
    setTimeout(() => setToast(null), 3000)
  }

  async function loadList() {
    setListLoading(true)
    setListError(false)
    try {
      const res = await fetch('/api/agent/events')
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error('load_failed')
      setEvents(data.events)
    } catch {
      setListError(true)
    } finally {
      setListLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    async function run() {
      setListLoading(true)
      setListError(false)
      try {
        const res = await fetch('/api/agent/events')
        const data = await res.json()
        if (!res.ok || !data.ok) throw new Error('load_failed')
        if (!cancelled) setEvents(data.events)
      } catch {
        if (!cancelled) setListError(true)
      } finally {
        if (!cancelled) setListLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [])

  const totalUpcoming = useMemo(() => events.filter((e) => e.status === 'upcoming').length, [events])
  const totalPast = useMemo(() => events.filter((e) => e.status === 'past').length, [events])
  const totalCancelled = useMemo(() => events.filter((e) => e.status === 'cancelled').length, [events])

  const filtered = useMemo(() => {
    let list = events
    if (filter !== 'all') list = list.filter((e) => e.status === filter)
    const term = search.trim().toLowerCase()
    if (term) {
      list = list.filter(
        (e) => e.name.toLowerCase().includes(term) || e.organizerName.toLowerCase().includes(term) || e.organizer.toLowerCase().includes(term) || e.city.toLowerCase().includes(term)
      )
    }
    return [...list].sort((a, b) => {
      if (a.cancelled !== b.cancelled) return a.cancelled ? 1 : -1
      return new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime()
    })
  }, [events, filter, search])

  const { pageItems, pageCount } = useMemo(() => pagedSlice(filtered, page, PAGE_SIZE), [filtered, page])

  async function handleAdminCancelEvent() {
    if (!adminCancel) return
    setAdminCancelBusy(true)
    try {
      const res = await fetch(`/api/agent/events/${adminCancel.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: adminCancelMsg }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        showToast('Annulation impossible pour le moment — réessaie.', 'error')
        return
      }
      showToast('Événement annulé — remboursements enclenchés, acheteurs prévenus.', 'success')
      setAdminCancel(null)
      setAdminCancelMsg('')
      await loadList()
    } catch {
      showToast('Connexion impossible — réessaie.', 'error')
    } finally {
      setAdminCancelBusy(false)
    }
  }

  return (
    <main className={`lb-dashboard-page lb-agent-screen lb-agent-screen--events ${styles.page}`}>
      <div className={styles.stack}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="secondary" icon={<RefreshCw size={17} aria-hidden="true" />} onClick={loadList} loading={listLoading} loadingText="Actualisation…" className={styles.refresh}>Actualiser</Button>
        </div>

        {listError && (
          <Card accent="rgba(224,90,170,0.35)" className={styles.error} role="alert">
            <div className={styles.errorCopy}><AlertTriangle size={20} aria-hidden="true" /><div><strong>Impossible de charger les événements</strong><p>Vérifie ta connexion ou reconnecte-toi si tes droits agent ont changé.</p></div></div>
            <Button variant="secondary" onClick={loadList}>Réessayer</Button>
          </Card>
        )}

        <div className={styles.metrics} aria-label="Filtrer par statut">
          {[
            { key: 'all' as FilterKey, label: 'Tous les événements', value: events.length, icon: CalendarDays },
            { key: 'upcoming' as FilterKey, label: 'À venir', value: totalUpcoming, icon: CalendarCheck2 },
            { key: 'past' as FilterKey, label: 'Terminés', value: totalPast, icon: CalendarDays },
            { key: 'cancelled' as FilterKey, label: 'Annulés', value: totalCancelled, icon: CalendarX2 },
          ].map((s) => {
            const Icon = s.icon
            return <Button key={s.key} variant="ghost" className={`${styles.metric}${filter === s.key ? ` ${styles.metricActive}` : ''}`} onClick={() => setQueryParams({ filter: s.key === 'all' ? null : s.key, page: null })} aria-pressed={filter === s.key}>
              <span className={styles.metricTop}><span className={styles.metricIcon}><Icon size={19} aria-hidden="true" /></span><strong className={styles.metricValue}>{s.value}</strong></span>
              <span className={styles.metricLabel}>{s.label}</span>
            </Button>
          })}
        </div>

        <div className={styles.controls}>
          <div className={styles.search}><Search size={18} aria-hidden="true" /><Input type="search" aria-label="Rechercher un événement" placeholder="Nom, organisateur ou ville…" value={search} onChange={(e) => setQueryParams({ q: e.target.value === '' ? null : e.target.value, page: null })} /></div>
          <span className={styles.resultCount}>{filtered.length} résultat{filtered.length === 1 ? '' : 's'}</span>
          {(search || filter !== 'all') && <Button variant="ghost" className={styles.clear} onClick={() => setQueryParams({ q: null, filter: null, page: null })}>Réinitialiser</Button>}
        </div>

        <div className={styles.listHeader}><div><h2>{filter === 'all' ? 'Tous les événements' : filter === 'upcoming' ? 'Événements à venir' : filter === 'past' ? 'Événements terminés' : 'Événements annulés'}</h2><p>Les événements sont classés par date, avec les annulations en fin de liste.</p></div></div>

        {listLoading ? (
          <div className={styles.loadingGrid}>
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonRow key={i} columns={2} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={events.length === 0 ? 'Aucun événement publié' : 'Aucun résultat'}
            description={events.length === 0 ? 'Aucun événement n’a encore été publié sur la plateforme.' : 'Aucun événement ne correspond aux filtres actuels.'}
          />
        ) : (
          <div className={styles.grid}>
            {pageItems.map((ev) => (
              <EventRow key={ev.id} event={ev} onCancel={() => { setAdminCancel({ id: ev.id, name: ev.name || 'cet événement' }); setAdminCancelMsg('') }} />
            ))}
          </div>
        )}

        <Pagination page={page} pageCount={pageCount} onPageChange={setPage} totalItems={filtered.length} pageSize={PAGE_SIZE} />
      </div>

      {adminCancel && (
        <AdminCancelModal
          name={adminCancel.name}
          message={adminCancelMsg}
          setMessage={setAdminCancelMsg}
          busy={adminCancelBusy}
          onCancel={() => !adminCancelBusy && setAdminCancel(null)}
          onConfirm={handleAdminCancelEvent}
        />
      )}

      <ToastViewport items={toast ? [{ id: 'evenements', message: toast.message, kind: toast.kind === 'success' ? 'success' : 'error' }] : []} />
    </main>
  )
}

function EventRow({ event, onCancel }: { event: AgentEvent; onCancel: () => void }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <Card className={styles.eventCard}>
      <div className={styles.visual}>
        {event.imageUrl ? (
          <Image src={event.imageUrl} alt="" fill className={styles.image} sizes="(max-width: 980px) 100vw, 50vw" />
        ) : (
          <span className={styles.placeholder}><CalendarDays size={42} strokeWidth={1.25} aria-hidden="true" /></span>
        )}
        <span className={styles.scrim} aria-hidden="true" />
        <span className={`${styles.status} ${styles[event.status]}`}>{event.status === 'cancelled' ? <Ban size={13} aria-hidden="true" /> : <CalendarDays size={13} aria-hidden="true" />}{STATUS_LABEL[event.status]}</span>
        <span className={styles.dateChip}><CalendarDays size={13} aria-hidden="true" />{event.dateDisplay || event.date || 'Date à confirmer'}</span>
        <div className={styles.visualTitle}><h3>{event.name}</h3><p>{event.city || 'Lieu à confirmer'}</p></div>
      </div>
      <div className={styles.body}>
        <div className={styles.facts}>
          <div className={styles.fact}><UserRound size={16} aria-hidden="true" /><span>{event.organizerName || event.organizer || 'Organisateur inconnu'}</span></div>
          <div className={styles.fact}><MapPin size={16} aria-hidden="true" /><span>{event.city || 'Ville non renseignée'}</span></div>
        </div>
        {event.cancelled && (
          <div className={styles.cancellation}>
            <strong>Annulé{event.cancelledAt ? ` le ${fmtCancelledAt(event.cancelledAt)}` : ''}</strong>
            <p className={expanded ? undefined : styles.clamped}>{event.cancellationMessage ? `« ${event.cancellationMessage} »` : 'Aucun message n’a été envoyé aux participants.'}</p>
            {event.cancellationMessage && (
              <Button variant="link" className={styles.expand} onClick={() => setExpanded((v) => !v)}>{expanded ? 'Réduire' : 'Lire le message'}</Button>
            )}
          </div>
        )}
        <div className={styles.actions}>
        {event.status === 'upcoming' && (
          <Button variant="danger" icon={<Ban size={16} aria-hidden="true" />} className={styles.cancelButton} onClick={onCancel}>Annuler</Button>
        )}
        <Link href={`/events/${event.id}`} className={styles.viewLink}>Voir la page <ExternalLink size={15} aria-hidden="true" /></Link>
        </div>
      </div>
    </Card>
  )
}

function AdminCancelModal({
  name,
  message,
  setMessage,
  busy,
  onCancel,
  onConfirm,
}: {
  name: string
  message: string
  setMessage: (v: string) => void
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Modal onClose={onCancel} maxWidth={460} dismissible={!busy} ariaLabel={`Annuler ${name}`} contentStyle={{ borderColor: 'rgba(224,90,170,.3)' }}>
        <div className={styles.modalHeader}><span className={styles.modalIcon}><AlertTriangle size={22} aria-hidden="true" /></span><h2>Annuler « {name} » ?</h2><p>Cette action est irréversible. Les billets seront annulés, le stock libéré, les versements bloqués et les remboursements déclenchés selon le moyen de paiement.</p></div>
        <Label>Message aux acheteurs (optionnel)</Label>
        <Textarea
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ex : soirée annulée pour raisons de sécurité…"
          style={{ resize: 'vertical', lineHeight: 1.6, marginTop: 7 }}
        />
        <div className={styles.modalActions}>
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={busy}
            fullWidth
          >
            Retour
          </Button>
          <Button
            variant="danger"
            onClick={onConfirm}
            disabled={busy}
            loading={busy}
            loadingText="Annulation…"
            fullWidth
          >
            Annuler l&apos;événement
          </Button>
        </div>
    </Modal>
  )
}
