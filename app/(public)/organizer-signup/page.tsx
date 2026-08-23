import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getMyApplication } from '@/lib/server/provider/applications'
import AuthSplitLayout from '../_components/AuthSplitLayout'

// Portrait éditorial créé sur mesure pour le parcours organisateur.
const HERO_IMG = '/images/live-in-black/auth-organizer.jpg'
import OrganizerOnboardingWizard from '@/app/components/features/organizer/OrganizerOnboardingWizard'

// Route unique "Devenir organisateur" — publique (mode anonyme, pas de
// session) ET connectée (reprise de dossier) : avant cette fusion,
// /organizer-signup (anonyme) et /onboarding-organizer (connecté)
// étaient deux URLs distinctes pour le même formulaire
// (OrganizerOnboardingWizard). La page vérifie elle-même la session pour
// choisir le mode, au lieu de dépendre du layout (app) qui imposait une
// redirection /login pour toute visite anonyme.
export const metadata: Metadata = {
  title: 'Devenir organisateur — LIVEINBLACK',
}

const LOCKED_STATUSES = ['submitted', 'under_review', 'resubmitted', 'approved', 'rejected']

export default async function InscriptionOrganisateurPage() {
  const session = await auth()

  if (session?.user) {
    const application = await getMyApplication({ id: session.user.id }, 'organisateur')
    if (application && LOCKED_STATUSES.includes(application.status)) redirect('/my-application')

    return (
      <AuthSplitLayout heroImage={HERO_IMG} wide>
        <OrganizerOnboardingWizard mode="loggedIn" initialFormData={application?.formData} initialCandidateNote={application?.candidateNote} />
      </AuthSplitLayout>
    )
  }

  return (
    <AuthSplitLayout
      heroImage={HERO_IMG}
      wide
      tagline={
        <>
          CRÉE ET GÈRE
          <br />
          <span style={{ color: 'var(--gold)' }}>TES PROPRES ÉVÉNEMENTS.</span>
        </>
      }
    >
      <OrganizerOnboardingWizard mode="anonymous" />
    </AuthSplitLayout>
  )
}
