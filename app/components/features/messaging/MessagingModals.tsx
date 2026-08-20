'use client'

import type { ReactNode } from 'react'
import { Button, Modal } from '@/app/components/ui'
import styles from '@/app/(app)/messages/MessagesClient.module.css'

export function ModalShell({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  return (
    <Modal onClose={onClose} zIndex={200} title={title} subtitle={subtitle} maxWidth={wide ? 1440 : 1280}>
      {children}
    </Modal>
  )
}

export function ModalActions({
  onCancel,
  onConfirm,
  confirmLabel,
  disabled,
}: {
  onCancel: () => void
  onConfirm: () => void
  confirmLabel: string
  disabled?: boolean
}) {
  return (
    <div className={styles.modalActions}>
      <Button variant="secondary" onClick={onCancel} size="md" style={{ borderRadius: 999 }}>
        Annuler
      </Button>
      <Button
        variant="primary"
        onClick={onConfirm}
        disabled={disabled}
        size="md"
        style={{
          borderRadius: 999,
          fontWeight: 650,
          textTransform: 'none',
          letterSpacing: 'normal',
        }}
      >
        {confirmLabel}
      </Button>
    </div>
  )
}

export function ConfirmModal({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <ModalShell title={title} onClose={onCancel}>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 8px' }}>{message}</p>
      <ModalActions onCancel={onCancel} onConfirm={onConfirm} confirmLabel={confirmLabel} />
    </ModalShell>
  )
}
