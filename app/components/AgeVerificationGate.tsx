'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

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

const S = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 999,
    background: 'rgba(3,4,8,0.72)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modal: {
    background: '#12131c',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 20,
    padding: '28px 24px',
    width: '100%',
    maxWidth: 380,
    boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
  },
  btnPrimary: {
    padding: '13px 20px',
    background: 'linear-gradient(180deg, #8f56ff, #7a3bf2)',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: 12,
    fontFamily: 'Inter, sans-serif',
    fontSize: 14,
    fontWeight: 700,
    color: '#fff',
    cursor: 'pointer',
    width: '100%',
    boxShadow: '0 6px 20px rgba(122,59,242,0.35)',
  },
  btnGhost: {
    padding: '12px 20px',
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: 12,
    fontFamily: 'Inter, sans-serif',
    fontSize: 13,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.85)',
    cursor: 'pointer',
    width: '100%',
    marginTop: 8,
  },
}

interface AgeVerificationGateProps {
  minAge: number
  href: string
  label: string
}

export default function AgeVerificationGate({ minAge, href, label }: AgeVerificationGateProps) {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [verified, setVerified] = useState(false)

  useEffect(() => {
    if (!showModal) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowModal(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showModal])

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

      {showModal && (
        <div style={S.overlay} onClick={() => setShowModal(false)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 28, height: 1, background: '#c8a96e', flexShrink: 0 }} />
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>
                  Événement {minAge}+
                </span>
              </div>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 21, fontWeight: 700, color: 'rgba(255,255,255,0.93)', margin: 0 }}>
                Réservé aux {minAge} ans et plus
              </p>
            </div>

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 52,
                height: 52,
                borderRadius: '50%',
                border: '1px solid rgba(200,169,110,0.4)',
                background: 'rgba(200,169,110,0.12)',
                fontFamily: 'Inter, sans-serif',
                fontSize: 15,
                fontWeight: 700,
                color: '#c8a96e',
                marginBottom: 20,
              }}
            >
              {minAge}+
            </div>

            <div
              style={{
                padding: '14px 16px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderLeft: '3px solid #c8a96e',
                borderRadius: 12,
                marginBottom: 20,
              }}
            >
              <p style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, color: '#c8a96e', margin: '0 0 6px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#c8a96e" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <circle cx="9" cy="10" r="2.5" />
                  <path d="M5 17 a4 4 0 0 1 8 0" />
                  <line x1="15" y1="9" x2="19" y2="9" />
                  <line x1="15" y1="13" x2="19" y2="13" />
                </svg>
                Pièce d&apos;identité
              </p>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.65)', margin: 0, lineHeight: 1.6 }}>
                Une pièce d&apos;identité pourra être demandée à l&apos;entrée. Si tu ne peux pas prouver ton âge, l&apos;accès pourra être refusé selon les conditions de l&apos;événement.
              </p>
            </div>

            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11.5, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, marginBottom: 20 }}>
              En continuant, tu confirmes avoir {minAge} ans ou plus.
            </p>

            <button style={S.btnPrimary} onClick={handleVerified}>
              J&apos;ai compris
            </button>
            <button style={S.btnGhost} onClick={() => setShowModal(false)}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </>
  )
}
