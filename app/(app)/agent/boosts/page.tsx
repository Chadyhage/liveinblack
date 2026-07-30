import { redirect } from 'next/navigation'

// Fusionné comme onglet dans /agent/paiements (AgentPaymentsClient,
// section 'boosts') — redirect de compatibilité pour tout lien existant.
export default function AgentBoostsRedirect() {
  redirect('/agent/paiements')
}
