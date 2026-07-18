'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { EventActionKey, OrganizerEventView } from './types'
import { formatMoney } from './types'
import { computePayoutGapLabel } from '@/lib/shared/organizerPayoutGaps'
import EventDashboardCard from './EventDashboardCard'
import OrganizerAnalytics from './OrganizerAnalytics'
import EventWizard from './EventWizard'
import BookingsPanel from './BookingsPanel'
import PostponeModal from './PostponeModal'
import CancelModal from './CancelModal'
import GuestlistModal from './GuestlistModal'
import AccessCodesModal from './AccessCodesModal'
import BoostModal from './BoostModal'
import EventStaffModal from '@/app/components/EventStaffModal'
import PromoCodesPanel from '@/app/components/PromoCodesPanel'

// Port du tableau de bord organisateur (MesEvenementsPage.jsx, #7 phase
// organisateur) — vue 'dashboard' (cette page) vs. 'create' (EventWizard,
// monté ici en plein écran exactement comme le legacy bascule tout le
// contenu de la page plutôt que d'ouvrir un modal).
export interface MesEvenementsClientProps {
  initialEvents: OrganizerEventView[]
  initialStripeChargesEnabled: boolean
  initialMomos: Record<string, string>
}

type ModalState =
  | { type: 'none' }
  | { type: 'bookings'; event: OrganizerEventView }
  | { type: 'boost'; event: OrganizerEventView }
  | { type: 'guests'; event: OrganizerEventView }
  | { type: 'staff'; event: OrganizerEventView }
  | { type: 'promo'; event: OrganizerEventView }
  | { type: 'codes'; event: OrganizerEventView }
  | { type: 'postpone'; event: OrganizerEventView }
  | { type: 'delete'; event: OrganizerEventView }

