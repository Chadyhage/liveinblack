'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { QRCodeCanvas } from 'qrcode.react'
import { fmtMoney } from '@/lib/shared/money'
import { downloadTicketPNG, shareOrCopy, shareStory, downloadICS, countdownLabel } from '@/lib/shared/ticketExtras'

// Port du panneau "Mes billets" de ProfilePage.jsx (#6 phase profil) — copies
// mirroir des DTO JSON de lib/server/tickets.ts (même convention que
// MessagesClient.tsx : pas d'import direct de lib/server/* côté client).

export interface TicketWalletItemView {
  ticketCode: string
  place: string
  placePrice: number
  totalPrice: number
  currency: string
  preorders: { name: string; price: number; qty: number }[]
  guestName: string | null
  bookedAt: string | null
  checkedInAt: string | null
  isMine: boolean
  isHostSeat: boolean
  tableId: string | null
  seatIndex: number | null
  assignedTo: string | null
  assignedName: string | null
}

export interface TicketWalletEventView {
  id: string
  name: string
  date: string
  dateDisplay: string
  time: string
  city: string
  imageUrl: string | null
  color: string
  cancelled: boolean
  minAge: number
  hasPlaylist: boolean
}

export interface TicketWalletGroupView {
  eventId: string
  event: TicketWalletEventView | null
  myTickets: TicketWalletItemView[]
  hostedSeats: TicketWalletItemView[]
}

const SITE = typeof window !== 'undefined' ? window.location.origin : ''
const SUPPORT_EMAIL = 'hagechady@liveinblack.com'
const DISMISSED_KEY = 'liveinblack:dismissedCancelBanners'

function readDismissed(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]'))
  } catch {
    return new Set()
  }
}

type GroupBucket = 'upcoming' | 'past' | 'cancelled'

function classify(group: TicketWalletGroupView): GroupBucket {
  if (group.event?.cancelled) return 'cancelled'
  const dateStr = group.event?.date
  if (!dateStr) return 'past'
  const d = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return d.getTime() < today.getTime() ? 'past' : 'upcoming'
}

const cardStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 16,
}

export default function TicketWalletPanel({ groups, currentUserId, onBack }: { groups: TicketWalletGroupView[]; currentUserId: string; onBack: () => void }) {
  const buckets = useMemo(() => {
    const withBucket = groups.map((g) => ({ g, bucket: classify(g) }))
    const rank: Record<GroupBucket, number> = { upcoming: 0, past: 1, cancelled: 2 }
    withBucket.sort((a, b) => {
      if (rank[a.bucket] !== rank[b.bucket]) return rank[a.bucket] - rank[b.bucket]
      const da = a.g.event?.date ? new Date(a.g.event.date).getTime() : 0
      const db = b.g.event?.date ? new Date(b.g.event.date).getTime() : 0
      return a.bucket === 'upcoming' ? da - db : db - da
    })
    return {
      upcoming: withBucket.filter((x) => x.bucket === 'upcoming').map((x) => x.g),
      past: withBucket.filter((x) => x.bucket === 'past').map((x) => x.g),
      cancelled: withBucket.filter((x) => x.bucket === 'cancelled').map((x) => x.g),
    }
  }, [groups])

  const upcomingSeatCount = buckets.upcoming.reduce((sum, g) => sum + g.myTickets.length, 0)

  return (
    <main style={{ minHeight: '100vh', padding: '20px 16px 48px' }}>
      <div style={{ maxWidth: 520, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <BackHeader onBack={onBack} title="Mes billets" />

        {groups.length === 0 ? (
          <EmptyWallet />
        ) : (
          <>
            <div style={{ ...cardStyle, padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <TicketGlyph />
                <div>
                  <p style={{ fontWeight: 800, fontSize: 19, color: '#fff', margin: 0 }}>
                    {upcomingSeatCount > 0 ? `${upcomingSeatCount} place${upcomingSeatCount > 1 ? 's' : ''} à venir` : 'Aucune place à venir'}
                  </p>
                  <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                    {buckets.upcoming.length > 0
                      ? `Sur ${buckets.upcoming.length} événement${buckets.upcoming.length > 1 ? 's' : ''} — QR codes prêts à scanner`
                      : 'Trouve ta prochaine soirée dans les événements'}
                  </p>
                </div>
              </div>
              <Link
                href="/events"
                style={{
                  alignSelf: 'flex-start',
                  padding: '9px 16px',
                  borderRadius: 10,
                  background: 'var(--teal-solid)',
                  color: '#04120e',
                  fontWeight: 700,
                  fontSize: 13,
                  textDecoration: 'none',
                }}
              >
                Trouver une soirée
              </Link>
            </div>

            {buckets.upcoming.length > 0 && <Section label={`À venir (${buckets.upcoming.length})`} groups={buckets.upcoming} currentUserId={currentUserId} />}
            {buckets.past.length > 0 && <Section label={`Événements passés (${buckets.past.length})`} groups={buckets.past} currentUserId={currentUserId} />}
            {buckets.cancelled.length > 0 && <Section label={`Annulés (${buckets.cancelled.length})`} groups={buckets.cancelled} currentUserId={currentUserId} />}
          </>
        )}
      </div>
    </main>
  )
}

function Section({ label, groups, currentUserId }: { label: string; groups: TicketWalletGroupView[]; currentUserId: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '4px 0 0' }}>{label}</p>
      {groups.map((g) => (
        <EventTicketGroupCard key={g.eventId} group={g} currentUserId={currentUserId} bucket={classify(g)} />
      ))}
    </div>
  )
}

function BackHeader({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
      <button
        onClick={onBack}
        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 22, cursor: 'pointer', padding: '4px 8px 4px 0' }}
        aria-label="Retour"
      >
        ‹
      </button>
      <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: '#fff' }}>{title}</h1>
    </div>
  )
}

