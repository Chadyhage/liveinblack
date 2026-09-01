'use client'

import { useState } from 'react'
import { Textarea } from '@/app/components/ui'
import { ModalActions, ModalShell } from './MessagingModals'

const inputStyle: React.CSSProperties = {
  width: '100%',
  borderRadius: 14,
  border: '1px solid var(--border)',
  background: 'var(--field-bg)',
  color: 'var(--text)',
  fontSize: 'var(--font-size-body-sm)',
  marginBottom: 10,
  fontFamily: 'inherit',
}

export default function ReportModal({
  target,
  onSubmit,
  onClose,
}: {
  target: { userId: string; userName: string }
  onSubmit: (reason: string) => void
  onClose: () => void
}) {
  const [reason, setReason] = useState('')

  return (
    <ModalShell title={`Signaler ${target.userName}`} onClose={onClose}>
      <Textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Décris le problème…"
        style={{ ...inputStyle, minHeight: 90, resize: 'vertical' as const }}
        autoFocus
      />
      <ModalActions onCancel={onClose} onConfirm={() => reason.trim() && onSubmit(reason.trim())} confirmLabel="Envoyer" disabled={!reason.trim()} />
    </ModalShell>
  )
}
