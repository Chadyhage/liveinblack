'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { CalendarPlus, Download, ExternalLink, Gift, HandCoins, ListChecks, QrCode, Share2, Sparkles, Ticket, X } from 'lucide-react'
import { QRCodeCanvas } from 'qrcode.react'
import { fmtMoney } from '@/lib/shared/money'
import { downloadTicketPNG, shareOrCopy, shareStory, downloadICS, countdownLabel } from '@/lib/shared/ticketExtras'
import { ArrowLeft } from 'lucide-react'
import { ActionLink, Button, Card, ConfirmDialog, Input, Mascot, Modal, Pagination, Skeleton, pagedSlice } from '@/app/components/ui'
import { useQueryParamState } from '@/lib/client/useQueryParamState'
import {
  bucketTicketGroups,
  classifyTicketGroup,
  countUpcomingSeats,
  hoursRemainingLabel,
  readDismissedTicketBanners,
  toMajor,
  visibleGroupTickets,
  type GroupBucket,
} from './ticketWalletUtils'

const GROUP_PAGE_SIZE = 12

// Port du panneau "Mes billets" de ProfilePage.jsx (#6 phase profil) — copies
// mirroir des DTO JSON de lib/server/tickets.ts (même convention que
// MessagesClient.tsx : pas d'import direct de lib/server/* côté client).

