'use client'

import { useId, type CSSProperties, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import Button from './Button'
import BaseModal from './BaseModal'
import styles from './SlideOverModal.module.css'

export interface SlideOverModalProps {
  children: ReactNode
  // Conservé pour compatibilité avec les anciens appelants. Les panneaux de
  // détail ont désormais une largeur uniforme : la moitié du viewport sur
  // ordinateur et toute la largeur sur mobile.
  maxWidth?: number
  // Par défaut router.back() (routes interceptées @modal) — un appelant qui
  // pilote sa propre navigation (état local, paramètre d'URL applicatif type
  // AgentDossiersClient.tsx) passe sa propre fonction de fermeture à la
  // place, sans quoi fermer le tiroir naviguerait en arrière dans
  // l'historique au lieu de simplement retirer le paramètre.
  onClose?: () => void
  ariaLabel?: string
  variant?: 'default' | 'event'
  hideClose?: boolean
  dismissible?: boolean
  zIndex?: number
  title?: string
  subtitle?: string
  actions?: ReactNode
  contentStyle?: CSSProperties
  padded?: boolean
}

// Panneau de détail latéral, utilisé par les
// routes interceptées (app/(public)/@modal/(.)events/[id]/page.tsx et
// équivalents providers/organizers) pour afficher une carte cliquée depuis
// une liste sans quitter la page en cours, tout en gardant chaque page de
// détail link-based (voir ces page.tsx pour la version pleine page utilisée
// en visite directe / refresh / nouvel onglet).
export default function SlideOverModal({
  children,
  onClose,
  ariaLabel = 'Panneau de détails',
  variant = 'default',
  hideClose = false,
  dismissible = true,
  zIndex = 10000,
  title,
  subtitle,
  actions,
  contentStyle,
  padded = false,
}: SlideOverModalProps) {
  const router = useRouter()
  const eventSheet = variant === 'event'
  const titleId = useId()
  const subtitleId = useId()

  return (
    <BaseModal
      onClose={() => (onClose ? onClose() : router.back())}
      rootClassName={`${styles.root}${eventSheet ? ` ${styles.eventRoot}` : ''}`}
      visibleClassName={styles.visible}
      closingClassName={styles.closing}
      dismissible={dismissible}
      backdropClassName={`${styles.backdrop}${eventSheet ? ` ${styles.eventBackdrop}` : ''}`}
      backdropLabel="Fermer le panneau"
      panelClassName={`${styles.panel}${eventSheet ? ` ${styles.eventPanel}` : ''}`}
      rootStyle={{ zIndex }}
      ariaLabel={title ? undefined : ariaLabel}
      ariaLabelledBy={title ? titleId : undefined}
      ariaDescribedBy={title && subtitle ? subtitleId : undefined}
    >
      {({ close }) => (
        <>
          <div className={`${styles.grabber}${eventSheet ? ` ${styles.eventGrabber}` : ''}`} aria-hidden="true" />
          {!hideClose ? (
            <Button variant="ghost" className={`${styles.close}${eventSheet ? ` ${styles.eventClose}` : ''}`} onClick={close} disabled={!dismissible} aria-label="Fermer">
              <X size={18} strokeWidth={1.8} aria-hidden="true" />
            </Button>
          ) : null}
          <div className={`${styles.content}${eventSheet ? ` ${styles.eventContent}` : ''}`}>
            {title ? (
              <header className={styles.header}>
                <h2 id={titleId}>{title}</h2>
                {subtitle ? <p id={subtitleId}>{subtitle}</p> : null}
              </header>
            ) : null}
            <div className={`${styles.body}${padded || title ? ` ${styles.paddedBody}` : ''}`} style={contentStyle}>
              {children}
            </div>
          </div>
          {actions ? <footer className={styles.actions}>{actions}</footer> : null}
        </>
      )}
    </BaseModal>
  )
}
