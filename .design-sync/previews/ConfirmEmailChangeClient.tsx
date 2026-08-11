import { ConfirmEmailChangeClient } from 'liveinblack-ui'
import { installMockFetch } from './_mockFetch'
import { Stage } from './_stage'

installMockFetch([{ test: '/confirmer-email', body: { ok: true } }])

export const Success = () => (
  <Stage>
    <ConfirmEmailChangeClient email="awa.diallo@example.com" token="tok_abc123" />
  </Stage>
)

export const MissingLink = () => (
  <Stage>
    <ConfirmEmailChangeClient email={null} token={null} />
  </Stage>
)
