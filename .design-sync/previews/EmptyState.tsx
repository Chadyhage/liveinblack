import { EmptyState, Button } from 'liveinblack-ui'
import { Stage } from './_stage'

export const NoEvents = () => (
  <Stage>
    <EmptyState
      title="Aucun événement pour l'instant"
      description="Crée ton premier événement pour le retrouver ici, gérer ses billets et suivre tes ventes."
      action={<Button variant="primary">Créer mon premier événement</Button>}
    />
  </Stage>
)

export const NoResults = () => (
  <Stage>
    <EmptyState title="Aucun résultat" description="Essaie une autre recherche ou modifie tes filtres." />
  </Stage>
)
