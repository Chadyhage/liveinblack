import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getMyApplication } from '@/lib/server/applications'
import AuthSplitLayout from '../_components/AuthSplitLayout'

// Photo distincte du visuel par défaut (login) — ambiance service/prestation
// pour l'inscription prestataire, id issu du set vetted de lib/shared/placeholderImage.ts.
const HERO_IMG = 'https://images.unsplash.com/photo-1493676304819-0d7a8d026dcf?auto=format&fit=crop&w=1400&q=80'
import PrestataireOnboardingWizard from '@/app/components/PrestataireOnboardingWizard'

// Route unique "Devenir prestataire" — publique (mode anonyme, pas de
// session) ET connectée (reprise de dossier), même fusion que
// /organizer-signup (voir commentaire là-bas).
export const metadata: Metadata = {
  title: 'Devenir prestataire — LIVEINBLACK',
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
