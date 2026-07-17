import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import mongoose from 'mongoose'
import { auth } from '@/auth'
import { getDb } from '@/lib/db/mongoose'
import Event from '@/lib/models/Event'
import { getPlaylist } from '@/lib/server/playlist'
import PlaylistClient from './PlaylistClient'

// Port de src/components/PlaylistSystem.jsx + PlaylistDJPanel.jsx (#47).
// Contrairement à la page détail événement publique
// (app/(public)/evenements/[id]/page.tsx, qui déclare explicitement la
// playlist hors périmètre), cette page est authentifiée et vit sous (app) —
// même architecture que /commander/[eventId]/[ticketCode] et /scanner/[eventId]
// (Server Component pour le gate + chargement initial privilégié, composant
// client pour toute l'interactivité/polling). Accessible à TOUT utilisateur
// connecté : lib/server/playlist.ts (getPlaylist) n'exige aucune participation
// pour la simple LECTURE, seuls l'ajout et le like l'exigent — la vue
// DJ/modération (canModerate) est un simple bascule d'affichage côté client,
// jamais une porte d'accès à la page elle-même.
export const metadata: Metadata = {
  title: 'Playlist — LIVEINBLACK',
  robots: { index: false, follow: false },
}

function GateScreen({ title, message }: { title: string; message: string }) {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <p style={{ fontWeight: 800, fontSize: 22, color: 'var(--pink)', margin: '0 0 10px' }}>{title}</p>
        <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: '0 0 24px', lineHeight: 1.6 }}>{message}</p>
        <Link href="/evenements" style={{ fontSize: 13, fontWeight: 700, color: 'var(--teal)', textDecoration: 'none' }}>
          ← Retour aux événements
        </Link>
      </div>
    </main>
  )
}

export default async function PlaylistPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params

  const session = await auth()
  if (!session?.user) redirect('/connexion')

  await getDb()
  // Même garde que CommanderPage/ScannerPage : `eventId` est un segment d'URL
  // arbitraire, Event.findById() sur une valeur qui n'a pas la forme d'un
  // ObjectId lève un CastError Mongoose non rattrapé.
  const event = mongoose.isValidObjectId(eventId) ? await Event.findById(eventId).lean() : null
  if (!event) {
    return <GateScreen title="Événement introuvable" message="Cet événement n'existe pas ou plus." />
  }

  const caller = { id: session.user.id, roles: session.user.roles }
  const result = await getPlaylist(caller, { eventId })
  if (!result.ok) {
    return <GateScreen title="Playlist indisponible" message="Impossible de charger la playlist de cet événement pour le moment." />
  }

  const djName = event.artists?.length ? event.artists.map((a) => a.name).join(' · ') : event.dj || 'Le DJ'

  return (
    <PlaylistClient
      eventId={eventId}
      eventName={event.name}
      eventImage={event.imageUrl ?? null}
      eventDateDisplay={event.dateDisplay || ''}
      eventCity={event.city || ''}
      djName={djName}
      currentUserId={session.user.id}
      initialSongs={result.songs}
      initialNowPlaying={result.nowPlaying}
      initialCanModerate={result.canModerate}
      initialSongsRemaining={result.songsRemaining}
      initialLikesRemaining={result.likesRemaining}
      initialIsCheckedIn={result.isCheckedIn}
      initialHasTicket={result.hasTicket}
      initialTicketCount={result.ticketCount}
    />
  )
}
