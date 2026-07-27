import type { Metadata } from 'next'
import AuthSplitLayout from '../_components/AuthSplitLayout'
import PrestataireOnboardingWizard from '@/app/components/PrestataireOnboardingWizard'

// Route PUBLIQUE (mode anonyme, pas de session) — port de
// src/pages/OnboardingPrestataire.jsx en mode "inscription" (#8 phase
// prestataire). Le compte et la candidature ne sont créés qu'à la
// soumission finale, voir lib/server/applications.ts.
export const metadata: Metadata = {
  title: 'Devenir prestataire — LIVEINBLACK',
}

export default function InscriptionPrestatairePage() {
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