function TicketGlyph() {
  return (
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: 12,
        background: 'rgba(200,169,110,0.12)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6M4 6h16a1 1 0 011 1v3a2 2 0 000 4v3a1 1 0 01-1 1H4a1 1 0 01-1-1v-3a2 2 0 000-4V7a1 1 0 011-1z" />
      </svg>
    </div>
  )
}

function EmptyWallet() {
  return (
    <div style={{ ...cardStyle, padding: '48px 24px', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
        <TicketGlyph />
      </div>
      <p style={{ fontWeight: 700, fontSize: 17, color: '#fff', margin: '0 0 6px' }}>Aucun billet pour l&apos;instant</p>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px' }}>Tes billets achetés apparaîtront ici, avec leur QR code.</p>
      <Link
        href="/events"
        style={{ display: 'inline-block', padding: '11px 22px', borderRadius: 10, background: 'var(--teal-solid)', color: '#04120e', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}
      >
        Découvrir les événements
      </Link>
    </div>
  )
}

function EventTicketGroupCard({ group, currentUserId, bucket }: { group: TicketWalletGroupView; currentUserId: string; bucket: GroupBucket }) {
  const [expanded, setExpanded] = useState(true)
  const [dismissed, setDismissed] = useState<Set<string>>(() => readDismissed())
  const event = group.event
  const cancelled = bucket === 'cancelled'
  const past = bucket === 'past'

  const showCancelBanner = cancelled && !dismissed.has(group.eventId)
  const hostsTable = group.hostedSeats.length > 0

  // Un siège de table déjà attribué à quelqu'un d'autre ne s'affiche pas
  // comme carte de billet séparée ici — il vit uniquement dans
  // TableHostPanel, pour empêcher l'hôte de scanner une invitation qu'il a
  // donnée.
  const visibleTickets = group.myTickets.filter((t) => !(t.isHostSeat && t.assignedTo && t.assignedTo !== currentUserId))

  function dismissBanner() {
    const next = new Set(dismissed)
    next.add(group.eventId)
    setDismissed(next)
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]))
    } catch {
      // localStorage indisponible (navigation privée) — le bandeau
      // réapparaîtra à la prochaine visite, sans conséquence fonctionnelle.
    }
  }

  function contactSupportMailto() {
    const refs = group.myTickets.map((t) => t.ticketCode).join(', ')
    const subject = encodeURIComponent(`Événement annulé — ${event?.name ?? ''}`)
    const body = encodeURIComponent(`Bonjour,\n\nMon événement a été annulé. Mes billets : ${refs}.\nPourriez-vous m'indiquer la marche à suivre pour le remboursement ?\n\nMerci.`)
    return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`
  }

  return (
    <div style={{ ...cardStyle, overflow: 'hidden' }}>
      <Link
        href={event ? `/events/${event.id}` : '#'}
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, textDecoration: 'none', color: 'inherit' }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 10,
            background: event?.imageUrl ? `url(${event.imageUrl}) center/cover` : 'rgba(200,169,110,0.12)',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {!event?.imageUrl && <TicketGlyph />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontWeight: 700,
              fontSize: 15,
              margin: '0 0 2px',
              color: cancelled ? '#e05aaa' : past ? 'var(--text-muted)' : '#fff',
              textDecoration: cancelled ? 'line-through' : 'none',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {event?.name ?? 'Événement supprimé'}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0 }}>{event?.dateDisplay || event?.date || ''}</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          {cancelled && <Pill color="#e05aaa" bg="rgba(224,90,170,0.12)">Annulé</Pill>}
          {past && !cancelled && <Pill color="var(--text-faint)" bg="rgba(255,255,255,0.06)">Terminé</Pill>}
          <Pill color="var(--teal)" bg="rgba(78,232,200,0.10)">
            {group.myTickets.length} billet{group.myTickets.length > 1 ? 's' : ''}
          </Pill>
        </div>
      </Link>

      {showCancelBanner && (
        <div style={{ margin: '0 14px 14px', padding: 14, borderRadius: 12, background: 'rgba(224,90,170,0.08)', border: '1px solid rgba(224,90,170,0.25)' }}>
          <p style={{ fontSize: 13, color: '#fff', margin: '0 0 10px', lineHeight: 1.5 }}>
            Cet événement n&apos;aura pas lieu. Pour toute question concernant ton billet ou un remboursement, contacte le support.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <a
              href={contactSupportMailto()}
              style={{ padding: '8px 14px', borderRadius: 8, background: '#c2347f', color: '#fff', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}
            >
              Contacter le support
            </a>
            <button
              onClick={dismissBanner}
              style={{ padding: '8px 12px', borderRadius: 8, background: 'transparent', border: '1px solid var(--border-strong)', color: 'var(--text-muted)', fontSize: 12.5, cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {past && !cancelled && (
        <div style={{ margin: '0 14px 14px', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)' }}>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>Événement terminé</p>
          <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: '2px 0 0' }}>Billet conservé dans ton historique · QR et commandes désactivés</p>
        </div>
      )}

      {hostsTable && event && <TableHostPanel hostedSeats={group.hostedSeats} />}

      {group.myTickets.length > 0 && (
        <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              onClick={() => setExpanded((v) => !v)}
              style={{ background: 'transparent', border: 'none', color: 'var(--teal)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: 0 }}
            >
              {expanded ? 'Masquer mes places' : 'Voir mes places'}
            </button>
            {event?.hasPlaylist && !cancelled && !past && (
              <Link
                href={`/playlist/${event.id}`}
                style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--violet)', textDecoration: 'none' }}
              >
                Playlist interactive
              </Link>
            )}
          </div>
          {expanded &&
            visibleTickets.map((t) => (
              <PremiumTicketCard key={t.ticketCode} ticket={t} event={event} inactive={cancelled || past} inactiveLabel={cancelled ? 'Billet annulé' : 'Billet expiré'} />
            ))}
        </div>
      )}
    </div>
  )
}

function Pill({ children, color, bg }: { children: React.ReactNode; color: string; bg: string }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, color, background: bg, whiteSpace: 'nowrap' }}>{children}</span>
  )
}

// ─────────────────────────────── TableHostPanel ──────────────────────────────
// Contrairement au legacy (bind direct par e-mail, instantané), l'hôte
// INVITE désormais un invité (consentement requis, #37) : les 3 états par
// siège sont Libre / Invitation envoyée (en attente) / Attribuée.

function TableHostPanel({ hostedSeats }: { hostedSeats: TicketWalletItemView[] }) {
  const [pendingByCode, setPendingByCode] = useState<Record<string, string>>({})
  const [openInviteFor, setOpenInviteFor] = useState<string | null>(null)
  const [emailDraft, setEmailDraft] = useState('')
  const [busyCode, setBusyCode] = useState<string | null>(null)
  const [toast, setToast] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null)
  const [loadedInvitations, setLoadedInvitations] = useState(false)

  const assignedCount = hostedSeats.filter((s) => s.assignedTo).length

  function flash(text: string, kind: 'ok' | 'err') {
    setToast({ text, kind })
    setTimeout(() => setToast(null), kind === 'err' ? 4200 : 2600)
  }

  async function loadOutgoingInvitations() {
    if (loadedInvitations) return
    setLoadedInvitations(true)
    try {
      const codes = hostedSeats.map((s) => s.ticketCode).join(',')
      const res = await fetch(`/api/tickets/invitations/outgoing?ticketCodes=${encodeURIComponent(codes)}`)
      const data = await res.json()
      if (res.ok && data.ok) {
        const map: Record<string, string> = {}
        for (const inv of data.invitations) map[inv.ticketCode] = inv.targetEmail
        setPendingByCode(map)
      }
    } catch {
      // Silencieux — le panneau reste utilisable sans l'info "en attente",
      // simplement moins précis tant que le prochain montage ne réessaie.
    }
  }

  useMemo(() => {
    loadOutgoingInvitations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function sendInvite(ticketCode: string) {
    const targetEmail = emailDraft.trim()
    if (!targetEmail) return
    setBusyCode(ticketCode)
    try {
      const res = await fetch('/api/tickets/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketCode, targetEmail }) })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        flash(inviteErrorMessage(data.error), 'err')
      } else {
        setPendingByCode((m) => ({ ...m, [ticketCode]: targetEmail }))
        setOpenInviteFor(null)
        setEmailDraft('')
        flash('Invitation envoyée', 'ok')
      }
    } catch {
      flash('Erreur réseau — réessaie.', 'err')
    } finally {
      setBusyCode(null)
    }
  }

  async function cancelInvite(ticketCode: string) {
    setBusyCode(ticketCode)
    try {
      const res = await fetch('/api/tickets/assign/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketCode }) })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        flash(data.error || 'Erreur réseau — réessaie.', 'err')
      } else {
        setPendingByCode((m) => {
          const next = { ...m }
          delete next[ticketCode]
          return next
        })
        flash('Invitation annulée', 'ok')
      }
    } catch {
      flash('Erreur réseau — réessaie.', 'err')
    } finally {
      setBusyCode(null)
    }
  }

  async function revoke(ticketCode: string) {
    setBusyCode(ticketCode)
    try {
      const res = await fetch('/api/tickets/revoke', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketCode }) })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        flash(data.error || 'Erreur réseau — réessaie.', 'err')
      } else {
        flash('Place reprise', 'ok')
      }
    } catch {
      flash('Erreur réseau — réessaie.', 'err')
    } finally {
      setBusyCode(null)
    }
  }

  return (
    <div style={{ margin: '0 14px 14px', padding: 16, borderRadius: 12, background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.20)', position: 'relative' }}>
      {toast && (
        <div
          style={{
            position: 'absolute',
            top: -14,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '6px 14px',
            borderRadius: 999,
            background: toast.kind === 'ok' ? 'var(--teal-solid)' : '#c2347f',
            color: toast.kind === 'ok' ? '#04120e' : '#fff',
            fontSize: 11.5,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            zIndex: 10,
          }}
        >
          {toast.text}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <p style={{ fontWeight: 700, fontSize: 13.5, color: '#fff', margin: 0 }}>Ma table · {hostedSeats.length} places</p>
        <span style={{ fontSize: 12, color: 'var(--violet)', fontWeight: 700 }}>
          {assignedCount}/{hostedSeats.length} attribuées
        </span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, margin: '0 0 12px' }}>
        Invite chaque place à un ami via l&apos;e-mail de son compte : il reçoit une invitation qu&apos;il doit accepter pour recevoir le billet avec son propre QR
        code. Tu peux reprendre une place tant que ton invité n&apos;est pas entré.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {hostedSeats.map((seat, i) => {
          const pendingEmail = pendingByCode[seat.ticketCode]
          return (
            <div key={seat.ticketCode} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div>
                  <p style={{ fontSize: 13, color: '#fff', margin: 0, fontWeight: 600 }}>Place {i + 1}</p>
                  <p style={{ fontSize: 11.5, margin: '1px 0 0', color: seat.assignedTo ? 'var(--teal)' : pendingEmail ? 'var(--gold)' : 'var(--text-faint)' }}>
                    {seat.assignedTo ? `Attribuée à ${seat.assignedName || 'un invité'}` : pendingEmail ? `Invitation envoyée à ${pendingEmail}` : 'Libre — à toi'}
                  </p>
                </div>
                {seat.assignedTo ? (
                  <button onClick={() => revoke(seat.ticketCode)} disabled={busyCode === seat.ticketCode} style={smallBtnStyle('rgba(224,90,170,0.14)', '#e05aaa')}>
                    Reprendre
                  </button>
                ) : pendingEmail ? (
                  <button onClick={() => cancelInvite(seat.ticketCode)} disabled={busyCode === seat.ticketCode} style={smallBtnStyle('rgba(255,255,255,0.06)', 'var(--text-muted)')}>
                    Annuler
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setOpenInviteFor(openInviteFor === seat.ticketCode ? null : seat.ticketCode)
                      setEmailDraft('')
                    }}
                    style={smallBtnStyle('rgba(139,92,246,0.16)', 'var(--violet)')}
                  >
                    Inviter
                  </button>
                )}
              </div>
              {openInviteFor === seat.ticketCode && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="email"
                    value={emailDraft}
                    onChange={(e) => setEmailDraft(e.target.value)}
                    placeholder="Adresse e-mail de ton invité·e"
                    style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: '#fff', fontSize: 12.5 }}
                  />
                  <button
                    onClick={() => sendInvite(seat.ticketCode)}
                    disabled={busyCode === seat.ticketCode || !emailDraft.trim()}
                    style={smallBtnStyle('var(--teal-solid)', '#04120e')}
                  >
                    Donner
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function smallBtnStyle(bg: string, color: string): React.CSSProperties {
  return { padding: '6px 12px', borderRadius: 8, background: bg, color, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }
}

function inviteErrorMessage(code: string): string {
  const map: Record<string, string> = {
    guest_not_found: "Aucun compte n'existe avec cet e-mail.",
    already_yours: "C'est déjà toi.",
    seat_already_assigned: "Cette place est déjà attribuée — reprends-la d'abord.",
    invitation_already_pending: 'Une invitation est déjà en attente pour cette place.',
    forbidden: "Tu n'es pas l'hôte de cette place.",
  }
  return map[code] || 'Erreur — réessaie.'
}

// ─────────────────────────────── PremiumTicketCard ───────────────────────────

interface IncludedItem {
  id: string
  name: string
  quantity: number
  status: 'sent' | 'served' | 'cancelled'
}

function PremiumTicketCard({
  ticket,
  event,
  inactive,
  inactiveLabel,
}: {
  ticket: TicketWalletItemView
  event: TicketWalletEventView | null
  inactive: boolean
  inactiveLabel: string
}) {
  const [showQr, setShowQr] = useState(false)
  const [showIncluded, setShowIncluded] = useState(false)
  const [included, setIncluded] = useState<IncludedItem[] | null>(null)
  const [downloadState, setDownloadState] = useState<'idle' | 'busy' | 'ok' | 'err'>('idle')
  const [storyState, setStoryState] = useState<'idle' | 'busy' | 'ok' | 'err'>('idle')
  const [flashMsg, setFlashMsg] = useState<string | null>(null)
  const qrExportRef = useRef<HTMLCanvasElement>(null)

  const ticketUrl = `${SITE}/ticket/${ticket.ticketCode}`
  const countdown = event ? countdownLabel(event.date) : null
  const preorderTotal = ticket.preorders.reduce((sum, p) => sum + p.price * p.qty, 0)

  function flash(msg: string) {
    setFlashMsg(msg)
    setTimeout(() => setFlashMsg(null), 2200)
  }

  async function toggleIncluded() {
    if (!showIncluded && included === null && event) {
      try {
        const res = await fetch(`/api/event-orders/${event.id}?ticketId=${ticket.ticketCode}`)
        const data = await res.json()
        if (res.ok && data.ok) {
          setIncluded(
            data.items
              .filter((i: { kind: string }) => i.kind === 'included')
              .map((i: { id: string; name: string; quantity: number; status: string }) => ({ id: i.id, name: i.name, quantity: i.quantity, status: i.status }))
          )
        } else {
          setIncluded([])
        }
      } catch {
        setIncluded([])
      }
    }
    setShowIncluded((v) => !v)
  }

  async function handleDownload() {
    if (!qrExportRef.current || !event) return
    setDownloadState('busy')
    const result = await downloadTicketPNG({
      eventName: event.name,
      dateDisplay: event.dateDisplay || event.date,
      place: ticket.place,
      ticketCode: ticket.ticketCode,
      ticketNumber: String((ticket.seatIndex ?? 0) + 1).padStart(2, '0'),
      qrCanvas: qrExportRef.current,
      color: event.color,
    })
    if (result.ok) {
      setDownloadState('ok')
      setTimeout(() => setDownloadState('idle'), 1800)
    } else {
      setDownloadState('err')
    }
  }

  async function handleShare() {
    if (!event) return
    const result = await shareOrCopy(`${SITE}/events/${event.id}`, `Rejoins-moi à ${event.name}`)
    if (result.method === 'copy') flash('Lien copié')
    else if (result.method === 'unsupported') flash('Partage indisponible sur ce navigateur')
  }

  async function handleShareStory() {
    if (!event) return
    setStoryState('busy')
    const result = await shareStory({ eventName: event.name, dateDisplay: event.dateDisplay || event.date, city: event.city, imageUrl: event.imageUrl, color: event.color })
    if (result.ok) {
      setStoryState('ok')
      flash(result.method === 'share' ? 'Story partagée' : 'Story téléchargée — publie-la depuis ta galerie')
      setTimeout(() => setStoryState('idle'), 1800)
    } else {
      setStoryState('err')
      flash('Génération impossible — réessaie.')
      setTimeout(() => setStoryState('idle'), 1800)
    }
  }

  function handleCalendar() {
    if (!event) return
    const result = downloadICS({ name: event.name, dateStr: event.date, timeStr: event.time, city: event.city })
    flash(result.ok ? 'Ajouté au calendrier' : 'Date de l’événement indisponible')
  }

  return (
    <div style={{ borderRadius: 14, background: 'linear-gradient(135deg,#15161f,#0d0e15)', border: '1px solid var(--border)', overflow: 'hidden', position: 'relative' }}>
      {flashMsg && (
        <div
          style={{ position: 'absolute', top: 8, right: 8, padding: '5px 12px', borderRadius: 999, background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: 11, zIndex: 5 }}
        >
          {flashMsg}
        </div>
      )}
      <div style={{ display: 'flex' }}>
        <div style={{ flex: 1, padding: 16, minWidth: 0 }}>
          <p style={{ fontSize: 10.5, fontWeight: 700, color: event?.color || 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>
            Live in Black · Billet officiel
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {countdown && !inactive && <Pill color="#04120e" bg="var(--teal-solid)">{countdown}</Pill>}
            {(event?.minAge ?? 0) >= 18 && (
              <span title="Pièce d'identité pouvant être demandée à l'entrée">
                <Pill color="var(--gold)" bg="rgba(200,169,110,0.14)">18+</Pill>
              </span>
            )}
          </div>
          <p style={{ fontWeight: 800, fontSize: 18, color: '#fff', margin: '0 0 12px' }}>{event?.name ?? 'Événement'}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            <MetaCell label="Place" value={ticket.place} />
            <MetaCell label="Date" value={event?.dateDisplay || event?.date || ''} />
            <MetaCell label="Billet" value={String((ticket.seatIndex ?? 0) + 1).padStart(2, '0')} />
          </div>
        </div>

        <div
          style={{
            width: 140,
            flexShrink: 0,
            borderLeft: '2px dashed rgba(255,255,255,0.15)',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          {inactive ? (
            <>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth={1.6}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
                <circle cx="12" cy="12" r="9" strokeLinecap="round" />
              </svg>
              <p style={{ fontSize: 10.5, color: 'var(--text-faint)', textAlign: 'center', margin: 0 }}>{inactiveLabel}</p>
              <p style={{ fontSize: 9.5, color: 'var(--text-faint)', margin: 0 }}>QR désactivé</p>
            </>
          ) : (
            <>
              <div style={{ background: '#fff', padding: 8, borderRadius: 8, cursor: 'pointer' }} onClick={() => setShowQr((v) => !v)}>
                <QRCodeCanvas value={ticketUrl} size={84} level="H" />
              </div>
              <p style={{ fontSize: 10, color: 'var(--text-faint)', letterSpacing: '0.04em', margin: 0 }}>{ticket.ticketCode}</p>
            </>
          )}
        </div>
      </div>

      {/* Canvas caché, plus grand, pour l'export PNG (identique au legacy). */}
      {!inactive && (
        <div style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
          <QRCodeCanvas ref={qrExportRef} value={ticketUrl} size={500} level="H" />
        </div>
      )}

      {preorderTotal > 0 && (
        <div style={{ padding: '0 16px 16px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>Consommations incluses</p>
          {ticket.preorders.map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 4 }}>
              <span>
                {item.name} ×{item.qty}
              </span>
              <span style={{ color: '#fff', fontWeight: 600 }}>{fmtMoney(item.price * item.qty, ticket.currency)}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
            <span style={{ color: '#fff' }}>Total</span>
            <span style={{ color: 'var(--gold)' }}>{fmtMoney(preorderTotal, ticket.currency)}</span>
          </div>
        </div>
      )}

      {showQr && !inactive && (
        <div style={{ padding: '0 16px 16px', textAlign: 'center' }}>
          <div style={{ background: '#fff', display: 'inline-block', padding: 16, borderRadius: 12 }}>
            <QRCodeCanvas value={ticketUrl} size={200} level="H" />
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '8px 0 0' }}>Présente ce code à l&apos;entrée · usage unique</p>
        </div>
      )}

      {showIncluded && (
        <div style={{ padding: '0 16px 16px' }}>
          {included === null ? (
            <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Chargement…</p>
          ) : included.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Aucune option incluse.</p>
          ) : (
            <>
              {included.map((it) => (
                <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {it.name} ×{it.quantity}
                  </span>
                  <span style={{ color: it.status === 'served' ? '#4ee8c8' : 'var(--gold)', fontWeight: 700, fontSize: 11 }}>{it.status === 'served' ? 'Servi' : 'À récupérer'}</span>
                </div>
              ))}
              <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '8px 0 0', lineHeight: 1.5 }}>
                Présente ton billet au staff pendant la soirée : il coche chaque option au moment où il te la sert.
              </p>
            </>
          )}
        </div>
      )}

      <div style={{ padding: '10px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {inactive ? (
          <p style={{ fontSize: 12, color: 'var(--text-faint)', textAlign: 'center', margin: 0 }}>{inactiveLabel} · aucune action disponible</p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <ActionBtn onClick={() => setShowQr((v) => !v)}>{showQr ? 'Réduire le QR' : 'Afficher le QR'}</ActionBtn>
              <ActionBtn onClick={handleDownload} disabled={downloadState === 'busy'}>
                {downloadState === 'busy' ? 'Préparation…' : downloadState === 'ok' ? 'Billet téléchargé' : 'Télécharger le billet'}
              </ActionBtn>
              <ActionBtn onClick={toggleIncluded}>{showIncluded ? 'Masquer les options' : 'Voir les options incluses'}</ActionBtn>
            </div>
            {downloadState === 'err' && (
              <p style={{ fontSize: 11.5, color: '#e05aaa', margin: 0 }}>Le téléchargement n&apos;a pas pu démarrer. Réessaie dans quelques secondes.</p>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {event && (
                <Link
                  href={`/order/${event.id}/${ticket.ticketCode}`}
                  style={{ ...actionBtnStyle(false), background: 'var(--teal-solid)', color: '#04120e', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                >
                  Commander sur place
                </Link>
              )}
              <ActionBtn onClick={handleShare}>Partager</ActionBtn>
              <button onClick={handleShareStory} disabled={storyState === 'busy'} title="Une belle image 9:16 pour Instagram — sans le QR code" style={actionBtnStyle(false, 'rgba(224,90,170,0.14)', '#e05aaa')}>
                {storyState === 'busy' ? 'Création…' : 'Partager en story'}
              </button>
              <ActionBtn onClick={handleCalendar}>Calendrier</ActionBtn>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ fontSize: 9.5, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 3px' }}>{label}</p>
      <p style={{ fontSize: 12.5, color: '#fff', fontWeight: 700, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</p>
    </div>
  )
}

function actionBtnStyle(disabled: boolean, bg = 'rgba(255,255,255,0.06)', color = 'var(--text)'): React.CSSProperties {
  return {
    padding: '8px 12px',
    borderRadius: 9,
    background: bg,
    color,
    border: 'none',
    fontSize: 12,
    fontWeight: 700,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  }
}

function ActionBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={actionBtnStyle(Boolean(disabled))}>
      {children}
    </button>
  )
}
