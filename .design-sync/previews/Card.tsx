import { Card, Badge, Button } from 'liveinblack-ui'
import { Stage } from './_stage'

export const Basic = () => (
  <Stage>
    <Card style={{ padding: 24, maxWidth: 360 }}>
      <h3 style={{ margin: '0 0 8px', color: 'var(--text)', fontSize: 16, fontWeight: 700 }}>Mon dossier organisateur</h3>
      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13.5, lineHeight: 1.5 }}>
        Ton dossier est en cours d'examen par notre équipe. Tu recevras une réponse sous 48h.
      </p>
    </Card>
  </Stage>
)

export const AccentedWithActions = () => (
  <Stage>
    <Card accent="rgba(184,243,74,0.35)" style={{ padding: 24, maxWidth: 360 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h3 style={{ margin: 0, color: 'var(--text)', fontSize: 16, fontWeight: 700 }}>Événement publié</h3>
        <Badge tone="teal">En ligne</Badge>
      </div>
      <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', fontSize: 13.5, lineHeight: 1.5 }}>
        AFROBEAT PARTY — Nova, le 14 septembre à Paris.
      </p>
      <Button variant="secondary" size="sm">Voir la page publique</Button>
    </Card>
  </Stage>
)
