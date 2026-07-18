import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getMyApplication } from '@/lib/server/applications'
import PrestataireOnboardingWizard from '@/app/components/PrestataireOnboardingWizard'

// Route CONNECTÉE (#8 phase prestataire) — un dossier déjà soumis/en
// review/approuvé/resoumis n'a plus rien à faire ici, direction /mon-dossier
// (même règle que /onboarding-organisateur).
export const metadata: Metadata = {
  title: 'Devenir prestataire — LIVEINBLACK',
  robots: { index: false, follow: false },
}

const LOCKED_STATUSES = ['submitted', 'under_review', 'resubmitted', 'approved']

export default async function OnboardingPrestatairePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const application = await getMyApplication({ id: session.user.id }, 'prestataire')
  if (application && LOCKED_STATUSES.includes(application.status)) redirect('/my-application')

  return <PrestataireOnboardingWizard mode="loggedIn" initialFormData={application?.formData} initialCandidateNote={application?.candidateNote} />
}
