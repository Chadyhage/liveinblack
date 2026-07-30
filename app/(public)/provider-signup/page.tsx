import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getMyApplication } from '@/lib/server/applications'
import AuthSplitLayout from '../_components/AuthSplitLayout'
import PrestataireOnboardingWizard from '@/app/components/PrestataireOnboardingWizard'

// Route unique "Devenir prestataire" — publique (mode anonyme, pas de
// session) ET connectée (reprise de dossier), même fusion que
// /organizer-signup (voir commentaire là-bas).
export const metadata: Metadata = {
  title: 'Devenir prestataire — LIVEINBLACK',
}

const LOCKED_STATUSES = ['submitted', 'under_review', 'resubmitted', 'approved']

export default async function InscriptionPrestatairePage() {
  const session = await auth()

  if (session?.user) {
    const application = await getMyApplication({ id: session.user.id }, 'prestataire')
    if (application && LOCKED_STATUSES.includes(application.status)) redirect('/my-application')

    return (
      <AuthSplitLayout>
        <PrestataireOnboardingWizard mode="loggedIn" initialFormData={application?.formData} initialCandidateNote={application?.candidateNote} />
      </AuthSplitLayout>
    )
  }

  return (
    <AuthSplitLayout
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
