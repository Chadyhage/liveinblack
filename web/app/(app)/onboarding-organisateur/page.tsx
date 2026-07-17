import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getMyApplication } from '@/lib/server/applications'
import OrganizerOnboardingWizard from '@/app/components/OrganizerOnboardingWizard'

// Route CONNECTÉE (#7 phase organisateur) — un dossier déjà soumis/en
// review/approuvé/resoumis n'a plus rien à faire ici, direction /mon-dossier
// (fidèle à OnboardingOrganisateur.jsx : "found and status in [...] →
// redirect to /mon-dossier").
export const metadata: Metadata = {
  title: 'Devenir organisateur — LIVEINBLACK',
  robots: { index: false, follow: false },
}

const LOCKED_STATUSES = ['submitted', 'under_review', 'resubmitted', 'approved']

export default async function OnboardingOrganisateurPage() {
  const session = await auth()
  if (!session?.user) redirect('/connexion')

  const application = await getMyApplication({ id: session.user.id }, 'organisateur')
  if (application && LOCKED_STATUSES.includes(application.status)) redirect('/mon-dossier')

  return <OrganizerOnboardingWizard mode="loggedIn" initialFormData={application?.formData} initialCandidateNote={application?.candidateNote} />
}
