import { SkeletonRow } from 'liveinblack-ui'
import { Stage } from './_stage'

export const Basic = () => (
  <Stage style={{ maxWidth: 440 }}>
    <SkeletonRow columns={3} />
  </Stage>
)
