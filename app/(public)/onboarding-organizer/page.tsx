import { redirect } from 'next/navigation'

// Ancienne URL connectée, fusionnée dans /organizer-signup (qui gère
// maintenant les deux modes anonyme/connecté) — redirect de compatibilité
// pour tout lien externe/marque-page existant. Vit en (public) (pas (app))
// pour ne pas forcer une redirection /login sur un visiteur anonyme.
export default function OnboardingOrganisateurRedirect() {
  redirect('/organizer-signup')
}
