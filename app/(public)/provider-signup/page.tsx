import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getMyApplication } from '@/lib/server/provider/applications'
import AuthSplitLayout from '../_components/AuthSplitLayout'

// Portrait éditorial créé sur mesure pour le parcours prestataire.
const HERO_IMG = '/images/live-in-black/auth-provider-av-dj-team.png'
import PrestataireOnboardingWizard from '@/app/components/features/provider/PrestataireOnboardingWizard'

// Route unique "Devenir prestataire" — publique (mode anonyme, pas de
// session) ET connectée (reprise de dossier), même fusion que
// /organizer-signup (voir commentaire là-bas).
export const metadata: Metadata = {
  title: 'Devenir prestataire — LIVEINBLACK',
  description: 'Présentez vos services événementiels, développez votre visibilité et trouvez de nouveaux clients au Bénin avec LIVEINBLACK.',
  alternates: { canonical: '/provider-signup' },
  robots: { index: true, follow: true },
}

const LOCKED_STATUSES = ['submitted', 'under_review', 'resubmitted', 'approved', 'rejected']

export default async function InscriptionPrestatairePage() {
  const session = await auth()

  if (session?.user) {
    const application = await getMyApplication({ id: session.user.id }, 'prestataire')
    if (application && LOCKED_STATUSES.includes(application.status)) redirect('/my-application')

    return (
      <AuthSplitLayout heroImage={HERO_IMG} wide>
        <PrestataireOnboardingWizard mode="loggedIn" initialFormData={application?.formData} initialCandidateNote={application?.candidateNote} />
      </AuthSplitLayout>
    )
  }

  return (
    <AuthSplitLayout
      heroImage={HERO_IMG}
      wide
      tagline={
        <>
          DJ, SALLE, TRAITEUR…
          <br />
          <span style={{ color: 'var(--gold)' }}>PROPOSE TES SERVICES.</span>
        </>
      }
    >
      <PrestataireOnboardingWizard mode="anonymous" />
    </AuthSplitLayout>
  )
}
