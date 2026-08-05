import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import mongoose from 'mongoose'
import { auth } from '@/auth'
import { getDb } from '@/lib/db/mongoose'
import Event from '@/lib/models/Event'
import Ticket from '@/lib/models/Ticket'
import { isEventEnded, eventStartMs } from '@/lib/shared/event-time'
import { listOrdersForTicket } from '@/lib/server/eventOrders'
import CommanderClient, { type MenuItemView, type OrderItem } from './CommanderClient'

// Port de src/pages/OnSiteOrderPage.jsx. Server Component : charge
// événement + billet + commandes déjà existantes, applique les gates
// d'accès (introuvable / terminé-annulé / pas encore ouvert / billet non
// possédé) AVANT de rendre quoi que ce soit — contrairement au legacy, qui ne
// vérifiait la propriété du billet que côté client dans un useEffect (jamais
// une vraie frontière de sécurité). Ici, un non-propriétaire ne reçoit JAMAIS
// les données événement/prix/menu dans le payload de page, pas même
// brièvement.
// Titre dynamique (nom de l'événement) pour distinguer plusieurs onglets
// commande ouverts sur des événements différents — même pattern que
// app/(public)/events/[id]/page.tsx.
export async function generateMetadata({ params }: { params: Promise<{ eventId: string; ticketCode: string }> }): Promise<Metadata> {
  const { eventId } = await params
  await getDb()
  const event = mongoose.isValidObjectId(eventId) ? await Event.findById(eventId).select('name').lean() : null
  return {
    title: event ? `Commander — ${event.name} — LIVEINBLACK` : 'Commander — LIVEINBLACK',
    robots: { index: false, follow: false },
  }
}

// Les commandes sur place n'ouvrent que 3h avant le début de l'événement.
const ORDER_WINDOW_MS = 3 * 60 * 60 * 1000

interface MenuItemDoc {
  name: string
  emoji?: string
  imageUrl?: string | null
  price?: number
  category?: string
  description?: string
  available?: boolean
}

// `now` en paramètre par défaut (plutôt qu'un `Date.now()` littéral dans le
// corps du composant) — même convention que isEventEnded/isEventStarted
// (lib/shared/event-time.ts), qui satisfait au passage la règle ESLint
// react-hooks/purity (un composant ne doit pas appeler une fonction impure
// directement dans son corps).
function isOrderingWindowClosed(event: Parameters<typeof eventStartMs>[0], now: number = Date.now()): boolean {
  return now < eventStartMs(event) - ORDER_WINDOW_MS
}

