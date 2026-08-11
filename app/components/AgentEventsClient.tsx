'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Button, Card, Input, Textarea, Label, Pagination, SkeletonRow, pagedSlice, EmptyState } from '@/app/components/ui'
import { useQueryParamState, useSetQueryParams } from '@/lib/client/useQueryParamState'

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

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'upcoming', label: 'À venir' },
  { key: 'past', label: 'Passés' },
  { key: 'cancelled', label: 'Annulés' },
]

const STATUS_LABEL: Record<EventStatus, string> = { upcoming: 'À venir', past: 'Passé', cancelled: 'Annulé' }
const STATUS_STYLE: Record<EventStatus, React.CSSProperties> = {
  upcoming: { color: 'var(--primary)', borderColor: 'rgba(184, 243, 74,0.35)', background: 'rgba(184, 243, 74,0.08)' },
  past: { color: 'var(--text-faint)', borderColor: 'var(--border)', background: 'var(--surface-2)' },
  cancelled: { color: '#e05aaa', borderColor: 'rgba(224,90,170,0.35)', background: 'rgba(224,90,170,0.1)' },
}


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
    <main className="lb-dashboard-page">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 className="font-display lb-dashboard-title">Événements</h1>
        </div>

        {listError && (
          <Card accent="rgba(224,90,170,0.35)" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Lecture impossible. Recharge la page ; si ça persiste, reconnecte-toi (droits agent).</p>
            <Button variant="secondary" onClick={loadList} style={{ fontSize: 12.5 }}>
              Recharger
            </Button>
          </Card>
        )}

        <div className="lb-responsive-metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {[
            { label: 'Total', value: events.length, color: 'var(--gold)' },
            { label: 'À venir', value: totalUpcoming, color: 'var(--teal)' },
            { label: 'Passés', value: totalPast, color: 'var(--text-faint)' },
            { label: 'Annulés', value: totalCancelled, color: '#e05aaa' },
          ].map((s) => (
            <Card key={s.label} style={{ padding: '10px 8px', textAlign: 'center' }}>
              <p style={{ fontSize: 22, fontWeight: 700, color: s.color, margin: 0 }}>{s.value}</p>
              <p style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: '2px 0 0' }}>{s.label}</p>
            </Card>
          ))}
        </div>

        <Input type="text" placeholder="Rechercher par nom, organisateur, ville…" value={search} onChange={(e) => setQueryParams({ q: e.target.value === '' ? null : e.target.value, page: null })} />

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FILTERS.map((f) => {
            const count = f.key === 'all' ? events.length : f.key === 'upcoming' ? totalUpcoming : f.key === 'past' ? totalPast : totalCancelled
            const active = filter === f.key
            return (
              <Button
                key={f.key}
                variant="ghost"
                onClick={() => setQueryParams({ filter: f.key === 'all' ? null : f.key, page: null })}
                style={{
                  padding: '7px 12px',
                  borderRadius: 999,
                  fontSize: 10,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  border: active ? '1px solid rgba(184, 243, 74,0.45)' : '1px solid var(--border)',
                  background: active ? 'rgba(184, 243, 74,0.15)' : 'var(--surface)',
                  color: active ? 'var(--gold)' : 'var(--text-faint)',
                }}
              >
                {f.label} <span style={{ marginLeft: 4, opacity: 0.7 }}>{count}</span>
              </Button>
            )
          })}
        </div>

        {listLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonRow key={i} columns={2} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={events.length === 0 ? 'Aucun événement publié' : 'Aucun résultat'}
            description={events.length === 0 ? 'Aucun événement n’a encore été publié sur la plateforme.' : 'Aucun événement ne correspond aux filtres actuels.'}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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

      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 80,
            padding: '10px 18px',
            borderRadius: 10,
            background: 'var(--surface-2)',
            border: `1px solid ${toast.kind === 'success' ? 'var(--teal)' : '#e05aaa'}`,
            color: '#fff',
            fontSize: 13,
          }}
        >
          {toast.message}
        </div>
      )}
    </main>
  )
}

function EventRow({ event, onCancel }: { event: AgentEvent; onCancel: () => void }) {
  const statusStyle = STATUS_STYLE[event.status]
  const [expanded, setExpanded] = useState(false)
  return (
    <Card style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 6,
          overflow: 'hidden',
          flexShrink: 0,
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {event.imageUrl ? (
          <Image src={event.imageUrl} alt="" width={56} height={56} style={{ objectFit: 'cover' }} />
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="1.5">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.name}</p>
          <span style={{ flexShrink: 0, padding: '2px 7px', borderRadius: 3, border: '1px solid', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', ...statusStyle }}>
            {STATUS_LABEL[event.status]}
          </span>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {event.dateDisplay || event.date} {event.city ? `· ${event.city}` : ''} · {event.organizerName || event.organizer || '—'}
        </p>
        {event.cancelled && (
          <>
            <p
              style={{
                fontSize: 11,
                color: 'rgba(255,140,140,0.85)',
                margin: '4px 0 0',
                lineHeight: 1.45,
                ...(expanded ? null : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }),
              }}
            >
              Annulé{event.cancelledAt ? ` le ${fmtCancelledAt(event.cancelledAt)}` : ''}
              {event.cancellationMessage ? ` — « ${event.cancellationMessage} »` : ' — aucun message aux participants'}
            </p>
            {event.cancellationMessage && (
              <Button
                variant="link"
                onClick={() => setExpanded((v) => !v)}
                style={{ marginTop: 2, color: 'var(--text-faint)', fontSize: 10.5, fontWeight: 700 }}
              >
                {expanded ? 'Voir moins' : 'Voir plus'}
              </Button>
            )}
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: 14, flexShrink: 0 }}>
        {event.status === 'upcoming' && (
          <Button
            variant="danger"
            onClick={onCancel}
            style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(224,90,170,0.14)', border: '1px solid rgba(224,90,170,0.5)', fontSize: 12, color: '#e05aaa' }}
          >
            Annuler
          </Button>
        )}
        <Link
          href={`/events/${event.id}`}
          style={{ padding: '8px 14px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border-strong)', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.9)', textDecoration: 'none' }}
        >
          Voir
        </Link>
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(3,4,8,0.75)', backdropFilter: 'blur(6px)' }} onClick={onCancel} />
      <Card accent="rgba(224,90,170,0.4)" style={{ position: 'relative', width: 'min(460px, 100%)' }}>
        <p style={{ fontSize: 19, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>Annuler « {name} » ?</p>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 14px', lineHeight: 1.6 }}>
          Action irréversible : rembourse automatiquement les acheteurs (carte via Stripe, mobile money mis en liste de remboursement), annule les billets, libère le stock et bloque tout versement
          à l&apos;organisateur. Les acheteurs sont prévenus par e-mail.
        </p>
        <Label style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>Message aux acheteurs (optionnel)</Label>
        <Textarea
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ex : soirée annulée pour raisons de sécurité…"
          style={{ resize: 'vertical', lineHeight: 1.6, marginBottom: 14 }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={busy}
            style={{ flex: 1, padding: '11px 0', borderRadius: 10, fontSize: 13 }}
          >
            Retour
          </Button>
          <Button
            variant="danger"
            onClick={onConfirm}
            disabled={busy}
            loading={busy}
            loadingText="Annulation…"
            style={{ flex: 1, padding: '11px 0', borderRadius: 3, fontWeight: 500, background: '#c2347f', fontSize: 13, textTransform: 'none', letterSpacing: 'normal' }}
          >
            Annuler l&apos;événement
          </Button>
        </div>
      </Card>
    </div>
  )
}
