import PublicNav from './PublicNav'

// Coquille publique (vitrine) : navbar commune (vidéo + onglet actif) + contenu.
// Utilisée pour les parcours visiteur/onboarding afin de garder la même
// interface que la landing (au lieu de la nav de l'app connectée).
export default function PublicShell({ children, maxWidth }) {
  return (
    <div style={{ minHeight: '100vh', color: '#fff' }}>
      <PublicNav />
      <div style={{ maxWidth: maxWidth || undefined, margin: maxWidth ? '0 auto' : undefined, width: '100%' }}>
        {children}
      </div>
    </div>
  )
}
