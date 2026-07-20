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
const TYPE_CONTEXT: Record<'organisateur' | 'prestataire', string> = {
  organisateur: 'Ce dossier te permet de créer et gérer tes propres événements.',
  prestataire: 'Ce dossier te permet de proposer tes services (DJ, salle, traiteur…) aux organisateurs et clients.',
}
const SUCCESS_PATH: Record<'organisateur' | 'prestataire', string> = { organisateur: '/my-events', prestataire: '/offer-services' }
const SUCCESS_LABEL: Record<'organisateur' | 'prestataire', string> = { organisateur: 'Aller à mes événements', prestataire: 'Aller à mon espace prestataire' }
const SUPPORT_EMAIL = 'hagechady@liveinblack.com'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function SupportLink() {
  return (
    <a href={`mailto:${SUPPORT_EMAIL}?subject=Question%20sur%20mon%20dossier`} style={{ fontSize: 12, color: 'var(--teal)', textDecoration: 'none' }}>
      Une question ? Contacte le support
    </a>
  )
}

function ApplicationCard({ type, application, roleStatus, id }: { type: 'organisateur' | 'prestataire'; application: ApplicationView | null; roleStatus: 'none' | 'pending' | 'active' | 'rejected'; id: string }) {
  const editPath = `/onboarding-${type}`

  return (
    <section id={id} style={{ display: 'flex', flexDirection: 'column', gap: 10, scrollMarginTop: 20 }}>
      <h2 style={{ fontSize: 13, fontWeight: 800, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>{TYPE_LABEL[type]}</h2>

      {!application && roleStatus === 'active' && (
        <div style={{ ...cardStyle, border: '1px solid rgba(78,232,200,0.35)' }}>
          <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--teal)', margin: '0 0 8px' }}>Compte déjà actif</p>
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 16px' }}>
            Ton interface {type} est active, mais aucun dossier de candidature n&apos;est associé à ce compte (activation manuelle). Aucune action n&apos;est requise.
          </p>
          <Link href={SUCCESS_PATH[type]} style={primaryBtn}>
            {SUCCESS_LABEL[type]}
          </Link>
        </div>
      )}

      {!application && roleStatus !== 'active' && (
        <div style={cardStyle}>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 6px' }}>{TYPE_CONTEXT[type]}</p>
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
        <div style={{ ...cardStyle, border: '1px solid rgba(139,92,246,0.35)' }}>
          <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--violet)', margin: '0 0 8px' }}>Dossier verrouillé — en attente de validation</p>
          {application.submittedAt && (
            <p style={{ fontSize: 12.5, color: 'var(--text-faint)', margin: '0 0 8px' }}>Envoyé le {formatDate(application.submittedAt)}</p>
          )}
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 16px' }}>
            Notre équipe examine ton dossier. Le statut ci-dessus sera mis à jour dès qu&apos;une décision sera prise. Si des corrections sont nécessaires, tu pourras
            le modifier et le renvoyer.
          </p>
          <SupportLink />
        </div>
      )}

      {application?.status === 'needs_changes' && (
        <div style={{ ...cardStyle, border: '1px solid rgba(245,158,11,0.4)' }}>
          <p style={{ fontSize: 16, fontWeight: 800, color: '#f59e0b', margin: '0 0 8px' }}>Corrections requises</p>
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 16px' }}>
            {application.requestedChanges || 'Aucun motif détaillé fourni.'}
          </p>
          <Link href={editPath} style={primaryBtn}>
            Corriger mon dossier
          </Link>
        </div>
      )}

      {application?.status === 'rejected' && (
        <div style={{ ...cardStyle, border: '1px solid rgba(224,90,170,0.35)' }}>
          <p style={{ fontSize: 16, fontWeight: 800, color: '#e05aaa', margin: '0 0 8px' }}>Dossier refusé</p>
          {application.rejectedAt && (
            <p style={{ fontSize: 12.5, color: 'var(--text-faint)', margin: '0 0 8px' }}>Le {formatDate(application.rejectedAt)}</p>
          )}
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 16px' }}>
            {application.rejectionReason || 'Aucun motif détaillé fourni.'}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <Link href={editPath} style={primaryBtn}>
              Soumettre un nouveau dossier
            </Link>
            <SupportLink />
          </div>
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
        <div>
          <Link href="/profile" style={{ fontSize: 12.5, color: 'var(--text-muted)', textDecoration: 'none' }}>
            ← Mon profil
          </Link>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#fff', margin: '8px 0 0' }}>Mon dossier</h1>
        </div>
        <nav style={{ display: 'flex', gap: 16 }}>
          <a href="#organisateur" style={{ fontSize: 12.5, color: 'var(--text-muted)', textDecoration: 'none' }}>
            ↓ Dossier organisateur
          </a>
          <a href="#prestataire" style={{ fontSize: 12.5, color: 'var(--text-muted)', textDecoration: 'none' }}>
            ↓ Dossier prestataire
          </a>
        </nav>
        <ApplicationCard id="organisateur" type="organisateur" application={organisateur} roleStatus={session.user.orgStatus} />
        <ApplicationCard id="prestataire" type="prestataire" application={prestataire} roleStatus={session.user.prestStatus} />
      </div>
    </main>
  )
}
