import { Toast } from 'liveinblack-ui'
import { Stage } from './_stage'

export const Success = () => (
  <Stage>
    <div style={{ position: 'relative', height: 60, paddingTop: 20 }}>
      <Toast toast={{ text: 'Profil mis à jour', kind: 'ok' }} />
    </div>
  </Stage>
)

export const Error = () => (
  <Stage>
    <div style={{ position: 'relative', height: 60, paddingTop: 20 }}>
      <Toast toast={{ text: 'Une erreur est survenue', kind: 'err' }} />
    </div>
  </Stage>
)
