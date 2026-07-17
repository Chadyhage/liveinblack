import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { canCreateEvent, getCreateEventBlockedReason } from '@/lib/server/permissions'
import { listMyOrganizerEvents } from '@/lib/server/organizerEvents'
import { getPayoutStatus } from '@/lib/server/organizerPayouts'
import { listPayoutMomos } from '@/lib/server/organizerPayoutMomos'
import MesEvenementsClient from './MesEvenementsClient'

// Port de src/pages/MesEvenementsPage.jsx (#7 phase organisateur) — tableau
// de bord organisateur. Server Component : charge tout ce qui est nécessaire
// au premier rendu directement en base (même convention que
// app/(app)/profil/page.tsx) ; le composant client ne parle qu'aux routes
// /api/organizer-events/* et /api/organizers/me/* pour toute mutation.
export const metadata: Metadata = {
  title: 'Mes événements — LIVEINBLACK',
  robots: { index: false, follow: false },
}

export default async function MesEvenementsPage() {
  const session = await auth()
  if (!session?.user) redirect('/connexion')

  const permissionUser = {
    activeRole: session.user.activeRole,
    status: session.user.status,
    orgStatus: session.user.orgStatus,
    prestStatus: session.user.prestStatus,
  }

  // Deux gardes distincts, fidèles au legacy : "en cours de validation"
  // (statut pending — l'accès reviendra automatiquement une fois approuvé)
  // vs. "accès restreint" (rôle non-organisateur, ou dossier rejeté) — deux
  // messages différents, jamais fusionnés en un seul écran générique.
  if (permissionUser.activeRole === 'organisateur' && (permissionUser.orgStatus ?? permissionUser.status) === 'pending') {
    return (
      <main style={{ maxWidth: 640, margin: '80px auto', padding: '0 20px', textAlign: 'center' }}>
        <p style={{ font: '700 11px Inter, sans-serif', letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--gold)', margin: '0 0 10px' }}>
          Validation en cours
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.7, margin: '0 0 22px' }}>
          Ton compte organisateur est en attente de validation par l&rsquo;équipe LIVEINBLACK. Tu pourras créer des événements dès que ton dossier sera approuvé.
        </p>
        <a
          href="/mon-dossier"
          style={{
            display: 'inline-block',
            padding: '13px 26px',
            borderRadius: 12,
            background: 'var(--gold)',
            color: 'var(--obsidian)',
            fontWeight: 700,
            fontSize: 13,
            textDecoration: 'none',
            letterSpacing: '.04em',
            textTransform: 'uppercase',
          }}
        >
          Voir mon dossier
        </a>
      </main>
    )
  }

  if (!canCreateEvent(permissionUser)) {
    return (
      <main style={{ maxWidth: 640, margin: '80px auto', padding: '0 20px', textAlign: 'center' }}>
        <h1 style={{ font: '400 34px Inter, sans-serif', color: '#fff', margin: '0 0 14px' }}>Accès restreint</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.7, margin: '0 0 10px' }}>
          {getCreateEventBlockedReason(permissionUser) ?? 'Cette section est réservée aux organisateurs.'}
        </p>
        <p style={{ color: 'var(--text-faint)', fontSize: 12.5, lineHeight: 1.7 }}>
          Pour créer des événements, tu dois avoir un compte organisateur validé.
        </p>
      </main>
    )
  }

  const [eventsResult, payoutStatusResult, momosResult] = await Promise.all([
    listMyOrganizerEvents({ id: session.user.id }),
    getPayoutStatus({ id: session.user.id }),
    listPayoutMomos({ id: session.user.id }),
  ])

  return (
    <MesEvenementsClient
      initialEvents={eventsResult.events}
      initialStripeChargesEnabled={payoutStatusResult.ok ? payoutStatusResult.view.chargesEnabled : false}
      initialMomos={momosResult.ok ? momosResult.momos : {}}
    />
  )
}
