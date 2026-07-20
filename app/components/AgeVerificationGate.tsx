'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import AgeGateModal from './AgeGateModal'

// Port de src/components/AgeVerificationModal.jsx, déclenché comme dans
// src/pages/EventDetailPage.jsx : openConfirm() interceptait le clic sur le
// CTA de réservation AVANT le tunnel de paiement si `(event.minAge || 0) >=
// 18` et que l'avertissement n'avait pas déjà été acquitté (état mémoire,
// pas de persistance — un rechargement de page redemande l'accord). Le
// legacy branchait ça sur "Payer" ; ce port de app/(public)/evenements/[id]
// n'a pas encore de tunnel de paiement câblé (sélection de place déférée,
// voir le commentaire en tête de page.tsx), donc le gate encadre ici le seul
// CTA existant de la page — le lien de réservation — avec le même
// comportement one-shot par session.
//
// La modale elle-même (AgeGateModal) est partagée avec EventCheckoutPanel
// (utilisateur connecté) pour éviter deux traitements visuels différents du
// même message "Réservé aux 18 ans et plus".

interface AgeVerificationGateProps {
  minAge: number
  href: string
  label: string
}

export default function AgeVerificationGate({ minAge, href, label }: AgeVerificationGateProps) {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [verified, setVerified] = useState(false)

  const gated = (minAge || 0) >= 18

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (gated && !verified) {
      e.preventDefault()
      setShowModal(true)
    }
  }

  function handleVerified() {
    setVerified(true)
    setShowModal(false)
    router.push(href)
  }

  return (
    <>
      <a
        href={href}
        onClick={handleClick}
        style={{ display: 'inline-block', padding: '14px 32px', borderRadius: 999, fontSize: 14, fontWeight: 700, color: '#04120e', background: 'var(--teal-solid)', textDecoration: 'none' }}
      >
        {label}
      </a>

      {showModal && <AgeGateModal minAge={minAge} onConfirm={handleVerified} onCancel={() => setShowModal(false)} />}
    </>
  )
}