export default function MesEvenementsClient({ initialEvents, initialStripeChargesEnabled, initialMomos }: MesEvenementsClientProps) {
  const [events, setEvents] = useState(initialEvents)
  const [view, setView] = useState<'dashboard' | 'create'>('dashboard')
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>({ type: 'none' })
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [duplicating, setDuplicating] = useState<string | null>(null)
  const [now] = useState(() => Date.now())

  async function refreshEvents() {
    const res = await fetch('/api/organizer-events')
    const data = await res.json()
    if (res.ok && data.ok) setEvents(data.events)
  }

  const payoutGapLabel = useMemo(
    () => computePayoutGapLabel(events, { stripeChargesEnabled: initialStripeChargesEnabled, momos: initialMomos }),
    [events, initialStripeChargesEnabled, initialMomos]
  )

  const { upcomingEvents, pastEvents, cancelledEvents } = useMemo(() => {
    const upcoming: OrganizerEventView[] = []
    const past: OrganizerEventView[] = []
    const cancelled: OrganizerEventView[] = []
    for (const e of events) {
      if (e.cancelled) {
        cancelled.push(e)
        continue
      }
      const isPast = new Date(`${e.date}T${e.time || '23:59'}`).getTime() < now
      if (isPast) past.push(e)
      else upcoming.push(e)
    }
    return { upcomingEvents: upcoming, pastEvents: past, cancelledEvents: cancelled }
  }, [events, now])

  function startCreate() {
    setEditingEventId(null)
    setView('create')
  }

  async function duplicateEvent(event: OrganizerEventView) {
    setDuplicating(event.id)
    try {
      const detailRes = await fetch(`/api/organizer-events/${event.id}`)
      const detail = await detailRes.json()
      if (!detailRes.ok || !detail.ok) throw new Error()
      const src = detail.event
      const payload = {
        name: `${src.name} (copie)`,
        subtitle: src.subtitle,
        description: src.description,
        category: src.category,
        tags: src.tags,
        eventType: src.eventType,
        musicStyles: src.musicStyles,
        ambiances: src.ambiances,
        date: src.date,
        time: src.time,
        endTime: src.endTime,
        location: src.location,
        city: src.city,
        region: src.region,
        imageUrl: src.imageUrl,
        videoUrl: src.videoUrl,
        color: src.color,
        accentColor: src.accentColor,
        places: src.places.map((p: { type: string; price: number; total: number; icon: string; maxPerAccount: number; groupType: string; groupMin: number; groupMax: number; photos: string[]; included: { name: string; qty: number }[] }) => ({
          id: '',
          type: p.type,
          price: p.price,
          total: p.total,
          icon: p.icon,
          maxPerAccount: p.maxPerAccount,
          groupType: p.groupType,
          groupMin: p.groupMin,
          groupMax: p.groupMax,
          photos: p.photos,
          included: p.included,
        })),
        playlist: src.playlist,
        preorder: src.preorder,
        menu: src.menu,
        artists: src.artists,
        dj: src.dj,
        performers: src.performers,
        minAge: src.minAge,
        isPrivate: src.isPrivate,
      }
      const createRes = await fetch('/api/organizer-events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const created = await createRes.json()
      if (!createRes.ok || !created.ok) throw new Error()
      setMessage({ type: 'success', text: 'Événement dupliqué.' })
      await refreshEvents()
    } catch {
      setMessage({ type: 'error', text: 'La duplication a échoué — réessaie.' })
    } finally {
      setDuplicating(null)
    }
  }

  function handleAction(action: EventActionKey, event: OrganizerEventView) {
    switch (action) {
      case 'stats':
        window.location.href = `/my-events/${event.id}/statistiques`
        return
      case 'bookings':
        setModal({ type: 'bookings', event })
        return
      case 'boost':
        setModal({ type: 'boost', event })
        return
      case 'guests':
        setModal({ type: 'guests', event })
        return
      case 'staff':
        setModal({ type: 'staff', event })
        return
      case 'promo':
        setModal({ type: 'promo', event })
        return
      case 'codes':
        setModal({ type: 'codes', event })
        return
      case 'duplicate':
        void duplicateEvent(event)
        return
      case 'edit':
        setEditingEventId(event.id)
        setView('create')
        return
      case 'postpone':
        setModal({ type: 'postpone', event })
        return
      case 'delete':
        setModal({ type: 'delete', event })
        return
    }
  }

  async function hideCancelledEvent(eventId: string) {
    setEvents((current) => current.filter((e) => e.id !== eventId))
  }

  if (view === 'create') {
    return (
      <EventWizard
        eventId={editingEventId}
        onClose={() => setView('dashboard')}
        onSaved={async () => {
          await refreshEvents()
          setView('dashboard')
          setMessage({ type: 'success', text: editingEventId ? 'Événement mis à jour.' : 'Ta soirée est en ligne.' })
        }}
      />
    )
  }

  return (
    <main style={{ maxWidth: 1180, margin: '0 auto', padding: '30px 20px 100px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 18, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ font: '300 42px Inter, sans-serif', color: '#fff', margin: 0 }}>
            Mes <span style={{ color: 'var(--teal)', fontWeight: 600 }}>Événements</span>
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: '8px 0 0', fontSize: 14 }}>Crée et gère tes soirées</p>
        </div>
      </header>

      {message && (
        <div
          style={{
            padding: '12px 14px',
            marginBottom: 14,
            borderRadius: 12,
            border: `1px solid ${message.type === 'success' ? 'rgba(78,232,200,0.5)' : 'rgba(224,90,170,0.5)'}`,
            background: 'rgba(12,12,22,0.96)',
            color: message.type === 'success' ? 'var(--teal)' : 'var(--pink)',
            fontSize: 13,
          }}
        >
          {message.text}
        </div>
      )}

      {payoutGapLabel && (
        <div style={{ padding: '16px 18px', marginBottom: 16, borderRadius: 14, border: '1px solid rgba(200,169,110,0.35)', background: 'rgba(200,169,110,0.08)' }}>
          <p style={{ font: '700 14px Inter, sans-serif', color: 'var(--gold)', margin: '0 0 6px' }}>Configure ton encaissement pour être payé</p>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, margin: '0 0 12px' }}>
            Tu as des événements dont la recette reste en attente : il te manque {payoutGapLabel}. Sans ça, l&rsquo;argent n&rsquo;est pas versé automatiquement.
          </p>
          <Link
            href="/organizer-studio?section=encaissement"
            style={{ display: 'inline-block', padding: '10px 18px', borderRadius: 10, background: 'var(--gold)', color: 'var(--obsidian)', fontWeight: 700, fontSize: 12.5, textDecoration: 'none' }}
          >
            Configurer mon encaissement
          </Link>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
        <button
          onClick={startCreate}
          style={{ textAlign: 'left', padding: 16, borderRadius: 14, border: '1px solid rgba(200,169,110,0.35)', background: 'rgba(200,169,110,0.08)', cursor: 'pointer' }}
        >
          <p style={{ font: '700 10.5px Inter, sans-serif', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--gold)', margin: '0 0 6px' }}>Nouveau</p>
          <p style={{ font: '600 15px Inter, sans-serif', color: '#fff', margin: '0 0 4px' }}>Créer un événement</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>De A à Z — lieux, places, options</p>
        </button>
        <Link
          href="/organizer-studio"
          style={{ textAlign: 'left', padding: 16, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--surface)', textDecoration: 'none', display: 'block' }}
        >
          <p style={{ font: '700 10.5px Inter, sans-serif', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--teal)', margin: '0 0 6px' }}>Audience</p>
          <p style={{ font: '600 15px Inter, sans-serif', color: '#fff', margin: '0 0 4px' }}>Ma page publique</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Active ta page pour apparaître chez les clients</p>
        </Link>
        <Link
          href="/scanner"
          style={{ textAlign: 'left', padding: 16, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--surface)', textDecoration: 'none', display: 'block' }}
        >
          <p style={{ font: '700 10.5px Inter, sans-serif', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--teal)', margin: '0 0 6px' }}>Entrée</p>
          <p style={{ font: '600 15px Inter, sans-serif', color: '#fff', margin: '0 0 4px' }}>Scanner les billets</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Vérifie les QR à l&rsquo;entrée en temps réel</p>
        </Link>
      </div>

      <OrganizerAnalytics events={events} />

      <section style={{ marginBottom: 28 }}>
        <p style={{ font: '700 11px Inter, sans-serif', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 12px' }}>
          Mes soirées en cours
        </p>
        {upcomingEvents.length === 0 ? (
          <div style={{ padding: '30px 20px', textAlign: 'center', border: '1px solid var(--border)', borderRadius: 16, background: 'var(--surface)' }}>
            <p style={{ color: '#fff', fontSize: 14, margin: '0 0 4px' }}>Aucun événement pour l&rsquo;instant</p>
            <p style={{ color: 'var(--text-muted)', fontSize: 12.5, margin: 0 }}>Crée ton premier événement pour le retrouver ici.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {upcomingEvents.map((event) => (
              <EventDashboardCard key={event.id} event={event} onAction={handleAction} />
            ))}
          </div>
        )}
      </section>

      {cancelledEvents.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <p style={{ font: '700 11px Inter, sans-serif', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 12px' }}>Annulés</p>
          <div style={{ display: 'grid', gap: 10 }}>
            {cancelledEvents.map((event) => (
              <div key={event.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)' }}>
                <div style={{ width: 52, height: 52, borderRadius: 8, background: event.imageUrl ? `url(${event.imageUrl}) center/cover` : '#10131d', filter: 'grayscale(60%)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: '#fff', fontSize: 13.5, margin: '0 0 2px' }}>{event.name}</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: 0 }}>
                    {event.dateDisplay || event.date} · {event.city}
                  </p>
                </div>
                <span style={{ padding: '4px 10px', borderRadius: 999, background: 'rgba(224,90,170,0.15)', color: 'var(--pink)', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase' }}>Annulé</span>
                <button
                  onClick={() => hideCancelledEvent(event.id)}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 11.5, cursor: 'pointer' }}
                >
                  Retirer de ma liste
                </button>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 10, lineHeight: 1.6 }}>
            Les événements annulés restent accessibles aux personnes ayant déjà un billet (elles voient ton message d&rsquo;annulation). « Retirer de ma liste » les enlève seulement de ton tableau de bord.
          </p>
        </section>
      )}

      {pastEvents.length > 0 && (
        <section>
          <p style={{ font: '700 11px Inter, sans-serif', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 12px' }}>Événements passés</p>
          <div style={{ display: 'grid', gap: 10 }}>
            {pastEvents.map((event) => (
              <div key={event.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)' }}>
                <div style={{ width: 52, height: 52, borderRadius: 8, background: event.imageUrl ? `url(${event.imageUrl}) center/cover` : '#10131d', filter: 'grayscale(30%)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: '#fff', fontSize: 13.5, margin: '0 0 2px' }}>{event.name}</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: 0 }}>
                    {event.dateDisplay || event.date} · {event.city}
                  </p>
                </div>
                <span style={{ padding: '4px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase' }}>Terminé</span>
                <span style={{ color: 'var(--gold)', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {event.ticketCount} billet(s) · {formatMoney(event.revenue, event.currency)}
                </span>
                <Link
                  href={`/my-events/${event.id}/statistiques`}
                  aria-label="Statistiques"
                  style={{ padding: 8, borderRadius: 8, border: '1px solid var(--border)', color: 'var(--teal)', display: 'grid', placeItems: 'center' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 20V10m8 10V4m8 16v-7" />
                  </svg>
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {duplicating && <p style={{ position: 'fixed', bottom: 20, right: 20, color: 'var(--text-muted)', fontSize: 12 }}>Duplication en cours…</p>}

      {modal.type === 'bookings' && <BookingsPanel event={{ id: modal.event.id, name: modal.event.name, currency: modal.event.currency }} onClose={() => setModal({ type: 'none' })} />}
      {modal.type === 'boost' && <BoostModal event={{ id: modal.event.id, name: modal.event.name, region: modal.event.region }} onClose={() => setModal({ type: 'none' })} />}
      {modal.type === 'guests' && (
        <GuestlistModalWithPlaces event={modal.event} onClose={() => setModal({ type: 'none' })} />
      )}
      {modal.type === 'staff' && <EventStaffModal event={{ id: modal.event.id, name: modal.event.name }} onClose={() => setModal({ type: 'none' })} />}
      {modal.type === 'promo' && <PromoCodesPanel event={{ id: modal.event.id, name: modal.event.name, currency: modal.event.currency }} onClose={() => setModal({ type: 'none' })} />}
      {modal.type === 'codes' && <AccessCodesModal event={{ id: modal.event.id, name: modal.event.name }} onClose={() => setModal({ type: 'none' })} />}
      {modal.type === 'postpone' && (
        <PostponeModal
          event={{ id: modal.event.id, name: modal.event.name, date: modal.event.date, dateDisplay: modal.event.dateDisplay, time: modal.event.time }}
          onClose={() => setModal({ type: 'none' })}
          onDone={async () => {
            setModal({ type: 'none' })
            await refreshEvents()
            setMessage({ type: 'success', text: 'Événement reporté.' })
          }}
        />
      )}
      {modal.type === 'delete' && (
        <CancelModal
          event={{ id: modal.event.id, name: modal.event.name }}
          onClose={() => setModal({ type: 'none' })}
          onDone={async () => {
            setModal({ type: 'none' })
            await refreshEvents()
            setMessage({ type: 'success', text: 'Événement supprimé ou annulé.' })
          }}
        />
      )}
    </main>
  )
}

// La modale guestlist a besoin des places de l'événement (pour le sélecteur
// de type de place) — absentes de OrganizerEventView (vue liste minimale) —
// on les charge à la volée à l'ouverture plutôt que d'alourdir la vue liste
// pour un seul champ rarement consulté.
function GuestlistModalWithPlaces({ event, onClose }: { event: OrganizerEventView; onClose: () => void }) {
  const [places, setPlaces] = useState<{ id: string; type: string; price: number }[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/organizer-events/${event.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        if (data.ok) setPlaces(data.event.places.map((p: { id: string; type: string; price: number }) => ({ id: p.id, type: p.type, price: p.price })))
        else setPlaces([])
      })
      .catch(() => {
        if (!cancelled) setPlaces([])
      })
    return () => {
      cancelled = true
    }
  }, [event.id])

  if (!places) return null
  return <GuestlistModal event={{ id: event.id, name: event.name, places }} onClose={onClose} />
}
