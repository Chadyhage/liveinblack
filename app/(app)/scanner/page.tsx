import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import mongoose from 'mongoose'
import { auth } from '@/auth'
import { getDb } from '@/lib/db/mongoose'
import Event from '@/lib/models/Event'
import EventStaff from '@/lib/models/EventStaff'

// Liste les événements que l'utilisateur connecté peut RÉELLEMENT scanner :
// ses propres événements (organizerId/createdBy) — PLUS, additivement, les
// événements où un rôle roster (scan/serveur/manager, jamais 'dj' — cf. #75,
// son outil est la playlist, pas le contrôle d'entrée) lui a été attribué.
//
// PAS de cas spécial "agent voit tout" ici : contrairement au check-in
// (lib/server/ticketCheckin.ts), qui accorde explicitement un accès universel
// aux agents (`caller.roles.includes('agent')`), la formule de rang portée
// FIDÈLEMENT du legacy pour la commande sur place (computeAuthContext /
// resolveRank dans lib/server/eventOrders.ts, cf. api/event-stock.js:115-126)
// n'accorde JAMAIS de rang à un agent qui n'est ni propriétaire ni membre du
// roster de CET événement précis — asymétrie déjà présente dans le legacy,
// pas une régression introduite ici. Lister ici des événements qu'un agent ne
// pourrait ensuite pas ouvrir (getCallerEventRank renverrait 0 → "Accès
// refusé") serait un lien mort trompeur ; la liste reflète donc exactement
// les mêmes critères que l'accès réel accordé par la page événement.
export const metadata: Metadata = {
  title: 'Scanner — LIVEINBLACK',
  robots: { index: false, follow: false },
}

interface EventListItem {
  id: string
  name: string
  date: string
  dateDisplay: string
}

const LIST_CAP = 100

export default async function ScannerIndexPage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }

  await getDb()
  const callerId = session.user.id

  const eventsById = new Map<string, EventListItem>()

  function collect(docs: { _id: unknown; name: string; date: string; dateDisplay?: string }[]) {
    for (const ev of docs) {
      const id = String(ev._id)
      eventsById.set(id, { id, name: ev.name, date: ev.date, dateDisplay: ev.dateDisplay || ev.date })
    }
  }

  const ownEvents = await Event.find({ $or: [{ organizerId: callerId }, { createdBy: callerId }] })
    .sort({ date: -1 })
    .limit(LIST_CAP)
    .select('name date dateDisplay')
    .lean()
  collect(ownEvents)

  // Additif : un Mongoose Map se stocke comme un objet Mongo brut sous le
  // capot (voir lib/models/EventStaff.ts) — cette requête dot-path interroge
  // donc directement les clés du roster, sans avoir à recharger chaque
  // document pour lire son Map en mémoire.
  const staffDocs = await EventStaff.find({ [`roster.${callerId}.role`]: { $in: ['scan', 'serveur', 'manager'] } })
    .select('eventId')
    .lean()
  const missingIds = staffDocs
    .map((d) => d.eventId)
    .filter((id): id is string => Boolean(id) && mongoose.isValidObjectId(id) && !eventsById.has(id))

  if (missingIds.length > 0) {
    const extraEvents = await Event.find({ _id: { $in: missingIds } }).select('name date dateDisplay').lean()
    collect(extraEvents)
  }

  const events = Array.from(eventsById.values()).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

  return (
    <main style={{ minHeight: '100vh', padding: '28px 16px 60px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>
            Staff
          </p>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 6px', letterSpacing: '-0.3px' }}>Scanner</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Choisis un événement pour contrôler les entrées.</p>
        </div>

        {events.length === 0 ? (
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              padding: '40px 20px',
              textAlign: 'center',
              boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            }}
          >
            <p style={{ fontSize: 15, fontWeight: 700, margin: '0 0 6px' }}>Aucun événement à scanner</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
              Tu n&apos;as pour l&apos;instant aucun rôle staff sur un événement.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {events.map((ev) => (
              <Link
                key={ev.id}
                href={`/scanner/${ev.id}`}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '14px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  textDecoration: 'none',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{ev.name}</span>
                <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{ev.dateDisplay}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
