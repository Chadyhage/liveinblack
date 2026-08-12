import { Mascot } from 'liveinblack-ui'
import { Stage } from './_stage'

export const Moods = () => (
  <Stage>
    <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
      <Mascot mood="happy" size={110} />
      <Mascot mood="confused" size={110} />
      <Mascot mood="sad" size={110} />
      <Mascot mood="sleeping" size={110} />
    </div>
  </Stage>
)
