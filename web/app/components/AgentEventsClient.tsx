'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

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
  upcoming: { color: 'var(--teal)', borderColor: 'rgba(78,232,200,0.35)', background: 'rgba(78,232,200,0.08)' },
  past: { color: 'var(--text-faint)', borderColor: 'var(--border)', background: 'var(--surface-2)' },
  cancelled: { color: '#e05aaa', borderColor: 'rgba(224,90,170,0.35)', background: 'rgba(224,90,170,0.1)' },
}

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: '#fff', fontSize: 13.5, outline: 'none' }

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
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')

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
    <main style={{ minHeight: '100vh', padding: '32px 16px 80px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', margin: 0 }}>Événements</h1>
        </div>

        {listError && (
          <div style={{ ...cardStyle, border: '1px solid rgba(224,90,170,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Lecture impossible. Recharge la page ; si ça persiste, reconnecte-toi (droits agent).</p>
            <button onClick={loadList} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 12.5 }}>
              Recharger
            </button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {[
            { label: 'Total', value: events.length, color: 'var(--gold)' },
            { label: 'À venir', value: totalUpcoming, color: 'var(--teal)' },
            { label: 'Passés', value: totalPast, color: 'var(--text-faint)' },
            { label: 'Annulés', value: totalCancelled, color: '#e05aaa' },
          ].map((s) => (
            <div key={s.label} style={{ ...cardStyle, padding: '10px 8px', textAlign: 'center' }}>
              <p style={{ fontSize: 22, fontWeight: 700, color: s.color, margin: 0 }}>{s.value}</p>
              <p style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: '2px 0 0' }}>{s.label}</p>
            </div>
          ))}
        </div>

        <input type="text" placeholder="Rechercher par nom, organisateur, ville…" value={search} onChange={(e) => setSearch(e.target.value)} style={inputStyle} />

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FILTERS.map((f) => {
            const count = f.key === 'all' ? events.length : f.key === 'upcoming' ? totalUpcoming : f.key === 'past' ? totalPast : totalCancelled
            const active = filter === f.key
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{
                  padding: '7px 12px',
                  borderRadius: 999,
                  cursor: 'pointer',
                  fontSize: 10,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  border: active ? '1px solid rgba(200,169,110,0.45)' : '1px solid var(--border)',
                  background: active ? 'rgba(200,169,110,0.15)' : 'var(--surface)',
                  color: active ? 'var(--gold)' : 'var(--text-faint)',
                }}
              >
                {f.label} {count > 0 && <span style={{ marginLeft: 4, opacity: 0.7 }}>{count}</span>}
              </button>
            )
          })}
        </div>

        {listLoading ? (
          <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Chargement…</p>
        ) : filtered.length === 0 ? (
          <div style={{ ...cardStyle, textAlign: 'center' }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-muted)', margin: 0 }}>{events.length === 0 ? 'Aucun événement publié' : 'Aucun résultat'}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map((ev) => (
              <EventRow key={ev.id} event={ev} onCancel={() => { setAdminCancel({ id: ev.id, name: ev.name || 'cet événement' }); setAdminCancelMsg('') }} />
            ))}
          </div>
        )}
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
  return (
    <div style={{ ...cardStyle, padding: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
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
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
          <p style={{ fontSize: 11, color: 'rgba(255,140,140,0.85)', margin: '4px 0 0', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            Annulé{event.cancelledAt ? ` le ${fmtCancelledAt(event.cancelledAt)}` : ''}
            {event.cancellationMessage ? ` — « ${event.cancellationMessage} »` : ' — aucun message aux participants'}
          </p>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        {event.status === 'upcoming' && (
          <button
            onClick={onCancel}
            style={{ padding: '8px 12px', borderRadius: 10, cursor: 'pointer', background: 'rgba(224,90,170,0.14)', border: '1px solid rgba(224,90,170,0.5)', fontSize: 12, fontWeight: 700, color: '#e05aaa' }}
          >
            Annuler
          </button>
        )}
        <Link
          href={`/evenements/${event.id}`}
          style={{ padding: '8px 14px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border-strong)', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.9)', textDecoration: 'none' }}
        >
          Voir
        </Link>
      </div>
    </div>
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
      <div style={{ position: 'relative', width: 'min(460px, 100%)', ...cardStyle, borderColor: 'rgba(224,90,170,0.4)' }}>
        <p style={{ fontSize: 19, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>Annuler « {name} » ?</p>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 14px', lineHeight: 1.6 }}>
          Action irréversible : rembourse automatiquement les acheteurs (carte via Stripe, mobile money mis en liste de remboursement), annule les billets, libère le stock et bloque tout versement
          à l&apos;organisateur. Les acheteurs sont prévenus par e-mail.
        </p>
        <label style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>Message aux acheteurs (optionnel)</label>
        <textarea
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ex : soirée annulée pour raisons de sécurité…"
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6, marginBottom: 14 }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onCancel}
            disabled={busy}
            style={{ flex: 1, padding: '11px 0', borderRadius: 10, cursor: busy ? 'default' : 'pointer', background: 'var(--surface-2)', border: '1px solid var(--border-strong)', color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 600 }}
          >
            Retour
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            style={{ flex: 1, padding: '11px 0', borderRadius: 10, cursor: busy ? 'default' : 'pointer', background: '#c2347f', border: '1px solid var(--border-strong)', color: '#fff', fontSize: 13, fontWeight: 700 }}
          >
            {busy ? 'Annulation…' : "Annuler l'événement"}
          </button>
        </div>
      </div>
    </div>
  )
}
