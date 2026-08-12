import { SkeletonList } from 'liveinblack-ui'
import { Stage } from './_stage'

export const Basic = () => (
  <Stage style={{ maxWidth: 440 }}>
    <SkeletonList rows={3} columns={2} />
  </Stage>
)
