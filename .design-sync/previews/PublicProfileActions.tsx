import { PublicProfileActions } from 'liveinblack-ui'
import { Stage } from './_stage'

export const Basic = () => (
  <Stage>
    <PublicProfileActions targetUserId="u_nova" displayName="Nova Entertainment" isAuthenticated isSelf={false} />
  </Stage>
)
