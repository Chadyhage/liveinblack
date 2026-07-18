import { useEffect } from 'react'
import { IconIdBadge } from './icons'

// ─── Style tokens ─────────────────────────────────────────────────────────────
const S = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 999,
    background: 'rgba(3,4,8,0.72)',
    backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
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

/**
 * AgeVerificationModal
 * Informe l'utilisateur qu'une pièce d'identité sera demandée à l'entrée.
 * Ne collecte aucune donnée — simple avertissement avant achat.
 *
 * Props:
 *   minAge: number (e.g. 18)
 *   onVerified: () => void  — appelé quand l'utilisateur confirme
 *   onCancel: () => void
 */
export default function AgeVerificationModal({ minAge = 18, onVerified, onCancel }) {
  // Fermeture au clavier (Échap) — cohérent avec le clic sur le fond.
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onCancel?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div style={S.overlay} onClick={onCancel}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 28, height: 1, background: '#c8a96e', flexShrink: 0 }} />
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>
              Événement {minAge}+
            </span>
          </div>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 21, fontWeight: 700, color: 'rgba(255,255,255,0.93)', margin: 0 }}>
            Réservé aux {minAge} ans et plus
          </p>
        </div>

        {/* Badge âge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 52, height: 52, borderRadius: '50%',
          border: '1px solid rgba(200,169,110,0.4)',
          background: 'rgba(200,169,110,0.12)',
          fontFamily: 'Inter, sans-serif',
          fontSize: 15, fontWeight: 700,
          color: '#c8a96e',
          marginBottom: 20,
        }}>
          {minAge}+
        </div>

        {/* Message principal */}
        <div style={{
          padding: '14px 16px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderLeft: '3px solid #c8a96e',
          borderRadius: 12,
          marginBottom: 20,
        }}>
          <p style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, color: '#c8a96e', margin: '0 0 6px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            <IconIdBadge size={14} color="#c8a96e" /> Pièce d'identité
          </p>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.65)', margin: 0, lineHeight: 1.6 }}>
            Une pièce d'identité pourra être demandée à l'entrée. Si tu ne peux pas prouver ton âge, l'accès pourra être refusé selon les conditions de l'événement.
          </p>
        </div>

        {/* Note légale */}
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11.5, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, marginBottom: 20 }}>
          En continuant, tu confirmes avoir {minAge} ans ou plus.
        </p>

        {/* CTA */}
        <button style={S.btnPrimary} onClick={onVerified}>
          J'ai compris
        </button>
        <button style={S.btnGhost} onClick={onCancel}>
          Annuler
        </button>

      </div>
    </div>
  )
}
