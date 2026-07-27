import type { Metadata } from 'next'
import AuthSplitLayout from '../_components/AuthSplitLayout'
import OrganizerOnboardingWizard from '@/app/components/OrganizerOnboardingWizard'

// Route PUBLIQUE (mode anonyme, pas de session) — port de
// src/pages/OnboardingOrganisateur.jsx en mode "inscription" (#7 phase
// organisateur). Le compte et la candidature ne sont créés qu'à la
// soumission finale, voir lib/server/applications.ts.
export const metadata: Metadata = {
  title: 'Devenir organisateur — LIVEINBLACK',
}

export default function InscriptionOrganisateurPage() {
  return (
    <AuthSplitLayout
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
