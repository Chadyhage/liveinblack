import { ImageCropperModal } from 'liveinblack-ui'

// Same inline-data-URI rationale as Avatar.tsx — no network fetch in the
// capture harness.
const PORTRAIT_DATA_URI =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Crect width='400' height='400' fill='%23c8946e'/%3E%3Ccircle cx='200' cy='160' r='84' fill='%233a2a1e'/%3E%3Ccircle cx='200' cy='420' r='140' fill='%233a2a1e'/%3E%3C/svg%3E"

export const CircularCrop = () => (
  <ImageCropperModal
    src={PORTRAIT_DATA_URI}
    title="Recadrer ta photo de profil"
    aspect={1}
    outputWidth={400}
    circular
    onCancel={() => {}}
    onConfirm={async () => {}}
  />
)
