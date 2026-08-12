import { EventInterestButtonClient } from 'liveinblack-ui'
import { Stage } from './_stage'

export const States = () => (
  <Stage>
    <div style={{ display: 'flex', gap: 16 }}>
      <EventInterestButtonClient eventId="ev_afrobeat" initialInterested={false} isAuthenticated />
      <EventInterestButtonClient eventId="ev_afrobeat" initialInterested isAuthenticated />
      <EventInterestButtonClient eventId="ev_afrobeat" initialInterested={false} isAuthenticated compact />
    </div>
  </Stage>
)
