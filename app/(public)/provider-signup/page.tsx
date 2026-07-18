import type { Metadata } from 'next'
import PrestataireOnboardingWizard from '@/app/components/PrestataireOnboardingWizard'

// Route PUBLIQUE (mode anonyme, pas de session) — port de
// src/pages/OnboardingPrestataire.jsx en mode "inscription" (#8 phase
// prestataire). Le compte et la candidature ne sont créés qu'à la
// soumission finale, voir lib/server/applications.ts.
export const metadata: Metadata = {
  title: 'Devenir prestataire — LIVEINBLACK',
}

export default function InscriptionPrestatairePage() {
  return <PrestataireOnboardingWizard mode="anonymous" />
}
