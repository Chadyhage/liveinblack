import { BoostActiveClient } from 'liveinblack-ui'
import { installMockFetch } from './_mockFetch'
import { Stage } from './_stage'

installMockFetch([
  {
    test: '/checkout/boost',
    body: {
      paid: true,
      boostStatus: 'active',
      metadata: { eventId: 'ev_afrobeat', eventName: 'AFROBEAT PARTY — Nova', position: '1', days: '7' },
    },
  },
])

export const Success = () => (
  <Stage style={{ padding: 0 }}>
    <BoostActiveClient sessionId="cs_test_abc" boostId="boost_123" />
  </Stage>
)
