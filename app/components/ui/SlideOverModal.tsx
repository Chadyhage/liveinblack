'use client'

import { type CSSProperties, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import Button from './Button'
import BaseModal from './BaseModal'
import styles from './SlideOverModal.module.css'

export interface SlideOverModalProps {
  children: ReactNode
  // Largeur maximale du panneau centré. Les anciennes routes détail pouvaient
  // passer des tailles très larges ; elles sont plafonnées côté composant pour
  // rester de vraies modales et ne plus couvrir toute la page.
  maxWidth?: number
  // Par défaut router.back() (routes interceptées @modal) — un appelant qui
  // pilote sa propre navigation (état local, paramètre d'URL applicatif type
  // AgentDossiersClient.tsx) passe sa propre fonction de fermeture à la
  // place, sans quoi fermer le tiroir naviguerait en arrière dans
  // l'historique au lieu de simplement retirer le paramètre.
  onClose?: () => void
  ariaLabel?: string
  variant?: 'default' | 'event'
}

const DEFAULT_PANEL_WIDTH = 620
const MAX_PANEL_WIDTH = 760

function getPanelWidth(maxWidth?: number) {
  return Math.min(maxWidth ?? DEFAULT_PANEL_WIDTH, MAX_PANEL_WIDTH)
}

// Coquille de modal détail centrée, utilisée par les
// routes interceptées (app/(public)/@modal/(.)events/[id]/page.tsx et
// équivalents providers/organizers) pour afficher une carte cliquée depuis
// une liste sans quitter la page en cours, tout en gardant chaque page de
// détail link-based (voir ces page.tsx pour la version pleine page utilisée
// en visite directe / refresh / nouvel onglet).
export default function SlideOverModal({ children, maxWidth, onClose, ariaLabel = 'Panneau de détails', variant = 'default' }: SlideOverModalProps) {
  const router = useRouter()
  const eventSheet = variant === 'event'
  const panelWidth = getPanelWidth(maxWidth)

  return (
    <BaseModal
      onClose={() => (onClose ? onClose() : router.back())}
      rootClassName={`${styles.root}${eventSheet ? ` ${styles.eventRoot}` : ''}`}
      visibleClassName={styles.visible}
      closingClassName={styles.closing}
      backdropClassName={`${styles.backdrop}${eventSheet ? ` ${styles.eventBackdrop}` : ''}`}
      backdropLabel="Fermer le panneau"
      panelClassName={`${styles.panel}${eventSheet ? ` ${styles.eventPanel}` : ''}`}
      panelStyle={{ '--modal-max-width': `${panelWidth}px` } as CSSProperties}
      ariaLabel={ariaLabel}
    >
      {({ close }) => (
        <>
          <div className={`${styles.grabber}${eventSheet ? ` ${styles.eventGrabber}` : ''}`} aria-hidden="true" />
          <Button variant="ghost" className={`${styles.close}${eventSheet ? ` ${styles.eventClose}` : ''}`} onClick={close} aria-label="Fermer">
            <X size={18} strokeWidth={1.8} aria-hidden="true" />
          </Button>
          <div className={`${styles.content}${eventSheet ? ` ${styles.eventContent}` : ''}`}>{children}</div>
        </>
      )}
    </BaseModal>
  )
}
