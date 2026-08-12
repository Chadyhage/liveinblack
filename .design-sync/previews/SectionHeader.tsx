import { SectionHeader } from 'liveinblack-ui'
import { Stage } from './_stage'

export const Centered = () => (
  <Stage>
    <SectionHeader
      eyebrow="À l'affiche"
      title="Les soirées qui font vibrer votre ville"
      description="Découvre les prochains événements sélectionnés par notre équipe, partout en France et en Afrique de l'Ouest."
      align="center"
      level={2}
    />
  </Stage>
)

export const CompactLeft = () => (
  <Stage>
    <SectionHeader eyebrow="Organisateurs" title="Mes événements" compact align="left" level={1} />
  </Stage>
)
