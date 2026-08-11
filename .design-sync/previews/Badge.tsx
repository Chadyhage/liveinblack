import { Badge } from 'liveinblack-ui'
import { Stage } from './_stage'

export const Tones = () => (
  <Stage>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      <Badge tone="teal">Organisateur</Badge>
      <Badge tone="gold">240 pts</Badge>
      <Badge tone="pink">Nouveau</Badge>
      <Badge tone="violet">Afrobeat</Badge>
      <Badge tone="danger">Refusé</Badge>
      <Badge tone="neutral">Brouillon</Badge>
    </div>
  </Stage>
)

export const InContext = () => (
  <Stage>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
      <span style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600 }}>AFROBEAT PARTY — Nova</span>
      <Badge tone="teal">Actuel</Badge>
      <Badge tone="gold">Boosté</Badge>
    </div>
  </Stage>
)
