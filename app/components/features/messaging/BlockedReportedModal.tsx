'use client'

import { Button } from '@/app/components/ui'
import { ModalShell } from './MessagingModals'

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '7px 0',
  borderBottom: '1px solid var(--border)',
  gap: 8,
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 650,
  color: 'var(--text-faint)',
  letterSpacing: '-0.01em',
  fontFamily: 'var(--font-interface), sans-serif',
  margin: '0 0 8px',
}

export default function BlockedReportedModal({
  blocked,
  reports,
  onUnblock,
  onClose,
}: {
  blocked: Array<{ userId: string; name: string; email: string }>
  reports: Array<{ id: string; targetId: string; targetName: string; reason: string; createdAt: string }>
  onUnblock: (userId: string, name: string) => void
  onClose: () => void
}) {
  return (
    <ModalShell title="Bloqués & signalés" onClose={onClose} wide>
      <p style={sectionLabelStyle}>Comptes bloqués ({blocked.length})</p>
      {blocked.length === 0 ? <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 16 }}>Aucun compte bloqué.</p> : null}
      {blocked.map((b) => (
        <div key={b.userId} style={rowStyle}>
          <span style={{ fontSize: 13, color: 'var(--text)' }}>{b.name}</span>
          <Button variant="secondary" onClick={() => onUnblock(b.userId, b.name)} size="sm" style={{ borderRadius: 999 }}>
            Débloquer
          </Button>
        </div>
      ))}
      <p style={{ ...sectionLabelStyle, marginTop: 18 }}>Signalements envoyés ({reports.length})</p>
      {reports.length === 0 ? <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Aucun signalement envoyé.</p> : null}
      {reports.map((r) => (
        <div key={r.id} style={rowStyle}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 13, color: 'var(--text)', margin: 0 }}>{r.targetName}</p>
            <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reason}</p>
          </div>
          <span style={{ fontSize: 10, color: 'var(--text-faint)', flexShrink: 0 }}>{new Date(r.createdAt).toLocaleDateString('fr-FR')}</span>
        </div>
      ))}
    </ModalShell>
  )
}
