import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import mongoose from 'mongoose'
import { auth } from '@/auth'
import { getDb } from '@/lib/db/mongoose'
import Event from '@/lib/models/Event'
import { getCallerEventRank } from '@/lib/server/eventOrders'
import ScannerClient, { type MenuItemView } from './ScannerClient'

// Port de src/pages/ScannerPage.jsx (Server Component gate + composant
// client, même architecture que app/(app)/commander/[eventId]/[ticketCode]/).
// Outil STAFF, plus strict qu'une page ticket-holder normale : rang ≥ 1
// (scan/serveur/manager/propriétaire/agent) requis pour même voir l'UI de
// scan, pas seulement pour ses actions individuelles.
export const metadata: Metadata = {
  title: 'Scanner — LIVEINBLACK',
  robots: { index: false, follow: false },
}

// Voir le commentaire équivalent dans CommanderPage — `available` n'existe
// pas (encore) dans lib/models/Event.ts mais fait partie du contrat
// comportemental porté depuis le legacy ; lu défensivement ici plutôt que de
// toucher au schéma partagé (hors périmètre de cette tâche).
interface MenuItemDoc {
  name: string
  price?: number
  category?: string
  description?: string
  available?: boolean
}

function GateScreen({ title, message }: { title: string; message: string }) {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            margin: '0 auto 22px',
            background: 'rgba(224,90,170,0.08)',
            border: '2px solid rgba(224,90,170,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--pink)" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <p style={{ fontWeight: 800, fontSize: 22, color: 'var(--pink)', margin: '0 0 10px' }}>{title}</p>
        <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: '0 0 24px', lineHeight: 1.6 }}>{message}</p>
        <Link href="/scanner" style={{ fontSize: 13, fontWeight: 700, color: 'var(--teal)', textDecoration: 'none' }}>
          ← Retour à la liste des événements
        </Link>
      </div>
    </main>
  )
}

export default async function ScannerEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params

  const session = await auth()
  if (!session?.user) {
    // Le layout (app) redirige déjà tout visiteur non connecté — garde locale
    // défensive, même convention que CommanderPage.
    redirect('/login')
  }

  await getDb()
  // `eventId` est un segment d'URL arbitraire — Event.findById() sur une
  // valeur qui n'a pas la forme d'un ObjectId lève un CastError Mongoose non
  // rattrapé, exactement comme documenté dans CommanderPage : on protège avec
  // isValidObjectId AVANT le find, pas après.
  const event = mongoose.isValidObjectId(eventId) ? await Event.findById(eventId).lean() : null

  if (!event) {
    return <GateScreen title="Événement introuvable" message="Cet événement n'existe pas ou plus." />
  }

  // Gate d'accès : rang ≥ 1 requis pour même OUVRIR le scanner (outil staff,
  // plus strict que la page ticket-holder /commander). getCallerEventRank ne
  // lève jamais et renvoie le même rang que la formule interne
  // d'lib/server/eventOrders.ts (owner/createdBy → 3, roster manager → 3,
  // serveur → 2, scan → 1, dj/absent → 0).
  const rank = await getCallerEventRank(session.user.id, eventId)
  if (rank < 1) {
    return <GateScreen title="Accès refusé" message="Tu n'as pas de rôle staff sur cet événement — impossible d'ouvrir le scanner." />
  }

  const rawMenu = (event.menu as MenuItemDoc[] | null | undefined) ?? []
  const menu: MenuItemView[] = rawMenu
    .filter((item) => item.available !== false)
    .map((item) => ({
      name: item.name,
      price: item.price ?? 0,
      category: item.category ?? '',
      description: item.description ?? '',
    }))

  return <ScannerClient eventId={eventId} eventName={event.name} currency={event.currency} menu={menu} rank={rank} />
}
