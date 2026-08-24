'use client'

import { type CSSProperties, type ReactNode } from 'react'
import { X } from 'lucide-react'
import BaseModal from './BaseModal'
import Button from './Button'
import styles from './ImmersiveDialog.module.css'

export interface ImmersiveDialogProps {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  actions?: ReactNode
  maxWidth?: number
  zIndex?: number
  media?: boolean
  dismissible?: boolean
}

export default function ImmersiveDialog({
  title,
  subtitle,
  onClose,
  children,
  actions,
  maxWidth = 1440,
  zIndex = 3000,
  media = false,
  dismissible = true,
}: ImmersiveDialogProps) {
  return (
    <BaseModal
      onClose={onClose}
      dismissible={dismissible}
      ariaLabel={title}
      rootClassName={`${styles.root}${media ? ` ${styles.media}` : ''}`}
      visibleClassName={styles.visible}
      closingClassName={styles.closing}
      backdropClassName={styles.backdrop}
      panelClassName={`${styles.panel}${media ? ` ${styles.mediaPanel}` : ''}`}
      rootStyle={{ zIndex, '--immersive-width': `${maxWidth}px` } as CSSProperties}
    >
      {({ close }) => (
        <>
          <header className={styles.header}>
            <div className={styles.heading}>
              <h1>{title}</h1>
              {subtitle ? <p>{subtitle}</p> : null}
            </div>
            <Button variant="ghost" className={styles.close} onClick={close} disabled={!dismissible} aria-label="Fermer">
              <X size={20} aria-hidden="true" />
            </Button>
          </header>
          <div className={styles.scroller}>
            <main className={styles.content}>{children}</main>
          </div>
          {actions ? <footer className={styles.actions}>{actions}</footer> : null}
        </>
      )}
    </BaseModal>
  )
}
