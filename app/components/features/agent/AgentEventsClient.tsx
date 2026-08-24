'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { AlertTriangle, Ban, CalendarCheck2, CalendarDays, CalendarX2, ExternalLink, MapPin, RefreshCw, Search, UserRound } from 'lucide-react'
import { Button, Card, Input, Textarea, Label, Pagination, SkeletonRow, EmptyState, Modal, ToastViewport } from '@/app/components/ui'
import { useQueryParamState, useSetQueryParams } from '@/lib/client/useQueryParamState'
import styles from './AgentEventsClient.module.css'

const PAGE_SIZE = 15

// Port de la section « Événements » (tab === 'events') de
// src/pages/AgentPage.jsx (#9 phase agent/admin) — vue admin de TOUS les événements
// publiés, recherche + filtres pills, annulation admin.

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
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [stats, setStats] = useState({ upcoming: 0, past: 0, cancelled: 0 })
  const [search] = useQueryParamState<string>('q', '')
  const [filter] = useQueryParamState<FilterKey>('filter', 'all')
  const [pageParam, setPageParam] = useQueryParamState<string>('page', '1')
  const page = Number(pageParam) || 1
  const setPage = useCallback((n: number) => setPageParam(String(n)), [setPageParam])
  const [reloadVersion, setReloadVersion] = useState(0)

  const [adminCancel, setAdminCancel] = useState<{ id: string; name: string } | null>(null)
  const [adminCancelMsg, setAdminCancelMsg] = useState('')
  const [adminCancelBusy, setAdminCancelBusy] = useState(false)

  const [toast, setToast] = useState<ToastState | null>(null)

  const setQueryParams = useSetQueryParams()

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (search.trim()) params.set('search', search.trim())
    if (filter !== 'all') params.set('status', filter)
    params.set('page', String(page))
    params.set('pageSize', String(PAGE_SIZE))
    return params.toString()
  }, [search, filter, page])

  function showToast(message: string, kind: ToastState['kind']) {
    setToast({ message, kind })
    setTimeout(() => setToast(null), 3000)
  }

  const triggerReload = useCallback(() => setReloadVersion((value) => value + 1), [])

  useEffect(() => {
    let cancelled = false
    async function run() {
      setListLoading(true)
      setListError(false)
      try {
        const res = await fetch(`/api/agent/events${queryString ? `?${queryString}` : ''}`)
        const data = await res.json()
        if (!res.ok || !data.ok) throw new Error('load_failed')
        if (cancelled) return

        const list = Array.isArray(data.events) ? data.events : []
        const safeTotalPages = typeof data.totalPages === 'number' ? Math.max(1, data.totalPages) : 1
        setEvents(list)
        setTotalItems(typeof data.total === 'number' ? data.total : 0)
        setTotalPages(safeTotalPages)
        if (page > safeTotalPages) {
          setPage(safeTotalPages)
          return
        }
        if (data.stats) {
          setStats({
            upcoming: Number(data.stats.upcoming) || 0,
            past: Number(data.stats.past) || 0,
            cancelled: Number(data.stats.cancelled) || 0,
          })
        }
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
  }, [queryString, reloadVersion, page, setPage])

  const totalUpcoming = useMemo(() => stats.upcoming, [stats.upcoming])
  const totalPast = useMemo(() => stats.past, [stats.past])
  const totalCancelled = useMemo(() => stats.cancelled, [stats.cancelled])

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
      triggerReload()
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
          <Button variant="secondary" icon={<RefreshCw size={17} aria-hidden="true" />} onClick={triggerReload} loading={listLoading} loadingText="Actualisation…" className={styles.refresh}>Actualiser</Button>
        </div>

        {listError && (
          <Card accent="rgba(224,90,170,0.35)" className={styles.error} role="alert">
            <div className={styles.errorCopy}><AlertTriangle size={20} aria-hidden="true" /><div><strong>Impossible de charger les événements</strong><p>Vérifie ta connexion ou reconnecte-toi si tes droits agent ont changé.</p></div></div>
            <Button variant="secondary" onClick={triggerReload}>Réessayer</Button>
          </Card>
        )}

        <div className={styles.metrics} aria-label="Filtrer par statut">
          {[
            { key: 'all' as FilterKey, label: 'Tous les événements', value: totalItems, icon: CalendarDays },
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
          <span className={styles.resultCount}>{totalItems} résultat{totalItems === 1 ? '' : 's'}</span>
          {(search || filter !== 'all') && <Button variant="ghost" className={styles.clear} onClick={() => setQueryParams({ q: null, filter: null, page: null })}>Réinitialiser</Button>}
        </div>

        <div className={styles.listHeader}><div><h2>{filter === 'all' ? 'Tous les événements' : filter === 'upcoming' ? 'Événements à venir' : filter === 'past' ? 'Événements terminés' : 'Événements annulés'}</h2><p>Les événements sont classés par date, avec les annulations en fin de liste.</p></div></div>

        {listLoading ? (
          <div className={styles.loadingGrid}>
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonRow key={i} columns={2} />
            ))}
          </div>
        ) : events.length === 0 ? (
          <EmptyState
            title={totalItems === 0 ? 'Aucun événement publié' : 'Aucun résultat'}
            description={totalItems === 0 ? 'Aucun événement n’a encore été publié sur la plateforme.' : 'Aucun événement ne correspond aux filtres actuels.'}
          />
        ) : (
          <div className={styles.grid}>
            {events.map((ev) => (
              <EventRow key={ev.id} event={ev} onCancel={() => { setAdminCancel({ id: ev.id, name: ev.name || 'cet événement' }); setAdminCancelMsg('') }} />
            ))}
          </div>
        )}

        <Pagination page={page} pageCount={totalPages} onPageChange={setPage} totalItems={totalItems} pageSize={PAGE_SIZE} />
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
          <Image src={event.imageUrl} alt="" fill className={styles.image} sizes="(max-width: 760px) 100vw, 33vw" />
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
    <Modal onClose={onCancel} dismissible={!busy} ariaLabel={`Annuler ${name}`} contentStyle={{ borderColor: 'rgba(224,90,170,.3)' }}>
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