function GateScreen({
  title,
  message,
  backHref,
  backLabel = 'Retour',
  variant = 'error',
}: {
  title: string
  message: string
  backHref: string
  backLabel?: string
  // 'notice' : pas une erreur, juste "pas encore" (ex. fenêtre de commande pas
  // encore ouverte) — icône horloge + teinte gold, jamais la même que les
  // vrais cas d'erreur (billet introuvable/révoqué, événement terminé...) qui
  // gardent le rose + point d'exclamation.
  variant?: 'error' | 'notice'
}) {
  const accent = variant === 'notice' ? 'var(--gold)' : 'var(--pink)'
  const accentBg = variant === 'notice' ? 'rgba(200,169,110,0.08)' : 'rgba(224,90,170,0.08)'
  const accentBorder = variant === 'notice' ? 'rgba(200,169,110,0.35)' : 'rgba(224,90,170,0.35)'
  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            margin: '0 auto 22px',
            background: accentBg,
            border: `2px solid ${accentBorder}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {variant === 'notice' ? (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75V12l3.75 2.25M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          )}
        </div>
        <p style={{ fontWeight: 800, fontSize: 22, color: accent, margin: '0 0 10px' }}>{title}</p>
        <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: '0 0 24px', lineHeight: 1.6 }}>{message}</p>
        <Link href={backHref} style={{ fontSize: 13, fontWeight: 700, color: 'var(--teal)', textDecoration: 'none' }}>
          ← {backLabel}
        </Link>
      </div>
    </main>
  )
}

export default async function CommanderPage({
  params,
}: {
  params: Promise<{ eventId: string; ticketCode: string }>
}) {
  const { eventId, ticketCode } = await params

  const session = await auth()
  if (!session?.user) {
    // Le layout (app) redirige déjà tout visiteur non connecté — on ne
    // suppose jamais que `session` est non-nulle sans un garde local propre.
    redirect('/login')
  }

  await getDb()
  const normalizedTicketCode = ticketCode.trim().toUpperCase()
  // `eventId` est un segment d'URL arbitraire — Event.findById() sur une
  // valeur qui n'a pas la forme d'un ObjectId lève un CastError Mongoose non
  // rattrapé (pas de error.tsx/global-error.tsx dans app/), ce qui ferait
  // planquer le rendu du Server Component au lieu d'atteindre la Gate 2
  // "Événement introuvable" prévue juste en dessous. `isValidObjectId` teste
  // exactement la condition qui décide si le cast lèvera ou non — un
  // eventId mal formé est donc traité comme "introuvable", pas comme un crash.
  const [event, ticket] = await Promise.all([
    mongoose.isValidObjectId(eventId) ? Event.findById(eventId).lean() : Promise.resolve(null),
    Ticket.findOne({ ticketCode: normalizedTicketCode }).lean(),
  ])

  // Gate 2 — événement introuvable.
  if (!event) {
    return <GateScreen title="Événement introuvable" message="Ce lien de commande n'est plus valide." backHref="/events" backLabel="Voir les événements" />
  }

  // Gate 3 — événement terminé ou annulé.
  if (isEventEnded(event)) {
    return (
      <GateScreen
        title="Commande indisponible"
        message="Cet événement est terminé ou annulé — les commandes sur place sont closes."
        backHref={`/events/${eventId}`}
        backLabel="Voir l'événement"
      />
    )
  }

  // Gate 4 — propriété du billet, vérifiée ICI côté serveur avec une lecture
  // base fraîche (jamais seulement côté client comme le faisait le legacy).
  // Un billet révoqué (siège réattribué, remboursement...) est traité comme
  // non reconnu, à l'identique de getTicketDisplay (lib/server/tickets.ts).
  // Volontairement AVANT la Gate 5 (fenêtre de commande) : un code billet
  // erroné/mal tapé doit toujours révéler "Billet non reconnu", jamais un
  // trompeur "Pas encore ouvert" qui laisserait croire qu'il suffit d'attendre.
  if (!ticket || ticket.eventId !== eventId || ticket.revoked || String(ticket.userId) !== session.user.id) {
    return (
      <GateScreen
        title="Billet non reconnu"
        message="Ce billet n'est pas rattaché à ton compte. Ouvre-le depuis Mes billets pour commander."
        backHref="/profile"
        backLabel="Retour au profil"
      />
    )
  }

  // Gate 5 — commandes pas encore ouvertes (fenêtre : 3h avant le début). Pas
  // une vraie erreur (juste "trop tôt") : variant 'notice' (gold + horloge),
  // jamais le rose/exclamation des cas 2-4 ci-dessus.
  if (isOrderingWindowClosed(event)) {
    return (
      <GateScreen
        variant="notice"
        title="Pas encore ouvert"
        message="Les commandes sur place ouvrent le soir de l'événement, peu avant le début."
        backHref={`/events/${eventId}`}
        backLabel="Voir l'événement"
      />
    )
  }

  // Gate 6 — chemin heureux : lecture des lignes déjà existantes pour CE
  // billet (rang 0, cloisonné par ticket — voir listOrdersForTicket) et
  // construction du menu affichable. Appel direct de la fonction serveur
  // (pas un self-fetch HTTP) : ce Server Component a déjà un accès base
  // privilégié (Event/Ticket ci-dessus), exactement comme
  // app/ticket/[token]/page.tsx appelle getTicketDisplay directement. Le
  // composant client, lui, ne parlera qu'aux quatre routes HTTP pour toute
  // interaction ultérieure (add/update-quantity/remove/poll).
  const orderResult = await listOrdersForTicket({ id: session.user.id }, { eventId, ticketId: normalizedTicketCode })
  const initialItems: OrderItem[] = orderResult.ok ? orderResult.items : []

  const rawMenu = (event.menu as MenuItemDoc[] | null | undefined) ?? []
  const menu: MenuItemView[] = rawMenu
    .filter((item) => item.available !== false)
    .map((item) => ({
      name: item.name,
      emoji: item.emoji ?? '',
      imageUrl: item.imageUrl ?? null,
      price: item.price ?? 0,
      category: item.category ?? '',
      description: item.description ?? '',
    }))

  return (
    <CommanderClient
      eventId={eventId}
      ticketCode={ticket.ticketCode}
      eventName={ticket.eventName || event.name}
      currency={event.currency}
      menu={menu}
      initialItems={initialItems}
      currentUserId={session.user.id}
    />
  )
}