export interface TicketWalletItemView {
  ticketCode: string
  // Jeton SIGNÉ (lib/server/ticketToken.ts) — c'est celui-ci qu'il faut mettre
  // dans le lien/QR vers /ticket/[token], jamais ticketCode brut (que
  // /ticket/[token] rejette avec "Billet invalide").
  ticketToken: string
  place: string
  placePrice: number
  totalPrice: number
  currency: string
  preorders: { name: string; price: number; qty: number; showOptionId: string | null; showLabel: string | null; showInfo: string | null }[]
  guestName: string | null
  bookedAt: string | null
  checkedInAt: string | null
  isMine: boolean
  isHostSeat: boolean
  tableId: string | null
  seatIndex: number | null
  assignedTo: string | null
  assignedName: string | null
  orderId: string | null
  refundRequested: boolean
  cancellationProtectionPurchased: boolean
  resellable: boolean
  activeListing: { id: string; resalePriceMinor: number; feeMinor: number; sellerNetMinor: number; status: string } | null
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
  postponed: boolean
  refundWindowClosesAt: string | null
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

const REFUND_ERROR_LABELS: Record<string, string> = {
  refund_window_closed: 'La fenêtre pour demander un remboursement est passée — ton billet reste valable pour la nouvelle date.',
  ticket_already_checked_in: 'Au moins une place de cette réservation a déjà été scannée à l’entrée, le remboursement n’est plus possible.',
  already_requested: 'Une demande de remboursement a déjà été envoyée pour ce billet.',
  not_eligible: 'Ce billet n’est pas éligible au remboursement.',
  free_ticket_not_refundable: 'Ce billet est gratuit, il n’y a rien à rembourser.',
}

const RESELL_ERROR_LABELS: Record<string, string> = {
  price_above_original: 'Le prix de revente ne peut pas dépasser le prix initial du billet.',
  invalid_price: 'Indique un prix valide.',
  resale_window_closed: 'La revente est fermée pour cet événement (moins de 2h avant les portes).',
  resale_limit_reached: 'Ce billet a déjà changé de propriétaire le nombre maximum de fois autorisé.',
  event_ended: 'Cet événement est déjà terminé.',
  event_cancelled: 'Cet événement est annulé.',
  ticket_already_checked_in: 'Ce billet a déjà été scanné à l’entrée.',
  already_listed: 'Ce billet est déjà en vente.',
  not_resellable_source: 'Ce billet n’est pas revendable.',
  group_not_fully_held_by_host: 'Impossible de revendre : au moins une place de ce groupe a déjà été attribuée à quelqu’un d’autre.',
}

function readDismissed(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  return readDismissedTicketBanners(localStorage.getItem(DISMISSED_KEY))
}


export default function TicketWalletPanel({ groups, currentUserId }: { groups: TicketWalletGroupView[]; currentUserId: string }) {
  const buckets = useMemo(() => bucketTicketGroups(groups), [groups])

  const upcomingSeatCount = countUpcomingSeats(buckets.upcoming)

  return (
    <main className="lb-dashboard-page">
      <style>{`
        @media (max-width: 480px) {
          .ticket-wallet-face { grid-template-columns: 1fr !important; }
          .ticket-wallet-qr { width: 100% !important; border-left: 0 !important; border-top: 1px dashed rgba(255,255,255,0.15); }
          .ticket-wallet-meta { grid-template-columns: repeat(auto-fit, minmax(88px, 1fr)) !important; }
          .ticket-wallet-rail { min-height: 104px !important; }
          .ticket-wallet-summary { grid-template-columns: 1fr !important; }
          .ticket-wallet-summary-action { justify-content: flex-start !important; }
          .ticket-wallet-summary-action a { min-height: 32px !important; padding: 6px 10px !important; font-size: 11px !important; }
        }
      `}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Link href="/profile" style={{ minHeight: 36, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: 'var(--text-muted)', textDecoration: 'none' }}>
            <ArrowLeft size={16} aria-hidden="true" />
            Profil
          </Link>
          <ActionLink href="/events">Trouver une soirée</ActionLink>
        </div>

        <header style={{ marginBottom: 6 }}>
          <h1 style={{ margin: 0, color: '#f5f5f7', fontSize: 'clamp(26px,3.2vw,34px)', fontWeight: 720, letterSpacing: '-.045em' }}>Mes billets</h1>
          <p style={{ maxWidth: 720, margin: '5px 0 0', color: 'rgba(245,245,247,.62)', fontSize: 12, lineHeight: 1.38 }}>Tous tes accès, QR codes et places à venir dans un seul portefeuille.</p>
        </header>

        <SeatHoldsPanel />

        {groups.length === 0 ? (
          <EmptyWallet />
        ) : (
          <>
            <Card className="ticket-wallet-summary" style={{ maxWidth: 760, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'center', gap: 10, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <TicketGlyph />
                <div>
                  <p style={{ fontWeight: 800, fontSize: 15, color: '#fff', margin: 0 }}>
                    {upcomingSeatCount > 0 ? `${upcomingSeatCount} place${upcomingSeatCount > 1 ? 's' : ''} à venir` : 'Aucune place à venir'}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                    {buckets.upcoming.length > 0
                      ? `Sur ${buckets.upcoming.length} événement${buckets.upcoming.length > 1 ? 's' : ''} — QR codes prêts à scanner`
                      : 'Trouve ta prochaine soirée dans les événements'}
                  </p>
                </div>
                </div>
              <div className="ticket-wallet-summary-action" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <Link
                href="/events"
                style={{
                  minHeight: 34,
                  display: 'inline-flex',
                  alignItems: 'center',
                  alignSelf: 'flex-start',
                  padding: '7px 12px',
                  borderRadius: 999,
                  background: 'var(--teal-solid)',
                  color: '#04120e',
                  fontWeight: 700,
                  fontSize: 12,
                  textDecoration: 'none',
                  gap: 6,
                }}
              >
                <Sparkles size={13} aria-hidden="true" />
                Trouver une soirée
              </Link>
              </div>
            </Card>

            {buckets.upcoming.length > 0 && <Section label={`À venir (${buckets.upcoming.length})`} groups={buckets.upcoming} currentUserId={currentUserId} paramName="page" />}
            {buckets.past.length > 0 && <Section label={`Événements passés (${buckets.past.length})`} groups={buckets.past} currentUserId={currentUserId} paramName="pastPage" />}
            {buckets.cancelled.length > 0 && <Section label={`Annulés (${buckets.cancelled.length})`} groups={buckets.cancelled} currentUserId={currentUserId} paramName="cancelledPage" />}
          </>
        )}
      </div>
    </main>
  )
}

interface SeatHoldItem {
  id: string
  eventId: string
  placeType: string
  currency: string
  depositMinor: number
  balanceDueMinor: number
  status: string
  expiresAt: string | null
}

// Blocages de place actifs (acompte payé, solde en attente) — auto-fetch
// (GET /api/seat-holds, indépendant des `groups` déjà chargés serveur pour
// cette page) ; rien n'est affiché si l'appelant n'a aucun blocage en cours.
// Voir lib/server/seatHolds.ts pour tout le cycle de vie.
function SeatHoldsPanel() {
  const [holds, setHolds] = useState<SeatHoldItem[] | null>(null)
  const [payingId, setPayingId] = useState<string | null>(null)
  const [payErr, setPayErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function run() {
      const res = await fetch('/api/seat-holds')
      const data = await res.json().catch(() => null)
      if (!cancelled && res.ok && data?.ok) setHolds(data.holds)
    }
    run()
    return () => {
      cancelled = true
    }
  }, [])

  async function payBalance(hold: SeatHoldItem) {
    setPayingId(hold.id)
    setPayErr(null)
    const endpoint = hold.currency === 'XOF' ? '/api/checkout/seat-hold/fedapay' : '/api/checkout/seat-hold'
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seatHoldId: hold.id }) })
      const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null
      if (!res.ok || !data?.url) {
        setPayErr(data?.error || 'Impossible de lancer le paiement.')
        setPayingId(null)
        return
      }
      window.location.assign(data.url)
    } catch {
      setPayErr('Impossible de lancer le paiement.')
      setPayingId(null)
    }
  }

  const active = (holds || []).filter((h) => h.status === 'active')
  if (active.length === 0) return null

  return (
    <Card accent="rgba(184, 243, 74,.35)" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ margin: 0, color: 'var(--gold)', fontSize: 14, fontWeight: 400, textTransform: 'uppercase', letterSpacing: '3.2px', fontFamily: 'var(--font-display), sans-serif' }}>Places bloquées</p>
      {active.map((hold) => (
        <div key={hold.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 13.5, color: '#fff' }}>{hold.placeType}</p>
            <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--text-faint)' }}>
              Solde {fmtMoney(toMajor(hold.balanceDueMinor, hold.currency), hold.currency)} · {hold.expiresAt ? hoursRemainingLabel(hold.expiresAt) : ''}
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => payBalance(hold)}
            disabled={payingId === hold.id}
            loading={payingId === hold.id}
            loadingText="Redirection…"
            style={{ borderRadius: 999 }}
          >
            Payer le solde
          </Button>
        </div>
      ))}
      {payErr && <p style={{ margin: 0, color: 'var(--pink)', fontSize: 11.5 }}>{payErr}</p>}
    </Card>
  )
}

