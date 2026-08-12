'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import Button from './Button'
import { X } from 'lucide-react'
import styles from './Modal.module.css'

export interface ModalProps {
  onClose: () => void
  children: ReactNode
  maxWidth?: number
  hideClose?: boolean
  contentStyle?: CSSProperties
  ariaLabel?: string
  zIndex?: number
  dismissible?: boolean
}

// Coquille de modal partagée — remplace le bloc dupliqué (overlay plein
// écran + fond flouté cliquable + carte centrée + croix de fermeture) trouvé
// à l'identique dans une douzaine de modales (BoostModal, CancelModal,
// GuestlistModal, PostponeModal, etc.). Le contenu (titre,
// formulaire, actions) reste entièrement fourni par l'appelant via
// `children` — cette coquille ne prescrit aucune mise en page interne.
export default function Modal({ onClose, children, maxWidth = 520, hideClose, contentStyle, ariaLabel = 'Fenêtre de dialogue', zIndex = 3000, dismissible = true }: ModalProps) {
  const [visible, setVisible] = useState(false)
  const [closing, setClosing] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const raf = requestAnimationFrame(() => {
      setVisible(true)
      const firstControl = closeRef.current || panelRef.current?.querySelector<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]')
      firstControl?.focus()
    })
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      cancelAnimationFrame(raf)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus()
    }
  }, [])

  const close = useCallback(() => {
    if (closing || !dismissible) return
    setClosing(true)
    setVisible(false)
    window.setTimeout(onClose, 190)
  }, [closing, dismissible, onClose])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') return close()
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'))
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close])

  return (
    <div className={`lb-modal-overlay ${styles.root}${visible ? ` ${styles.visible}` : ''}${closing ? ` ${styles.closing}` : ''}`} style={{ zIndex }}>
      <Button variant="ghost" className={`lb-modal-backdrop ${styles.backdrop}`} onClick={close} aria-disabled={!dismissible} aria-label="Fermer la fenêtre" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={`lb-modal-panel ${styles.panel}`}
        style={{
          '--modal-width': `${maxWidth}px`,
          ...contentStyle,
        } as CSSProperties}
      >
        <div className={styles.grabber} aria-hidden="true" />
        {!hideClose && (
          <Button
            ref={closeRef}
            variant="ghost"
            className={styles.close}
            onClick={close}
            disabled={!dismissible}
            aria-label="Fermer"
          >
            <X size={18} strokeWidth={1.8} aria-hidden="true" />
          </Button>
        )}
        {children}
      </div>
    </div>
  )
}
