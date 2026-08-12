import { Skeleton } from 'liveinblack-ui'
import { Stage } from './_stage'

export const Basic = () => (
  <Stage>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320 }}>
      <Skeleton width="60%" height={18} />
      <Skeleton width="100%" height={14} />
      <Skeleton width="80%" height={14} />
    </div>
  </Stage>
)

export const Shapes = () => (
  <Stage>
    <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
      <Skeleton width={44} height={44} radius="50%" />
      <Skeleton width={120} height={80} radius={10} />
    </div>
  </Stage>
)
