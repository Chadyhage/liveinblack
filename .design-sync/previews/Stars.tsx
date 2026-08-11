import { Stars } from 'liveinblack-ui'
import { Stage } from './_stage'

export const Display = () => (
  <Stage>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Stars value={4.5} />
      <Stars value={2} />
    </div>
  </Stage>
)
