import { Button } from 'liveinblack-ui'
import { MapPin, Trash2 } from 'lucide-react'
import { Stage } from './_stage'

export const Variants = () => (
  <Stage>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
      <Button variant="primary">Réserver ma place</Button>
      <Button variant="secondary">Voir le programme</Button>
      <Button variant="danger">Annuler l'événement</Button>
      <Button variant="ghost">Modifier</Button>
      <Button variant="link">En savoir plus</Button>
    </div>
  </Stage>
)

export const Sizes = () => (
  <Stage>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
      <Button size="sm">Petit</Button>
      <Button size="md">Moyen</Button>
      <Button size="lg">Grand</Button>
    </div>
  </Stage>
)

export const WithIcon = () => (
  <Stage>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      <Button variant="ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
        <MapPin size={15} strokeWidth={2} aria-hidden="true" />
        Voir sur la carte
      </Button>
      <Button variant="danger" size="sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <Trash2 size={13} strokeWidth={2} aria-hidden="true" />
        Supprimer
      </Button>
    </div>
  </Stage>
)

export const LoadingAndFullWidth = () => (
  <Stage>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 280 }}>
      <Button loading loadingText="Paiement en cours…">Payer 24,50 €</Button>
      <Button fullWidth variant="primary">Créer mon premier événement</Button>
      <Button fullWidth variant="secondary" disabled>
        Indisponible
      </Button>
    </div>
  </Stage>
)
