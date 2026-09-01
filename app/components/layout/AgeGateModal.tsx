'use client'

import { Button, Modal } from '@/app/components/ui'

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
  return (
    <Modal onClose={onCancel} maxWidth={440} zIndex={999} ariaLabel={`Réservé aux ${minAge} ans et plus`}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ width: 28, height: 1, background: 'var(--gold)', flexShrink: 0 }} />
          <span style={{ fontSize: 'var(--font-size-caption)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            Événement {minAge}+
          </span>
        </div>
        <p id="age-gate-title" style={{ fontSize: 'var(--font-size-title-3-lg)', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
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
          border: '1px solid var(--primary-a04)',
          background: 'var(--primary-a12)',
          fontSize: 'var(--font-size-headline)',
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
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderLeft: '3px solid var(--gold)',
          borderRadius: 12,
          marginBottom: 20,
        }}
      >
        <p style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--font-size-footnote)', fontWeight: 700, color: 'var(--gold)', margin: '0 0 6px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <circle cx="9" cy="10" r="2.5" />
            <path d="M5 17 a4 4 0 0 1 8 0" />
            <line x1="15" y1="9" x2="19" y2="9" />
            <line x1="15" y1="13" x2="19" y2="13" />
          </svg>
          Pièce d&apos;identité
        </p>
        <p style={{ fontSize: 'var(--font-size-callout)', color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
          Une pièce d&apos;identité pourra être demandée à l&apos;entrée. Si tu ne peux pas prouver ton âge, l&apos;accès pourra être refusé selon les conditions de l&apos;événement.
        </p>
      </div>

      <p style={{ fontSize: 'var(--font-size-caption-lg)', color: 'var(--text-faint)', lineHeight: 1.6, marginBottom: 20 }}>
        En continuant, tu confirmes avoir {minAge} ans ou plus.
      </p>

      <Button
        onClick={onConfirm}
        fullWidth
        style={{
          padding: '13px 20px',
          background: 'var(--violet-cta)',
          border: '1px solid var(--border-strong)',
          borderRadius: 12,
          fontSize: 'var(--font-size-body-sm)',
          fontWeight: 700,
          color: 'var(--primary-ink)',
          boxShadow: 'none',
        }}
      >
        J&apos;ai compris
      </Button>
      <Button
        onClick={onCancel}
        variant="secondary"
        fullWidth
        style={{
          marginTop: 8,
          padding: '12px 20px',
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          fontSize: 'var(--font-size-callout)',
          fontWeight: 600,
          color: 'var(--text)',
        }}
      >
        Annuler
      </Button>
    </Modal>
  )
}
