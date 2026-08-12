import { Textarea } from 'liveinblack-ui'
import { Stage } from './_stage'

export const Basic = () => (
  <Stage>
    <Textarea
      defaultValue="Une soirée afrobeat/amapiano avec les meilleurs DJ de la scène parisienne. Dress code chic, ambiance garantie jusqu'au bout de la nuit."
      rows={4}
      style={{ maxWidth: 400 }}
    />
  </Stage>
)

export const InvalidAndPlaceholder = () => (
  <Stage>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 400 }}>
      <Textarea placeholder="Résumé court affiché dans la liste" rows={2} />
      <Textarea invalid defaultValue="x" rows={2} />
    </div>
  </Stage>
)
