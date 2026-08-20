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
// Cette page, reliée depuis le détail public de l'événement, est authentifiée
// et vit sous (app) — même architecture que /order/[eventId]/[ticketCode] et /scanner/[eventId]
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

// Icône/mise en page alignées sur le GateScreen de scanner/[eventId]/page.tsx
// (même famille d'écran de garde) — avait divergé sans l'icône ronde rose.
function GateScreen({ title, message }: { title: string; message: string }) {
  return (
    <main style={{ minHeight: '100vh', width: '100%', padding: '32px clamp(18px, 3vw, 48px) 56px' }}>
      <div style={{ width: '100%', maxWidth: 'none', minHeight: 'calc(100vh - 88px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
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
        <Link href="/events" style={{ fontSize: 13, fontWeight: 700, color: 'var(--teal)', textDecoration: 'none' }}>
          ← Retour aux événements
        </Link>
        </div>
      </div>
    </main>
  )
}

export default async function PlaylistPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params

  const session = await auth()
  if (!session?.user) redirect('/login')

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
