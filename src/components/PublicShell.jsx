import PublicNav from './PublicNav'

// Coquille publique (vitrine) : navbar commune (vidéo + onglet actif) + contenu.
// La transition d'entrée est gérée globalement par <RouteTransition> dans App.
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
