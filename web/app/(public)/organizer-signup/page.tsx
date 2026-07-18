import type { Metadata } from 'next'
import OrganizerOnboardingWizard from '@/app/components/OrganizerOnboardingWizard'

// Route PUBLIQUE (mode anonyme, pas de session) — port de
// src/pages/OnboardingOrganisateur.jsx en mode "inscription" (#7 phase
// organisateur). Le compte et la candidature ne sont créés qu'à la
// soumission finale, voir lib/server/applications.ts.
export const metadata: Metadata = {
  title: 'Devenir organisateur — LIVEINBLACK',
}

export default function InscriptionOrganisateurPage() {
  return <OrganizerOnboardingWizard mode="anonymous" />
}
