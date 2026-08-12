'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { EventActionKey, OrganizerEventView } from './types'
import { formatMoney } from './types'
import { computePayoutGapLabel } from '@/lib/shared/organizerPayoutGaps'
import EventDashboardCard from './EventDashboardCard'
import OrganizerAnalytics from './OrganizerAnalytics'
import EventWizard, { type ServerEventDetail } from './EventWizard'
import BookingsPanel from './BookingsPanel'
import PostponeModal from './PostponeModal'
import CancelModal from './CancelModal'
import GuestlistModal from './GuestlistModal'
import BoostModal from './BoostModal'
import EventStaffModal from '@/app/components/EventStaffModal'
import PromoCodesPanel from '@/app/components/PromoCodesPanel'
import { Button, Card, EmptyState, Modal, Pagination, pagedSlice } from '@/app/components/ui'
import { useQueryParamState } from '@/lib/client/useQueryParamState'

const PAST_PAGE_SIZE = 15

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
  | { type: 'postpone'; event: OrganizerEventView }
  | { type: 'delete'; event: OrganizerEventView }

export default function MesEvenementsClient({ initialEvents, initialStripeChargesEnabled, initialMomos }: MesEvenementsClientProps) {
  const [events, setEvents] = useState(initialEvents)
  // Vue tableau de bord vs. wizard plein écran (création/édition), reflétée
  // dans l'URL (?event=new pour créer, ?event=<id> pour éditer, absent pour
  // le dashboard) — un lien vers "éditer cet événement précis" doit rester
  // partageable, pas seulement atteignable en cliquant depuis le dashboard.
  const [eventParam, setEventParam] = useQueryParamState<string>('event', '', { push: true })
  const view: 'dashboard' | 'create' = eventParam ? 'create' : 'dashboard'
  const editingEventId = eventParam && eventParam !== 'new' ? eventParam : null
  const [modal, setModal] = useState<ModalState>({ type: 'none' })
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [duplicating, setDuplicating] = useState<string | null>(null)
  const [duplicatePrefill, setDuplicatePrefill] = useState<ServerEventDetail | null>(null)
  const [now] = useState(() => Date.now())
  const [pastPageParam, setPastPageParam] = useQueryParamState<string>('pastPage', '1')
  const pastPage = Number(pastPageParam) || 1
  const setPastPage = (n: number) => setPastPageParam(String(n))

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

  const { pageItems: pagedPastEvents, pageCount: pastPageCount } = useMemo(() => pagedSlice(pastEvents, pastPage, PAST_PAGE_SIZE), [pastEvents, pastPage])

  function startCreate() {
    // Défensif : repart toujours d'un formulaire vraiment vide, même si un
    // préremplissage "Dupliquer" traînait encore en state (ex. navigation
    // arrière/avant du navigateur entre les deux vues).
    setDuplicatePrefill(null)
    setEventParam('new')
  }

  // "Dupliquer" ouvre désormais le wizard de création PRÉREMPLI à partir de
  // l'événement source, sans jamais rien créer/publier tant que
  // l'organisateur n'a pas lui-même soumis le formulaire — corrige le bug
  // remonté en réunion client le 11/08/2026 : avant, ce bouton republiait
  // immédiatement un doublon complet et déjà EN LIGNE de l'événement
  // sélectionné (POST direct vers /api/organizer-events), sans aucune
  // relecture possible. `EventWizard` gère lui-même la remise à zéro des
  // champs propres à l'original (places/sold/locked/cancelled/dates de
  // publication) via son option `asDuplicate` de `hydrate()`.
  async function duplicateEvent(event: OrganizerEventView) {
    setDuplicating(event.id)
    try {
      const detailRes = await fetch(`/api/organizer-events/${event.id}`)
      const detail = await detailRes.json()
      if (!detailRes.ok || !detail.ok) throw new Error()
      setDuplicatePrefill(detail.event)
      setEventParam('new')
    } catch {
      setMessage({ type: 'error', text: 'Impossible de charger cet événement pour le dupliquer — réessaie.' })
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
      case 'duplicate':
        void duplicateEvent(event)
        return
      case 'edit':
        setEventParam(event.id)
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
        prefill={duplicatePrefill}
        onClose={() => {
          setDuplicatePrefill(null)
          setEventParam('')
        }}
        onSaved={async () => {
          await refreshEvents()
          setDuplicatePrefill(null)
          setEventParam('')
          setMessage({ type: 'success', text: editingEventId ? 'Événement mis à jour.' : 'Ta soirée est en ligne.' })
        }}
      />
    )
  }

  return (
    <main className="lb-dashboard-page">
      <header className="lb-dashboard-page-header">
        <div>
          <h1 className="font-display lb-dashboard-title">
            Mes <span style={{ color: 'var(--teal)' }}>Événements</span>
          </h1>
          <p className="lb-dashboard-description">Crée, publie et pilote toutes tes soirées depuis un seul espace.</p>
        </div>
      </header>

      {message && (
        <div
          style={{
            padding: '12px 14px',
            marginBottom: 14,
            borderRadius: 12,
            border: `1px solid ${message.type === 'success' ? 'rgba(184,243,74,0.5)' : 'rgba(224,90,170,0.5)'}`,
            background: 'rgba(12,12,22,0.96)',
            color: message.type === 'success' ? 'var(--teal)' : 'var(--pink)',
            fontSize: 13,
          }}
        >
          {message.text}
        </div>
      )}

      {payoutGapLabel && (
        <div style={{ padding: '16px 18px', marginBottom: 16, borderRadius: 14, border: '1px solid rgba(184,243,74,0.35)', background: 'rgba(184,243,74,0.08)' }}>
          <p style={{ font: '700 14px var(--font-open-sans)', color: 'var(--gold)', margin: '0 0 6px' }}>Configure ton encaissement pour être payé</p>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, margin: '0 0 12px' }}>
            Tu as des événements dont la recette reste en attente : il te manque {payoutGapLabel}. Sans ça, l&rsquo;argent n&rsquo;est pas versé automatiquement.
          </p>
          <Link
            href="/organizer-studio?tab=paiements"
            style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '10px 18px', borderRadius: 3, background: 'var(--gold)', color: 'var(--obsidian)', fontWeight: 500, textTransform: 'none', letterSpacing: 'normal', fontSize: 12.5, textDecoration: 'none' }}
          >
            Configurer mon encaissement
          </Link>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 16, marginBottom: 28 }}>
        <Button
          variant="ghost"
          onClick={startCreate}
          style={{ minHeight: 142, textAlign: 'left', padding: 22, borderRadius: 'var(--radius-lg)', border: '1px solid rgba(184,243,74,0.4)', background: 'linear-gradient(135deg,rgba(184,243,74,.14),var(--surface))', cursor: 'pointer', display: 'block', fontWeight: 400, boxShadow: '0 16px 38px rgba(0,0,0,.2)' }}
        >
          <p style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--gold)', margin: '0 0 10px' }}>Nouveau</p>
          <p style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: '0 0 7px' }}>Créer un événement</p>
          <p style={{ fontSize: 13.5, lineHeight: 1.45, color: 'var(--text-muted)', margin: 0 }}>Configure le lieu, les billets et toutes les options.</p>
        </Button>
        <Link
          href="/organizer-studio"
          style={{ minHeight: 142, textAlign: 'left', padding: 22, borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-strong)', background: 'linear-gradient(180deg,var(--surface-2),var(--surface))', textDecoration: 'none', display: 'block', boxShadow: '0 16px 38px rgba(0,0,0,.2)' }}
        >
          <p style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--teal)', margin: '0 0 10px' }}>Audience</p>
          <p style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: '0 0 7px' }}>Ma page publique</p>
          <p style={{ fontSize: 13.5, lineHeight: 1.45, color: 'var(--text-muted)', margin: 0 }}>Présente ton univers et configure tes encaissements.</p>
        </Link>
        <Link
          href="/my-shifts"
          style={{ minHeight: 142, textAlign: 'left', padding: 22, borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-strong)', background: 'linear-gradient(180deg,var(--surface-2),var(--surface))', textDecoration: 'none', display: 'block', boxShadow: '0 16px 38px rgba(0,0,0,.2)' }}
        >
          <p style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--teal)', margin: '0 0 10px' }}>Entrée</p>
          <p style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: '0 0 7px' }}>Scanner les billets</p>
          <p style={{ fontSize: 13.5, lineHeight: 1.45, color: 'var(--text-muted)', margin: 0 }}>Contrôle les QR codes et suis les entrées en direct.</p>
        </Link>
      </div>

      <OrganizerAnalytics events={events} />

      <section style={{ marginBottom: 28 }}>
        <p style={{ fontSize: 14, fontWeight: 400, letterSpacing: '3.2px', textTransform: 'uppercase', color: 'var(--teal)', fontFamily: 'var(--font-display), sans-serif', margin: '0 0 12px' }}>
          Mes soirées en cours
        </p>
        {upcomingEvents.length === 0 ? (
          <EmptyState
            title="Aucun événement pour l’instant"
            description="Crée ton premier événement pour le retrouver ici, gérer ses billets et suivre tes ventes."
            action={<Button variant="primary" onClick={startCreate}>Créer mon premier événement</Button>}
          />
        ) : (
          <div className="lb-organizer-event-grid">
            {upcomingEvents.map((event) => (
              <EventDashboardCard key={event.id} event={event} onAction={handleAction} duplicating={duplicating === event.id} />
            ))}
          </div>
        )}
      </section>

      {cancelledEvents.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 14, fontWeight: 400, letterSpacing: '3.2px', textTransform: 'uppercase', color: 'var(--teal)', fontFamily: 'var(--font-display), sans-serif', margin: '0 0 12px' }}>Annulés</p>
          <div style={{ display: 'grid', gap: 10 }}>
            {cancelledEvents.map((event) => (
              <Card key={event.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12 }}>
                <div style={{ width: 52, height: 52, borderRadius: 8, background: event.imageUrl ? `url(${event.imageUrl}) center/cover` : '#10131d', filter: 'grayscale(60%)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: '#fff', fontSize: 13.5, margin: '0 0 2px' }}>{event.name}</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: 0 }}>
                    {event.dateDisplay || event.date} · {event.city}
                  </p>
                </div>
                <span style={{ padding: '4px 10px', borderRadius: 999, background: 'rgba(224,90,170,0.15)', color: 'var(--pink)', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase' }}>Annulé</span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => hideCancelledEvent(event.id)}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 11.5 }}
                >
                  Retirer de ma liste
                </Button>
              </Card>
            ))}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 10, lineHeight: 1.6 }}>
            Les événements annulés restent accessibles aux personnes ayant déjà un billet (elles voient ton message d&rsquo;annulation). « Retirer de ma liste » les enlève seulement de ton tableau de bord.
          </p>
        </section>
      )}

      {pastEvents.length > 0 && (
        <section>
          <p style={{ fontSize: 14, fontWeight: 400, letterSpacing: '3.2px', textTransform: 'uppercase', color: 'var(--teal)', fontFamily: 'var(--font-display), sans-serif', margin: '0 0 12px' }}>Événements passés</p>
          <div style={{ display: 'grid', gap: 10 }}>
            {pagedPastEvents.map((event) => (
              <Card key={event.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12 }}>
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
              </Card>
            ))}
          </div>
          <Pagination page={pastPage} pageCount={pastPageCount} onPageChange={setPastPage} totalItems={pastEvents.length} pageSize={PAST_PAGE_SIZE} />
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

  if (!places) {
    return (
      <Modal onClose={onClose} hideClose contentStyle={{ width: 40, height: 40, background: 'none', border: 'none', boxShadow: 'none', padding: 0, borderRadius: 0, maxHeight: 'none', overflowY: 'visible' }}>
        <div style={{ position: 'relative', width: 40, height: 40 }} aria-label="Chargement de la guestlist">
          <svg width={40} height={40} viewBox="0 0 24 24" style={{ display: 'inline-block' }} aria-hidden="true">
            <circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={3} />
            <path d="M21 12a9 9 0 00-9-9" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round">
              <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite" />
            </path>
          </svg>
        </div>
      </Modal>
    )
  }
  return <GuestlistModal event={{ id: event.id, name: event.name, places, currency: event.currency }} onClose={onClose} />
}
