import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getMyApplication } from '@/lib/server/applications'

// Port de src/pages/MonDossierPage.jsx (#7 phase organisateur) — état du
// dossier organisateur (le seul type géré dans cette phase, prestataire
// suit en phase 8 avec le même moteur générique).
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

export default async function MonDossierPage() {
  const session = await auth()
  if (!session?.user) redirect('/connexion')

  const application = await getMyApplication({ id: session.user.id }, 'organisateur')

  return (
    <main style={{ minHeight: '100vh', padding: '32px 16px 60px' }}>
      <div style={{ maxWidth: 520, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#fff', margin: 0 }}>Mon dossier</h1>

        {!application && (
          <div style={cardStyle}>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 16px' }}>Tu n&apos;as pas encore de dossier de candidature organisateur.</p>
            <Link href="/onboarding-organisateur" style={primaryBtn}>
              Commencer ma candidature
            </Link>
          </div>
        )}

        {application?.status === 'draft' && (
          <div style={cardStyle}>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 16px' }}>Ton dossier est en brouillon — termine-le pour le soumettre à l&apos;équipe LIVEINBLACK.</p>
            <Link href="/onboarding-organisateur" style={primaryBtn}>
              Compléter mon dossier
            </Link>
          </div>
        )}

        {(application?.status === 'submitted' || application?.status === 'under_review' || application?.status === 'resubmitted') && (
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
            <Link href="/onboarding-organisateur" style={primaryBtn}>
              Corriger mon dossier
            </Link>
          </div>
        )}

        {application?.status === 'rejected' && (
          <div style={{ ...cardStyle, border: '1px solid rgba(224,90,170,0.35)' }}>
            <p style={{ fontSize: 16, fontWeight: 800, color: '#e05aaa', margin: '0 0 8px' }}>Dossier refusé</p>
            <p style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 16px' }}>{application.rejectionReason}</p>
            <Link href="/onboarding-organisateur" style={primaryBtn}>
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
            <Link href="/mes-evenements" style={primaryBtn}>
              Aller à mes événements
            </Link>
          </div>
        )}
      </div>
    </main>
  )
}
