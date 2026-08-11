import { Avatar } from 'liveinblack-ui'
import { Stage } from './_stage'

// Inline data URI (no network fetch) — the headless capture harness has no
// outbound network access, so a real Cloudinary URL hangs `page.goto` until
// timeout ([RENDER] Avatar.html: Timeout 15000ms exceeded, confirmed by
// re-running validate in isolation). A tiny embedded portrait-toned SVG
// exercises the `src` path exactly the same way without that dependency.
const PORTRAIT_DATA_URI =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='%23c8946e'/%3E%3Ccircle cx='100' cy='80' r='42' fill='%233a2a1e'/%3E%3Ccircle cx='100' cy='210' r='70' fill='%233a2a1e'/%3E%3C/svg%3E"

export const Sizes = () => (
  <Stage>
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <Avatar name="Nova Entertainment" src={null} size="sm" />
      <Avatar name="Chady Hage" src={null} size="md" />
      <Avatar name="Awa Diallo" src={null} size="lg" />
      <Avatar name="Kenji Traoré" src={null} size="xl" />
    </div>
  </Stage>
)

export const WithPhoto = () => (
  <Stage>
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <Avatar name="Chady Hage" src={PORTRAIT_DATA_URI} size="lg" />
      <Avatar name="?" src={null} size="lg" />
    </div>
  </Stage>
)
