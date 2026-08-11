import { ResaleListingsSection } from 'liveinblack-ui'
import { installMockFetch } from './_mockFetch'
import { Stage } from './_stage'

installMockFetch([
  {
    test: '/resale-listings',
    body: {
      ok: true,
      listings: [
        { id: 'rl_1', place: 'VIP — Table 4', resalePriceMinor: 3500, currency: 'EUR', isGroupListing: false, seatCount: 1 },
        { id: 'rl_2', place: 'Standard', resalePriceMinor: 12000, currency: 'XOF', isGroupListing: true, seatCount: 3 },
      ],
    },
  },
])

export const WithListings = () => (
  <Stage style={{ padding: 0 }}>
    <ResaleListingsSection eventId="ev_afrobeat" isAuthenticated />
  </Stage>
)
