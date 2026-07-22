'use client'

import { useEffect, useRef } from 'react'

// Modale de vérification d'âge partagée — utilisée à la fois par
// AgeVerificationGate (visiteur anonyme, CTA "Se connecter pour réserver")
// et EventCheckoutPanel (utilisateur connecté, CTA "Payer"). Auparavant deux
// implémentations distinctes (contenu, structure et couleur de fond
// différents) pour exactement le même message "Réservé aux 18 ans et plus" —
// unifiées ici pour que l'expérience soit identique quel que soit l'état de
// connexion.
export default function AgeGateModal({
  minAge,
  onConfirm,
  onCancel,
}: {
  minAge: number
  onConfirm: () => void
  onCancel: () => void
}) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    confirmButtonRef.current?.focus()
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999,
        background: 'rgba(3,4,8,0.72)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="age-gate-title"
        style={{
          background: 'var(--surface-2)',
          border: '1px solid var(--border-strong)',
          borderRadius: 20,
          padding: '28px 24px',
          width: '100%',
          maxWidth: 380,
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 28, height: 1, background: 'var(--gold)', flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Événement {minAge}+
            </span>
          </div>
          <p id="age-gate-title" style={{ fontSize: 21, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
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
            fontSize: 15,
            fontWeight: 700,
            color: 'var(--gold)',
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
            borderLeft: '3px solid var(--gold)',
            borderRadius: 12,
            marginBottom: 20,
          }}
        >
          <p style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: 'var(--gold)', margin: '0 0 6px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <circle cx="9" cy="10" r="2.5" />
              <path d="M5 17 a4 4 0 0 1 8 0" />
              <line x1="15" y1="9" x2="19" y2="9" />
              <line x1="15" y1="13" x2="19" y2="13" />
            </svg>
            Pièce d&apos;identité
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
            Une pièce d&apos;identité pourra être demandée à l&apos;entrée. Si tu ne peux pas prouver ton âge, l&apos;accès pourra être refusé selon les conditions de l&apos;événement.
          </p>
        </div>

        <p style={{ fontSize: 11.5, color: 'var(--text-faint)', lineHeight: 1.6, marginBottom: 20 }}>
          En continuant, tu confirmes avoir {minAge} ans ou plus.
        </p>

        <button
          ref={confirmButtonRef}
          onClick={onConfirm}
          style={{
            padding: '13px 20px',
            background: 'var(--violet-cta)',
            border: '1px solid var(--border-strong)',
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 700,
            color: '#fff',
            cursor: 'pointer',
            width: '100%',
            boxShadow: '0 6px 20px rgba(122,59,242,0.35)',
          }}
        >
          J&apos;ai compris
        </button>
        <button
          onClick={onCancel}
          style={{
            marginTop: 8,
            padding: '12px 20px',
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.85)',
            cursor: 'pointer',
            width: '100%',
          }}
        >
          Annuler
        </button>
      </div>
    </div>
  )
}
