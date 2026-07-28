'use client'

import type { CSSProperties, ReactNode } from 'react'
import Button from './Button'
import { X } from 'lucide-react'

export interface ModalProps {
  onClose: () => void
  children: ReactNode
  maxWidth?: number
  hideClose?: boolean
  contentStyle?: CSSProperties
}

// Coquille de modal partagée — remplace le bloc dupliqué (overlay plein
// écran + fond flouté cliquable + carte centrée + croix de fermeture) trouvé
// à l'identique dans une douzaine de modales (AccessCodesModal, BoostModal,
// CancelModal, GuestlistModal, PostponeModal, etc.). Le contenu (titre,
// formulaire, actions) reste entièrement fourni par l'appelant via
// `children` — cette coquille ne prescrit aucune mise en page interne.
export default function Modal({ onClose, children, maxWidth = 520, hideClose, contentStyle }: ModalProps) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(3,4,8,0.72)', backdropFilter: 'blur(8px)' }} onClick={onClose} />
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth,
          maxHeight: '88vh',
          overflowY: 'auto',
          background: 'var(--surface-2)',
          border: '1px solid rgba(255,229,0,0.18)',
          borderRadius: 12,
          padding: 22,
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
          ...contentStyle,
        }}
      >
        {!hideClose && (
          <Button
            variant="ghost"
            onClick={onClose}
            aria-label="Fermer"
            style={{ position: 'absolute', top: 12, right: 12, width: 34, height: 34, padding: 0, color: 'rgba(255,255,255,0.58)', lineHeight: 1 }}
          >
            <X size={18} strokeWidth={1.8} aria-hidden="true" />
          </Button>
        )}
        {children}
      </div>
    </div>
  )
}
