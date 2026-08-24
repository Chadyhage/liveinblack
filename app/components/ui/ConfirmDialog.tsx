'use client'

import type { ReactNode } from 'react'
import Button from './Button'
import Modal from './Modal'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  body: ReactNode
  children?: ReactNode
  onCancel: () => void
  onConfirm: () => void
  confirmLabel?: string
  cancelLabel?: string
  confirmVariant?: 'primary' | 'danger'
  confirmDisabled?: boolean
  confirmLoading?: boolean
  confirmLoadingText?: string
  maxWidth?: number
  zIndex?: number
}

// Dialogue de confirmation partagé pour les actions simples de type
// "annuler / confirmer". Centralise la structure, les espacements et les
// labels par défaut au lieu de répéter des modales quasi identiques.
export default function ConfirmDialog({
  open,
  title,
  body,
  children,
  onCancel,
  onConfirm,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  confirmVariant = 'danger',
  confirmDisabled,
  confirmLoading,
  confirmLoadingText,
  maxWidth,
  zIndex,
}: ConfirmDialogProps) {
  if (!open) return null

  return (
    <Modal onClose={onCancel} maxWidth={maxWidth ?? 440} zIndex={zIndex} title={title}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          {body}
        </div>
        {children}
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="secondary" onClick={onCancel} disabled={confirmDisabled || confirmLoading} style={{ flex: 1 }}>
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            onClick={onConfirm}
            disabled={confirmDisabled}
            loading={confirmLoading}
            loadingText={confirmLoadingText}
            style={{ flex: 1, textTransform: 'none', letterSpacing: 'normal' }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
