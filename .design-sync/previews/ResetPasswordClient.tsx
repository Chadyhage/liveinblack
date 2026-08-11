import { ResetPasswordClient } from 'liveinblack-ui'
import { Stage } from './_stage'

export const Basic = () => (
  <Stage>
    <ResetPasswordClient email="awa.diallo@example.com" token="tok_abc123" />
  </Stage>
)

export const MissingLink = () => (
  <Stage>
    <ResetPasswordClient email={null} token={null} />
  </Stage>
)
