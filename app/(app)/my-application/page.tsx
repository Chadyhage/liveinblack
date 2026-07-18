import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getMyApplication, type ApplicationView } from '@/lib/server/applications'

// Port de src/pages/MonDossierPage.jsx. Legacy ne montre qu'UN dossier à la
// fois — organisateur gagne silencieusement si les deux existent en local,
// puis un second fetch Firestore peut écraser ce choix de façon non
// déterministe (voir l'audit de ce fichier). Cette migration corrige ce
// comportement plutôt que de le reproduire : les DEUX dossiers sont chargés
// et chacun affiche sa propre carte s'il existe (#8 phase prestataire).
export const metadata: Metadata = {
  title: 'Mon dossier — LIVEINBLACK',
  robots: { index: false, follow: false },
}

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24 }
const primaryBtn: React.CSSProperties = {
  display: 'inline-block',
  padding: '12px 22px',
  borderRadius: 10,
  border: 'none',
  background: 'linear-gradient(180deg,#d8bd8a,#c8a96e)',
  color: '#1a1508',
  fontWeight: 700,
  fontSize: 13.5,
  textDecoration: 'none',
}
const secondaryBtn: React.CSSProperties = {
  display: 'inline-block',
  padding: '12px 22px',
  borderRadius: 10,
  border: '1px solid var(--border-strong)',
  background: 'transparent',
  color: '#fff',
  fontWeight: 700,
  fontSize: 13.5,
  textDecoration: 'none',
}

const TYPE_LABEL: Record<'organisateur' | 'prestataire', string> = { organisateur: 'Dossier organisateur', prestataire: 'Dossier prestataire' }
const SUCCESS_PATH: Record<'organisateur' | 'prestataire', string> = { organisateur: '/my-events', prestataire: '/offer-services' }
const SUCCESS_LABEL: Record<'organisateur' | 'prestataire', string> = { organisateur: 'Aller à mes événements', prestataire: 'Aller à mon espace prestataire' }

function ApplicationCard({ type, application }: { type: 'organisateur' | 'prestataire'; application: ApplicationView | null }) {
  const editPath = `/onboarding-${type}`

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 style={{ fontSize: 13, fontWeight: 800, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>{TYPE_LABEL[type]}</h2>

      {!application && (
        <div style={cardStyle}>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 16px' }}>Tu n&apos;as pas encore de dossier de candidature {type}.</p>
          <Link href={editPath} style={secondaryBtn}>
            Commencer ma candidature
          </Link>
        </div>
      )}

      {application?.status === 'draft' && (
        <div style={cardStyle}>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 16px' }}>Ton dossier est en brouillon — termine-le pour le soumettre à l&apos;équipe LIVEINBLACK.</p>
          <Link href={editPath} style={primaryBtn}>
            Compléter mon dossier
          </Link>
        </div>
      )}

      {application && ['submitted', 'under_review', 'resubmitted'].includes(application.status) && (
        <div style={{ ...cardStyle, border: '1px solid rgba(200,169,110,0.3)' }}>
          <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--gold)', margin: '0 0 8px' }}>Dossier verrouillé — en attente de validation</p>
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
            Notre équipe examine ton dossier. Le statut ci-dessus sera mis à jour dès qu&apos;une décision sera prise. Si des corrections sont nécessaires, tu pourras
            le modifier et le renvoyer.
          </p>
        </div>
      )}

      {application?.status === 'needs_changes' && (
        <div style={{ ...cardStyle, border: '1px solid rgba(200,169,110,0.4)' }}>
          <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--gold)', margin: '0 0 8px' }}>Corrections requises</p>
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 16px' }}>{application.requestedChanges}</p>
          <Link href={editPath} style={primaryBtn}>
            Corriger mon dossier
          </Link>
        </div>
      )}

      {application?.status === 'rejected' && (
        <div style={{ ...cardStyle, border: '1px solid rgba(224,90,170,0.35)' }}>
          <p style={{ fontSize: 16, fontWeight: 800, color: '#e05aaa', margin: '0 0 8px' }}>Dossier refusé</p>
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 16px' }}>{application.rejectionReason}</p>
          <Link href={editPath} style={primaryBtn}>
            Soumettre un nouveau dossier
          </Link>
        </div>
      )}

      {application?.status === 'approved' && (
        <div style={{ ...cardStyle, border: '1px solid rgba(78,232,200,0.35)' }}>
          <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal)', margin: '0 0 8px' }}>Dossier approuvé</p>
          {application.approvedAt && (
            <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: '0 0 16px' }}>
              Compte activé le {new Date(application.approvedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          )}
          <Link href={SUCCESS_PATH[type]} style={primaryBtn}>
            {SUCCESS_LABEL[type]}
          </Link>
        </div>
      )}
    </section>
  )
}

export default async function MonDossierPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const [organisateur, prestataire] = await Promise.all([
    getMyApplication({ id: session.user.id }, 'organisateur'),
    getMyApplication({ id: session.user.id }, 'prestataire'),
  ])

  return (
    <main style={{ minHeight: '100vh', padding: '32px 16px 60px' }}>
      <div style={{ maxWidth: 520, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#fff', margin: 0 }}>Mon dossier</h1>
        <ApplicationCard type="organisateur" application={organisateur} />
        <ApplicationCard type="prestataire" application={prestataire} />
      </div>
    </main>
  )
}
