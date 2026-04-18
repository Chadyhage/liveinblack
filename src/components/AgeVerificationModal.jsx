// ─── Style tokens ─────────────────────────────────────────────────────────────
const S = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 999,
    background: 'rgba(0,0,0,0.75)',
    backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 20,
  },
  modal: {
    background: 'rgba(8,10,20,0.92)',
    backdropFilter: 'blur(24px) saturate(1.8)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 12,
    padding: '28px 24px',
    width: '100%',
    maxWidth: 380,
  },
  btnPrimary: {
    padding: '13px 28px',
    background: 'linear-gradient(135deg, rgba(200,169,110,0.22), rgba(200,169,110,0.06))',
    border: '1px solid rgba(200,169,110,0.45)',
    borderRadius: 4,
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    letterSpacing: '0.25em',
    textTransform: 'uppercase',
    color: '#c8a96e',
    cursor: 'pointer',
    width: '100%',
  },
  btnGhost: {
    padding: '11px 20px',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 4,
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.35)',
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
  return (
    <div style={S.overlay} onClick={onCancel}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 28, height: 1, background: '#c8a96e', flexShrink: 0 }} />
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.4em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)' }}>
              Événement {minAge}+
            </span>
          </div>
          <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: 'rgba(255,255,255,0.9)', margin: 0 }}>
            Réservé aux {minAge} ans et plus
          </p>
        </div>

        {/* Badge âge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 52, height: 52, borderRadius: '50%',
          border: '1px solid rgba(200,169,110,0.4)',
          background: 'rgba(200,169,110,0.08)',
          fontFamily: "'DM Mono', monospace",
          fontSize: 14, fontWeight: 600,
          color: '#c8a96e',
          marginBottom: 20,
        }}>
          {minAge}+
        </div>

        {/* Message principal */}
        <div style={{
          padding: '14px 16px',
          background: 'rgba(200,169,110,0.06)',
          border: '1px solid rgba(200,169,110,0.18)',
          borderRadius: 8,
          marginBottom: 20,
        }}>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#c8a96e', margin: '0 0 6px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            🪪 Pièce d'identité obligatoire
          </p>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.65)', margin: 0, lineHeight: 1.7 }}>
            Une pièce d'identité valide sera demandée à l'entrée de l'événement pour vérifier ta majorité. Pense à la prendre avec toi.
          </p>
        </div>

        {/* Note légale */}
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.04em', lineHeight: 1.6, marginBottom: 20 }}>
          En continuant, tu confirmes avoir {minAge} ans ou plus et acceptes de présenter une pièce d'identité le soir de l'événement.
        </p>

        {/* CTA */}
        <button style={S.btnPrimary} onClick={onVerified}>
          J'ai compris — continuer
        </button>
        <button style={S.btnGhost} onClick={onCancel}>
          Annuler
        </button>

      </div>
    </div>
  )
}