function Section({
  label,
  groups,
  currentUserId,
  paramName,
}: {
  label: string
  groups: TicketWalletGroupView[]
  currentUserId: string
  paramName: string
}) {
  const [pageParam, setPageParam] = useQueryParamState<string>(paramName, '1')
  const page = Number(pageParam)
  const setPage = (n: number) => setPageParam(String(n))
  const { pageItems, pageCount } = pagedSlice(groups, page, GROUP_PAGE_SIZE)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontSize: 14, fontWeight: 400, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '3.2px', fontFamily: 'var(--font-display), sans-serif', margin: '4px 0 0' }}>{label}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))', gap: 12, alignItems: 'start' }}>
        {pageItems.map((g) => (
          <EventTicketGroupCard key={g.eventId} group={g} currentUserId={currentUserId} bucket={classifyTicketGroup(g)} />
        ))}
      </div>
      <Pagination page={page} pageCount={pageCount} onPageChange={setPage} totalItems={groups.length} pageSize={GROUP_PAGE_SIZE} />
    </div>
  )
}

function TicketGlyph() {
  return (
    <div
      style={{
        width: 38,
        height: 38,
        borderRadius: 12,
        background: 'rgba(184, 243, 74,0.12)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <Ticket size={22} color="var(--gold)" strokeWidth={1.8} aria-hidden="true" />
    </div>
  )
}

function EmptyWallet() {
  return (
    <Card style={{ padding: '48px 24px', textAlign: 'center' }}>
      <Mascot mood="sleeping" size={148} />
      <p style={{ fontWeight: 700, fontSize: 17, color: '#fff', margin: '0 0 6px' }}>Aucun billet pour l&apos;instant</p>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px' }}>Tes billets achetés apparaîtront ici, avec leur QR code.</p>
      <Link
        href="/events"
        style={{ display: 'inline-block', padding: '11px 22px', borderRadius: 10, background: 'var(--teal-solid)', color: '#04120e', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}
      >
        Découvrir les événements
      </Link>
    </Card>
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
  const visibleTickets = visibleGroupTickets(group, currentUserId)

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
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <Link
        href={event ? `/events/${event.id}` : '#'}
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, textDecoration: 'none', color: 'inherit' }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 10,
            background: event?.imageUrl ? `url(${event.imageUrl}) center/cover` : 'rgba(184, 243, 74,0.12)',
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
          <Pill color="var(--teal)" bg="rgba(184, 243, 74,0.10)">
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
              style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--pink)', color: '#fff', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}
            >
              Contacter le support
            </a>
            <Button
              variant="secondary"
              size="sm"
              aria-label="Fermer cette bannière"
              onClick={dismissBanner}
              style={{ borderRadius: 8 }}
            >
              <X size={14} />
            </Button>
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
            <Button variant="link" onClick={() => setExpanded((v) => !v)} style={{ fontSize: 12.5 }}>
              {expanded ? 'Masquer mes places' : 'Voir mes places'}
            </Button>
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
    </Card>
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
  const [confirmAction, setConfirmAction] = useState<{ title: string; body: string; confirmLabel: string; onConfirm: () => void } | null>(null)

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
            background: toast.kind === 'ok' ? 'var(--teal-solid)' : 'var(--pink)',
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
        <p style={{ fontSize: 14, fontWeight: 400, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '3.2px', fontFamily: 'var(--font-display), sans-serif', margin: 0 }}>Ma table · {hostedSeats.length} places</p>
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
                    {seat.assignedTo && (
                      <span style={{ marginLeft: 6, color: seat.checkedInAt ? 'var(--pink)' : 'var(--text-faint)' }}>
                        · {seat.checkedInAt ? 'Entré' : 'Pas encore entré'}
                      </span>
                    )}
                  </p>
                </div>
                {seat.assignedTo ? (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() =>
                      setConfirmAction({
                        title: 'Reprendre cette place',
                        body: `Cette place ne sera plus attribuée à ${seat.assignedName || 'cet invité'}.`,
                        confirmLabel: 'Reprendre',
                        onConfirm: () => { void revoke(seat.ticketCode) },
                      })
                    }
                    disabled={busyCode === seat.ticketCode}
                    style={smallBtnStyle('rgba(224,90,170,0.14)', '#e05aaa')}
                  >
                    Reprendre
                  </Button>
                ) : pendingEmail ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setConfirmAction({
                        title: 'Annuler cette invitation',
                        body: `L'invitation envoyée à ${pendingEmail} sera annulée.`,
                        confirmLabel: 'Annuler l’invitation',
                        onConfirm: () => { void cancelInvite(seat.ticketCode) },
                      })
                    }
                    disabled={busyCode === seat.ticketCode}
                    style={smallBtnStyle('rgba(255,255,255,0.06)', 'var(--text-muted)')}
                  >
                    Annuler
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setOpenInviteFor(openInviteFor === seat.ticketCode ? null : seat.ticketCode)
                      setEmailDraft('')
                    }}
                    style={smallBtnStyle('rgba(139,92,246,0.16)', 'var(--violet)')}
                  >
                    Inviter
                  </Button>
                )}
              </div>
              {openInviteFor === seat.ticketCode && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <Input
                    type="email"
                    value={emailDraft}
                    onChange={(e) => setEmailDraft(e.target.value)}
                    placeholder="Adresse e-mail de ton invité·e"
                    size="sm"
                    style={{ flex: 1, borderRadius: 8, fontSize: 12.5 }}
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => sendInvite(seat.ticketCode)}
                    disabled={busyCode === seat.ticketCode || !emailDraft.trim()}
                    style={smallBtnStyle('var(--teal-solid)', '#04120e')}
                  >
                    Donner
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.title || 'Confirmation'}
        body={confirmAction?.body || ''}
        confirmLabel={confirmAction?.confirmLabel || 'Confirmer'}
        confirmDisabled={Boolean(busyCode)}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          const run = confirmAction?.onConfirm
          setConfirmAction(null)
          run?.()
        }}
      />
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
  const [showIncluded, setShowIncluded] = useState(false)
  const [included, setIncluded] = useState<IncludedItem[] | null>(null)
  const [downloadState, setDownloadState] = useState<'idle' | 'busy' | 'ok' | 'err'>('idle')
  const [storyState, setStoryState] = useState<'idle' | 'busy' | 'ok' | 'err'>('idle')
  const [flashMsg, setFlashMsg] = useState<string | null>(null)
  const [refundState, setRefundState] = useState<'idle' | 'busy' | 'done' | 'err'>(ticket.refundRequested ? 'done' : 'idle')
  const [refundErr, setRefundErr] = useState<string | null>(null)
  const [refundConfirmOpen, setRefundConfirmOpen] = useState(false)
  const [withdrawConfirmOpen, setWithdrawConfirmOpen] = useState(false)
  const [resellOpen, setResellOpen] = useState(false)
  const [resellPrice, setResellPrice] = useState('')
  const [resellState, setResellState] = useState<'idle' | 'busy' | 'err'>('idle')
  const [resellErr, setResellErr] = useState<string | null>(null)
  const [withdrawState, setWithdrawState] = useState<'idle' | 'busy' | 'err'>('idle')
  const [activeListing, setActiveListing] = useState(ticket.activeListing)
  const qrExportRef = useRef<HTMLCanvasElement>(null)

  const ticketUrl = `${SITE}/ticket/${ticket.ticketToken}`
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

  async function handleResell() {
    const majorAmount = Number(resellPrice.replace(',', '.'))
    if (!majorAmount || majorAmount <= 0) {
      setResellState('err')
      setResellErr('Indique un prix valide.')
      return
    }
    setResellState('busy')
    setResellErr(null)
    try {
      const res = await fetch('/api/tickets/resell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketCode: ticket.ticketCode, resalePrice: majorAmount }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.ok) {
        setActiveListing({ id: data.listingId, resalePriceMinor: Math.round(majorAmount * (ticket.currency === 'XOF' ? 1 : 100)), feeMinor: data.feeMinor, sellerNetMinor: data.sellerNetMinor, status: 'active' })
        setResellOpen(false)
        setResellState('idle')
        flash('Billet mis en vente')
      } else {
        setResellState('err')
        setResellErr(RESELL_ERROR_LABELS[data?.error as string] || 'Mise en vente impossible pour le moment.')
      }
    } catch {
      setResellState('err')
      setResellErr('Mise en vente impossible pour le moment.')
    }
  }

  async function handleWithdrawResell() {
    if (!activeListing || withdrawState === 'busy') return
    setWithdrawState('busy')
    try {
      const res = await fetch(`/api/resale-listings/${activeListing.id}`, { method: 'DELETE' })
      if (res.ok) {
        setActiveListing(null)
        setWithdrawState('idle')
        flash('Mise en vente retirée — nouveau billet généré')
      } else {
        setWithdrawState('err')
      }
    } catch {
      setWithdrawState('err')
    }
  }

  async function handleRefundRequest() {
    if (!ticket.orderId || refundState === 'busy') return
    setRefundState('busy')
    setRefundErr(null)
    try {
      const res = await fetch(`/api/orders/${ticket.orderId}/refund-request`, { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.ok) {
        setRefundState('done')
        flash('Demande de remboursement envoyée')
      } else {
        setRefundState('err')
        setRefundErr(REFUND_ERROR_LABELS[data?.error as string] || 'Impossible de traiter la demande pour le moment.')
      }
    } catch {
      setRefundState('err')
      setRefundErr('Impossible de traiter la demande pour le moment.')
    }
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
    <div style={{ borderRadius: 18, background: 'linear-gradient(145deg,rgba(28,30,39,.96),rgba(9,10,16,.98))', border: '1px solid rgba(255,255,255,.12)', overflow: 'hidden', position: 'relative', boxShadow: '0 18px 45px rgba(0,0,0,.28)' }}>
      {flashMsg && (
        <div
          style={{ position: 'absolute', top: 8, right: 8, padding: '5px 12px', borderRadius: 999, background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: 11, zIndex: 5 }}
        >
          {flashMsg}
        </div>
      )}
      <div className="ticket-wallet-face" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 138px' }}>
        <div style={{ minWidth: 0 }}>
          <div className="ticket-wallet-rail" style={{ minHeight: 132, padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: event?.imageUrl ? `linear-gradient(90deg,rgba(8,9,14,.92),rgba(8,9,14,.58)), url(${event.imageUrl}) center/cover` : `linear-gradient(135deg,${event?.color || 'rgba(184,243,74,.18)'},rgba(13,14,21,.96))` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 10.5, fontWeight: 800, color: event?.color || 'var(--gold)', textTransform: 'uppercase', letterSpacing: 0, margin: '0 0 7px' }}>
                  Live in Black · Billet officiel
                </p>
                <p style={{ fontWeight: 850, fontSize: 18, color: '#fff', lineHeight: 1.12, margin: 0, maxWidth: 270 }}>{event?.name ?? 'Événement'}</p>
              </div>
              <Pill color={inactive ? 'var(--text-faint)' : '#04120e'} bg={inactive ? 'rgba(255,255,255,0.08)' : 'var(--teal-solid)'}>
                {inactive ? inactiveLabel : countdown || 'Valide'}
              </Pill>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {(event?.minAge ?? 0) >= 18 && (
                <span title="Pièce d'identité pouvant être demandée à l'entrée">
                  <Pill color="var(--gold)" bg="rgba(184, 243, 74,0.14)">18+</Pill>
                </span>
              )}
              <Pill color="#fff" bg="rgba(0,0,0,.34)">{ticket.place}</Pill>
              <Pill color="var(--text-muted)" bg="rgba(0,0,0,.28)">#{String((ticket.seatIndex ?? 0) + 1).padStart(2, '0')}</Pill>
            </div>
          </div>
          <div className="ticket-wallet-meta" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: 'rgba(255,255,255,.06)' }}>
            <MetaCell label="Date" value={event?.dateDisplay || event?.date || ''} />
            <MetaCell label="Ville" value={event?.city || '-'} />
            <MetaCell label="Réf." value={ticket.ticketCode} />
          </div>
        </div>

        <div
          className="ticket-wallet-qr"
          style={{
            width: 140,
            flexShrink: 0,
            borderLeft: '1px dashed rgba(255,255,255,0.18)',
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
              <div role="img" aria-label="Code QR du billet, à scanner à l'entrée" style={{ background: '#fff', padding: 8, borderRadius: 8 }}>
                <QRCodeCanvas value={ticketUrl} size={84} level="H" />
              </div>
              <p style={{ fontSize: 10, color: 'var(--text-faint)', letterSpacing: '0.04em', margin: 0 }}>{ticket.ticketCode}</p>
              <p style={{ fontSize: 9, color: 'var(--text-faint)', textAlign: 'center', margin: 0 }}>Usage unique</p>
            </>
          )}
        </div>
      </div>

      {/* Canvas caché, plus grand, pour l'export PNG (identique au legacy). */}
      {!inactive && (
        <div aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
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
                {item.showLabel && <small style={{ display: 'block', color: 'var(--teal)', marginTop: 2 }}>Show : {item.showLabel}{item.showInfo ? ` · ${item.showInfo}` : ''}</small>}
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

      {showIncluded && (
        <div style={{ padding: '0 16px 16px' }}>
          {included === null ? (
            <Skeleton width="72%" height={13} />
          ) : included.length === 0 ? (
            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--surface)' }}>
              <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0 }}>Aucune option incluse.</p>
            </div>
          ) : (
            <>
              {included.map((it) => (
                <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {it.name} ×{it.quantity}
                  </span>
                  <span style={{ color: it.status === 'served' ? 'var(--teal)' : 'var(--gold)', fontWeight: 700, fontSize: 11 }}>{it.status === 'served' ? 'Servi' : 'À récupérer'}</span>
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
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDownload}
                disabled={downloadState === 'busy'}
                loading={downloadState === 'busy'}
                loadingText="Préparation…"
                icon={downloadState === 'ok' ? <QrCode size={15} aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}
                style={actionBtnStyle(false)}
              >
                {downloadState === 'ok' ? 'Prêt' : 'PDF'}
              </Button>
              <ActionBtn onClick={toggleIncluded} icon={<ListChecks size={15} aria-hidden="true" />}>{showIncluded ? 'Options' : 'Options'}</ActionBtn>
              {event && (
                <Link
                  href={`/order/${event.id}/${ticket.ticketCode}`}
                  style={{ ...actionBtnStyle(false), background: 'var(--teal-solid)', color: '#04120e', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  title="Commander sur place"
                >
                  <ExternalLink size={15} aria-hidden="true" />
                  Commander
                </Link>
              )}
              <ActionBtn onClick={handleShare} icon={<Share2 size={15} aria-hidden="true" />}>Partager</ActionBtn>
              <Button
                variant="danger"
                size="sm"
                onClick={handleShareStory}
                disabled={storyState === 'busy'}
                loading={storyState === 'busy'}
                loadingText="Création…"
                title="Une belle image 9:16 pour Instagram — sans le QR code"
                icon={<Sparkles size={15} aria-hidden="true" />}
                style={actionBtnStyle(false, 'rgba(224,90,170,0.14)', '#e05aaa')}
              >
                Story
              </Button>
              <ActionBtn onClick={handleCalendar} icon={<CalendarPlus size={15} aria-hidden="true" />}>Agenda</ActionBtn>
              {(event?.postponed || ticket.cancellationProtectionPurchased) && ticket.orderId && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setRefundConfirmOpen(true)}
                  disabled={refundState === 'busy' || refundState === 'done'}
                  loading={refundState === 'busy'}
                  loadingText="Envoi…"
                  icon={<HandCoins size={15} aria-hidden="true" />}
                  style={actionBtnStyle(refundState === 'busy' || refundState === 'done', 'rgba(224,90,170,0.14)', '#e05aaa')}
                >
                  {refundState === 'done' ? 'Demandé' : 'Rembourser'}
                </Button>
              )}
              {ticket.resellable && !activeListing && (
                <Button variant="secondary" size="sm" onClick={() => setResellOpen((v) => !v)} icon={<Gift size={15} aria-hidden="true" />} style={actionBtnStyle(false, 'rgba(139,92,246,0.14)', 'var(--violet)')}>
                  Revendre
                </Button>
              )}
              {activeListing && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setWithdrawConfirmOpen(true)}
                  disabled={withdrawState === 'busy'}
                  loading={withdrawState === 'busy'}
                  loadingText="Retrait…"
                  icon={<Gift size={15} aria-hidden="true" />}
                  style={actionBtnStyle(withdrawState === 'busy', 'rgba(255,255,255,0.06)', 'var(--text-muted)')}
                >
                  {`${fmtMoney(toMajor(activeListing.resalePriceMinor, ticket.currency), ticket.currency)} · Retirer`}
                </Button>
              )}
            </div>
            {downloadState === 'err' && (
              <p style={{ fontSize: 11.5, color: '#e05aaa', margin: 0 }}>Le téléchargement n&apos;a pas pu démarrer. Réessaie dans quelques secondes.</p>
            )}
            {refundState === 'err' && refundErr && <p style={{ fontSize: 11.5, color: '#e05aaa', margin: 0 }}>{refundErr}</p>}

            {withdrawConfirmOpen && (
              <Modal
                onClose={() => setWithdrawConfirmOpen(false)}
                title="Retirer la mise en vente"
                subtitle="Le billet sera retiré du marché de revente."
                ariaLabel="Confirmer le retrait de la mise en vente"
                actions={
                  <>
                    <Button variant="secondary" onClick={() => setWithdrawConfirmOpen(false)} disabled={withdrawState === 'busy'}>Annuler</Button>
                    <Button
                      variant="danger"
                      onClick={() => { setWithdrawConfirmOpen(false); void handleWithdrawResell() }}
                      disabled={withdrawState === 'busy'}
                      loading={withdrawState === 'busy'}
                      loadingText="Retrait…"
                    >
                      Confirmer le retrait
                    </Button>
                  </>
                }
              >
                <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.6, fontSize: 14 }}>
                  Ce billet ne sera plus visible à la revente et un nouveau billet actif sera généré pour toi.
                </p>
              </Modal>
            )}

            {refundConfirmOpen && (
              <Modal
                onClose={() => setRefundConfirmOpen(false)}
                title="Confirmer la demande"
                subtitle="Cette demande est irréversible une fois le remboursement lancé."
                ariaLabel="Confirmer la demande de remboursement"
                actions={
                  <>
                    <Button variant="secondary" onClick={() => setRefundConfirmOpen(false)} disabled={refundState === 'busy'}>Annuler</Button>
                    <Button
                      variant="danger"
                      onClick={() => { setRefundConfirmOpen(false); void handleRefundRequest() }}
                      disabled={refundState === 'busy'}
                      loading={refundState === 'busy'}
                      loadingText="Envoi…"
                    >
                      Confirmer le remboursement
                    </Button>
                  </>
                }
              >
                <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.6, fontSize: 14 }}>
                  Tu demandes le remboursement de ce billet. Les frais de service ne sont pas remboursés et le billet sera désactivé si la demande est acceptée.
                </p>
              </Modal>
            )}

            {resellOpen && !activeListing && (
              <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p id={`resell-help-${ticket.ticketCode}`} style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: 0, lineHeight: 1.55 }}>
                  Prix maximum : {fmtMoney(ticket.placePrice, ticket.currency)} (prix initial, majoration interdite). Le montant de revente n&apos;est jamais garanti tant que personne n&apos;a acheté ; les frais payés à l&apos;achat initial ne sont pas récupérés.
                </p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Input
                    aria-label="Prix de revente du billet"
                    aria-describedby={`resell-help-${ticket.ticketCode}`}
                    type="number"
                    inputMode="decimal"
                    placeholder={`Prix (max ${ticket.placePrice})`}
                    value={resellPrice}
                    onChange={(e) => setResellPrice(e.target.value)}
                    style={{ flex: 1, borderRadius: 12, background: 'var(--obsidian)', fontSize: 16 }}
                  />
                  <Button
                    variant="primary"
                    onClick={handleResell}
                    disabled={resellState === 'busy'}
                    loading={resellState === 'busy'}
                    loadingText="Publication…"
                    style={{ ...actionBtnStyle(resellState === 'busy'), background: 'var(--violet)', color: '#fff' }}
                  >
                    Confirmer
                  </Button>
                </div>
                {resellState === 'err' && resellErr && <p role="alert" style={{ fontSize: 13.5, color: '#ff8fc7', margin: 0 }}>{resellErr}</p>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0, padding: '11px 12px', background: 'rgba(10,11,17,.74)' }}>
      <p style={{ fontSize: 10.5, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0, margin: '0 0 4px' }}>{label}</p>
      <p style={{ fontSize: 13, color: '#fff', fontWeight: 750, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</p>
    </div>
  )
}

function actionBtnStyle(disabled: boolean, bg = 'rgba(255,255,255,0.06)', color = 'var(--text)'): React.CSSProperties {
  return {
    minHeight: 36,
    padding: '7px 11px',
    borderRadius: 999,
    background: bg,
    color,
    border: '1px solid rgba(255,255,255,.10)',
    fontSize: 12,
    fontWeight: 700,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  }
}

function ActionBtn({ children, onClick, disabled, icon }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; icon?: React.ReactNode }) {
  return (
    <Button variant="secondary" size="sm" onClick={onClick} disabled={disabled} icon={icon} style={actionBtnStyle(Boolean(disabled))}>
      {children}
    </Button>
  )
}
