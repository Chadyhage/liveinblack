import { OrganizerFollowButtonClient } from 'liveinblack-ui'
import { Stage } from './_stage'

export const Appearances = () => (
  <Stage>
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      <OrganizerFollowButtonClient organizerId="org_nova" organizerName="Nova Entertainment" initialFollowing={false} isAuthenticated appearance="default" />
      <OrganizerFollowButtonClient organizerId="org_nova" organizerName="Nova Entertainment" initialFollowing isAuthenticated appearance="premium" />
      <OrganizerFollowButtonClient organizerId="org_nova" organizerName="Nova Entertainment" initialFollowing={false} isAuthenticated appearance="outline" />
    </div>
  </Stage>
)
