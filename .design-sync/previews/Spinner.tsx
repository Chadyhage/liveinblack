import { Spinner } from 'liveinblack-ui'
import { Stage } from './_stage'

export const Basic = () => (
  <Stage>
    <Spinner />
  </Stage>
)

export const WithText = () => (
  <Stage>
    <Spinner text="Chargement des événements…" size={18} />
  </Stage>
)
