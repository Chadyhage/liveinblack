'use client'

import { useId, type CSSProperties, type ReactNode } from 'react'
import Button from './Button'
import { X } from 'lucide-react'
import BaseModal from './BaseModal'
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
  title?: string
  subtitle?: string
  actions?: ReactNode
}

function getPanelContentStyle(contentStyle: CSSProperties | undefined): CSSProperties {
  if (!contentStyle) return {}
  const next = { ...contentStyle }
  delete next.width
  delete next.maxWidth
  delete next.minWidth
  delete next.height
  delete next.maxHeight
  delete next.minHeight
  return next
}

// Coquille de modal partagée — remplace le bloc dupliqué (overlay plein
// écran + fond flouté cliquable + carte centrée + croix de fermeture) trouvé
// à l'identique dans une douzaine de modales (BoostModal, CancelModal,
// GuestlistModal, PostponeModal, etc.). Le contenu (titre,
// formulaire, actions) reste entièrement fourni par l'appelant via
// `children` — cette coquille ne prescrit aucune mise en page interne.
export default function Modal({
  onClose,
  children,
  maxWidth = 1280,
  hideClose,
  contentStyle,
  ariaLabel = 'Fenêtre de dialogue',
  zIndex = 3000,
  dismissible = true,
  title,
  subtitle,
  actions,
}: ModalProps) {
  const titleId = useId()
  const subtitleId = useId()
  const panelContentStyle = getPanelContentStyle(contentStyle)

  return (
    <BaseModal
      onClose={onClose}
      dismissible={dismissible}
      closeDelay={190}
      rootClassName={`lb-modal-overlay ${styles.root}`}
      visibleClassName={styles.visible}
      closingClassName={styles.closing}
      backdropClassName={`lb-modal-backdrop ${styles.backdrop}`}
      panelClassName={`lb-modal-panel ${styles.panel}`}
      rootStyle={{ zIndex }}
      panelStyle={{
          '--modal-width': `${maxWidth}px`,
          ...panelContentStyle,
        } as CSSProperties}
      ariaLabel={title ? undefined : ariaLabel}
      ariaLabelledBy={title ? titleId : undefined}
      ariaDescribedBy={title && subtitle ? subtitleId : undefined}
    >
      {({ close }) => (
        <>
          <div className={styles.grabber} aria-hidden="true" />
          {!hideClose && (
            <Button variant="ghost" className={styles.close} onClick={close} disabled={!dismissible} aria-label="Fermer">
              <X size={18} strokeWidth={1.8} aria-hidden="true" />
            </Button>
          )}
          {title ? (
            <header className={styles.header}>
              <h2 id={titleId}>{title}</h2>
              {subtitle ? <p id={subtitleId}>{subtitle}</p> : null}
            </header>
          ) : null}
          {children}
          {actions ? <footer className={styles.actions}>{actions}</footer> : null}
        </>
      )}
    </BaseModal>
  )
}
