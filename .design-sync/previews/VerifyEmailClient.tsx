import { VerifyEmailClient } from 'liveinblack-ui'
import { installMockFetch } from './_mockFetch'
import { Stage } from './_stage'

installMockFetch([{ test: '/verify-email', body: { ok: true } }])

export const Success = () => (
  <Stage>
    <VerifyEmailClient email="awa.diallo@example.com" token="tok_abc123" />
  </Stage>
)

export const MissingLink = () => (
  <Stage>
    <VerifyEmailClient email={null} token={null} />
  </Stage>
)
