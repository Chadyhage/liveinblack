import { Modal, Button } from 'liveinblack-ui'

export const ConfirmCancel = () => (
  <Modal onClose={() => {}} maxWidth={480}>
    <h2 style={{ margin: '0 0 10px', color: 'var(--text)', fontSize: 18, fontWeight: 700 }}>Annuler l'événement ?</h2>
    <p style={{ margin: '0 0 20px', color: 'var(--text-muted)', fontSize: 13.5, lineHeight: 1.5 }}>
      Tous les acheteurs seront automatiquement remboursés. Cette action est irréversible.
    </p>
    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
      <Button variant="ghost">Retour</Button>
      <Button variant="danger">Annuler l'événement</Button>
    </div>
  </Modal>
)
