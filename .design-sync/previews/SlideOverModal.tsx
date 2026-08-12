import { SlideOverModal, Avatar, Badge } from 'liveinblack-ui'

export const ProviderDetail = () => (
  <SlideOverModal maxWidth={520}>
    <div style={{ padding: '0 0 40px', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <Avatar name="Nova Entertainment" src={null} size="lg" />
        <div>
          <h2 style={{ margin: 0, color: 'var(--text)', fontSize: 17, fontWeight: 700 }}>Nova Entertainment</h2>
          <Badge tone="teal">DJ & Sonorisation</Badge>
        </div>
      </div>
      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13.5, lineHeight: 1.5 }}>
        Prestataire vérifié — plus de 60 événements accompagnés à Paris et Lyon.
      </p>
    </div>
  </SlideOverModal>
)
