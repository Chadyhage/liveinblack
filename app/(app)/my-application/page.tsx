import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getMyApplication, type ApplicationView } from '@/lib/server/provider/applications'
import { Card } from '@/app/components/ui'

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

const KNOWN_APPLICATION_STATUSES = ['draft', 'submitted', 'under_review', 'resubmitted', 'needs_changes', 'rejected', 'approved']

const primaryBtn: React.CSSProperties = {
  display: 'inline-flex',
  minHeight: 'var(--density-action-min)',
  padding: '0 18px',
  borderRadius: 'var(--radius-control)',
  border: 'none',
  background: 'var(--primary)',
  color: 'var(--primary-ink)',
  fontWeight: 800,
  fontSize: 14,
  alignItems: 'center',
  textTransform: 'none',
  letterSpacing: 'normal',
  textDecoration: 'none',
}
const secondaryBtn: React.CSSProperties = {
  display: 'inline-flex',
  minHeight: 'var(--density-action-min)',
  padding: '0 18px',
  borderRadius: 'var(--radius-control)',
  border: '1px solid var(--border-strong)',
  background: 'transparent',
  color: '#fff',
  fontWeight: 700,
  fontSize: 14,
  alignItems: 'center',
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
// `type` (organisateur/prestataire) ne peut pas être interpolé directement
// dans l'URL comme le faisait `/onboarding-${type}` (générait des liens 404
// vers /onboarding-organisateur et /onboarding-prestataire, qui n'existent pas).
// /organizer-signup et /provider-signup gèrent maintenant le mode connecté
// (reprise de dossier) directement — /onboarding-organizer et
// /onboarding-provider ne sont plus que des redirects de compatibilité.
const EDIT_PATH: Record<'organisateur' | 'prestataire', string> = { organisateur: '/organizer-signup', prestataire: '/provider-signup' }

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function SupportLink() {
  return (
    <a href={`mailto:${SUPPORT_EMAIL}?subject=Question%20sur%20mon%20dossier`} style={{ minHeight: 'var(--control-height-md)', display: 'inline-flex', alignItems: 'center', fontSize: 14, color: 'var(--primary)', textDecoration: 'none' }}>
      Une question ? Contacte le support
    </a>
  )
}

function ApplicationCard({ type, application, roleStatus, id }: { type: 'organisateur' | 'prestataire'; application: ApplicationView | null; roleStatus: 'none' | 'pending' | 'active' | 'rejected'; id: string }) {
  const editPath = EDIT_PATH[type]

  return (
    <section id={id} style={{ display: 'flex', flexDirection: 'column', gap: 10, scrollMarginTop: 20 }}>
      <h2 style={{ fontSize: 14, fontWeight: 400, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '3.2px', fontFamily: 'var(--font-display), sans-serif', margin: 0 }}>{TYPE_LABEL[type]}</h2>

      {!application && roleStatus === 'active' && (
        <Card accent="var(--primary-a35)" style={{ padding: 24 }}>
          <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--primary)', margin: '0 0 8px' }}>Compte déjà actif</p>
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 16px' }}>
            Ton interface {type} est active, mais aucun dossier de candidature n&apos;est associé à ce compte (activation manuelle). Aucune action n&apos;est requise.
          </p>
          <Link href={SUCCESS_PATH[type]} style={primaryBtn}>
            {SUCCESS_LABEL[type]}
          </Link>
        </Card>
      )}

      {!application && roleStatus !== 'active' && (
        <Card style={{ padding: 24 }}>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 6px' }}>{TYPE_CONTEXT[type]}</p>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 16px' }}>Tu n&apos;as pas encore de dossier de candidature {type}.</p>
          <Link href={editPath} style={secondaryBtn}>
            Commencer ma candidature
          </Link>
        </Card>
      )}

      {application?.status === 'draft' && (
        <Card style={{ padding: 24 }}>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 16px' }}>Ton dossier est en brouillon — termine-le pour le soumettre à l&apos;équipe LIVEINBLACK.</p>
          <Link href={editPath} style={primaryBtn}>
            Compléter mon dossier
          </Link>
        </Card>
      )}

      {application && ['submitted', 'under_review', 'resubmitted'].includes(application.status) && (
        <Card accent="rgba(139,92,246,0.35)" style={{ padding: 24 }}>
          <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--violet)', margin: '0 0 8px' }}>Dossier verrouillé — en attente de validation</p>
          {application.submittedAt && (
            <p style={{ fontSize: 12.5, color: 'var(--text-faint)', margin: '0 0 8px' }}>Envoyé le {formatDate(application.submittedAt)}</p>
          )}
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 16px' }}>
            Notre équipe examine ton dossier. Le statut ci-dessus sera mis à jour dès qu&apos;une décision sera prise. Si des corrections sont nécessaires, tu pourras
            le modifier et le renvoyer.
          </p>
          <SupportLink />
        </Card>
      )}

      {application?.status === 'needs_changes' && (
        <Card accent="rgba(245,158,11,0.4)" style={{ padding: 24 }}>
          <p style={{ fontSize: 16, fontWeight: 800, color: '#f59e0b', margin: '0 0 8px' }}>Corrections requises</p>
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 16px' }}>
            {application.requestedChanges || 'Aucun motif détaillé fourni.'}
          </p>
          <Link href={editPath} style={primaryBtn}>
            Corriger mon dossier
          </Link>
        </Card>
      )}

      {application?.status === 'rejected' && (
        <Card accent="rgba(224,90,170,0.35)" style={{ padding: 24 }}>
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
        </Card>
      )}

      {application?.status === 'approved' && (
        <Card accent="var(--primary-a35)" style={{ padding: 24 }}>
          <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--primary)', margin: '0 0 8px' }}>Dossier approuvé</p>
          {application.approvedAt && (
            <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: '0 0 16px' }}>
              Compte activé le {new Date(application.approvedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          )}
          <Link href={SUCCESS_PATH[type]} style={primaryBtn}>
            {SUCCESS_LABEL[type]}
          </Link>
        </Card>
      )}

      {application && !KNOWN_APPLICATION_STATUSES.includes(application.status) && (
        <Card style={{ padding: 24 }}>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
            Ton dossier existe mais son statut n&apos;a pas pu être affiché correctement. Contacte le support si cela persiste.
          </p>
          <div style={{ marginTop: 16 }}>
            <SupportLink />
          </div>
        </Card>
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
    <main className="lb-dashboard-page lb-dashboard-page--medium">
      <style>{`
        @media (max-width: 900px) {
          .my-application-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <Link href="/profile" style={{ minHeight: 'var(--control-height-md)', display: 'inline-flex', alignItems: 'center', fontSize: 14, color: 'var(--text-muted)', textDecoration: 'none' }}>
          ← Mon profil
        </Link>
        <header>
          <h1 style={{ margin: 0, color: '#f5f5f7', fontSize: 'clamp(28px,3.6vw,38px)', fontWeight: 720, letterSpacing: '-.045em' }}>Mes dossiers</h1>
          <p style={{ maxWidth: 650, margin: '7px 0 0', color: 'rgba(245,245,247,.62)', fontSize: 13, lineHeight: 1.42 }}>Suis l’avancement de tes candidatures organisateur et prestataire.</p>
        </header>
        <nav style={{ display: 'flex', gap: 10 }}>
          <a href="#organisateur" style={{ minHeight: 'var(--control-height-md)', display: 'inline-flex', alignItems: 'center', fontSize: 14, color: 'var(--text-muted)', textDecoration: 'none' }}>
            ↓ Dossier organisateur
          </a>
          <a href="#prestataire" style={{ minHeight: 'var(--control-height-md)', display: 'inline-flex', alignItems: 'center', fontSize: 14, color: 'var(--text-muted)', textDecoration: 'none' }}>
            ↓ Dossier prestataire
          </a>
        </nav>
        <div className="my-application-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
          <ApplicationCard id="organisateur" type="organisateur" application={organisateur} roleStatus={session.user.orgStatus} />
          <ApplicationCard id="prestataire" type="prestataire" application={prestataire} roleStatus={session.user.prestStatus} />
        </div>
      </div>
    </main>
  )
}
