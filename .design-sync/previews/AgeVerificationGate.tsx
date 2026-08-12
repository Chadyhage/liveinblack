import { AgeVerificationGate } from 'liveinblack-ui'
import { Stage } from './_stage'

export const Basic = () => (
  <Stage>
    <AgeVerificationGate minAge={18} href="/events/afrobeat-party-nova" label="Réserver ma place" />
  </Stage>
)
