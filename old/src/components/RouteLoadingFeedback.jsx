import { useEffect, useState } from 'react'

function routeLabel(pathname) {
  if (pathname.startsWith('/messagerie')) return 'Ouverture de la messagerie…'
  if (pathname.startsWith('/evenements/')) return 'Préparation de la soirée…'
  if (pathname.startsWith('/evenements')) return 'Recherche des événements…'
  if (pathname.startsWith('/prestataires')) return 'Ouverture de l’annuaire…'
  if (pathname.startsWith('/organisateurs')) return 'Chargement des organisateurs…'
  if (pathname.startsWith('/mes-evenements')) return 'Ouverture de tes événements…'
  if (pathname.startsWith('/profil')) return 'Préparation de ton espace…'
  return 'Préparation de Live in Black…'
}

// Feedback global de route : il rend une navigation instantanée rassurante sans
// figer l'interface. Le délai très court évite l'effet « faux chargement » tout
// en donnant un repère systématique lorsque la vue change vraiment.
export default function RouteLoadingFeedback({ routeKey, pathname }) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    setVisible(true)
    const timeout = window.setTimeout(() => setVisible(false), 340)
    return () => window.clearTimeout(timeout)
  }, [routeKey])

  return (
    <div className={`lib-route-feedback ${visible ? 'is-visible' : ''}`} role="status" aria-live="polite" aria-atomic="true">
      <span className="lib-route-feedback__line" aria-hidden="true" />
      <span className="lib-route-feedback__label">{routeLabel(pathname)}</span>
    </div>
  )
}
