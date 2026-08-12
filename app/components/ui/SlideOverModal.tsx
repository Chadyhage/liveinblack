'use client'

import { type CSSProperties, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import Button from './Button'
import BaseModal from './BaseModal'
import styles from './SlideOverModal.module.css'

export interface SlideOverModalProps {
  children: ReactNode
  maxWidth?: number
  // Par défaut router.back() (routes interceptées @modal) — un appelant qui
  // pilote sa propre navigation (état local, paramètre d'URL applicatif type
  // AgentDossiersClient.tsx) passe sa propre fonction de fermeture à la
  // place, sans quoi fermer le tiroir naviguerait en arrière dans
  // l'historique au lieu de simplement retirer le paramètre.
  onClose?: () => void
  ariaLabel?: string
}

// Coquille de modal "tiroir" glissant depuis la droite, utilisée par les
// routes interceptées (app/(public)/@modal/(.)events/[id]/page.tsx et
// équivalents providers/organizers) pour afficher une carte cliquée depuis
// une liste sans quitter la page en cours, tout en gardant chaque page de
// détail link-based (voir ces page.tsx pour la version pleine page utilisée
// en visite directe / refresh / nouvel onglet). Contrairement à Modal.tsx
// (carte centrée, sans animation), cette coquille anime un panneau
// plein-hauteur ancré à droite — pas de lib d'animation dans ce repo, donc
// transition CSS pure pilotée par un état "monté" pour déclencher le
// slide-in au prochain frame.
export default function SlideOverModal({ children, maxWidth = 820, onClose, ariaLabel = 'Panneau de détails' }: SlideOverModalProps) {
  const router = useRouter()

  return (
    <BaseModal
      onClose={() => (onClose ? onClose() : router.back())}
      rootClassName={styles.root}
      visibleClassName={styles.visible}
      closingClassName={styles.closing}
      backdropClassName={styles.backdrop}
      backdropLabel="Fermer le panneau"
      panelClassName={styles.panel}
      panelStyle={{ '--slide-over-width': `${maxWidth}px` } as CSSProperties}
      ariaLabel={ariaLabel}
    >
      {({ close }) => (
        <>
          <div className={styles.grabber} aria-hidden="true" />
          <Button variant="ghost" className={styles.close} onClick={close} aria-label="Fermer">
            <X size={18} strokeWidth={1.8} aria-hidden="true" />
          </Button>
          <div className={styles.content}>{children}</div>
        </>
      )}
    </BaseModal>
  )
}
