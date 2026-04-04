import { useState } from 'react'

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
  label: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 9,
    letterSpacing: '0.35em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.28)',
    display: 'block',
    marginBottom: 6,
  },
  input: {
    background: 'rgba(6,8,16,0.6)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 4,
    fontFamily: "'DM Mono', monospace",
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    padding: '10px 14px',
    width: '100%',
    outline: 'none',
    boxSizing: 'border-box',
  },
  btnPrimary: {
    padding: '13px 28px',
    background: 'linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.06), rgba(78,232,200,0.12))',
    border: '1px solid rgba(255,255,255,0.28)',
    borderRadius: 4,
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    letterSpacing: '0.25em',
    textTransform: 'uppercase',
    color: 'white',
    cursor: 'pointer',
    width: '100%',
  },
  btnGhost: {
    padding: '11px 20px',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 4,
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.4)',
    cursor: 'pointer',
    width: '100%',
    marginTop: 8,
  },
}

// Compute age from date string YYYY-MM-DD
function computeAge(dobString) {
  if (!dobString) return null
  const dob = new Date(dobString)
  if (isNaN(dob.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - dob.getFullYear()
  const m = today.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--
  return age
}

/**
 * AgeVerificationModal
 * Props:
 *   minAge: number (e.g. 18)
 *   onVerified: () => void  — called when age is confirmed ≥ minAge
 *   onCancel: () => void
 */
export default function AgeVerificationModal({ minAge = 18, onVerified, onCancel }) {
  const [dob, setDob] = useState('')
  const [error, setError] = useState(null)
  const [focused, setFocused] = useState(false)

  function handleCheck() {
    const age = computeAge(dob)
    if (age === null) {
      setError('Date invalide.')
      return
    }
    if (age < minAge) {
      setError(`Tu dois avoir au moins ${minAge} ans pour accéder à cet événement.`)
      return
    }
    setError(null)
    onVerified()
  }

  return (
    <div style={S.overlay} onClick={onCancel}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 28, height: 1, background: '#c8a96e', flexShrink: 0 }} />
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.4em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)' }}>
              Vérification d'âge
            </span>
          </div>
          <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: 'rgba(255,255,255,0.9)', margin: 0, marginBottom: 6 }}>
            Événement {minAge}+
          </p>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: 0, lineHeight: 1.7, letterSpacing: '0.05em' }}>
            Cet événement est réservé aux personnes de {minAge} ans et plus. Confirme ta date de naissance pour continuer.
          </p>
        </div>

        {/* Age badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 48, height: 48, borderRadius: '50%',
          border: '1px solid rgba(200,169,110,0.4)',
          background: 'rgba(200,169,110,0.08)',
          fontFamily: "'DM Mono', monospace",
          fontSize: 13, fontWeight: 500,
          color: '#c8a96e',
          marginBottom: 20,
        }}>
          {minAge}+
        </div>

        {/* Date input */}
        <div style={{ marginBottom: 16 }}>
          <label style={S.label}>Date de naissance</label>
          <input
            type="date"
            value={dob}
            onChange={e => { setDob(e.target.value); setError(null) }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            max={new Date().toISOString().split('T')[0]}
            style={{
              ...S.input,
              borderColor: error ? 'rgba(220,50,50,0.6)' : focused ? '#c8a96e' : 'rgba(255,255,255,0.10)',
              colorScheme: 'dark',
            }}
          />
          {error && (
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(220,100,100,0.9)', marginTop: 6 }}>
              {error}
            </p>
          )}
        </div>

        {/* Legal note */}
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.05em', lineHeight: 1.6, marginBottom: 16 }}>
          À l'entrée de l'événement, une pièce d'identité pourra être demandée par les organisateurs pour confirmer ta majorité.
        </p>

        {/* CTA */}
        <button style={S.btnPrimary} onClick={handleCheck}>
          Confirmer mon âge
        </button>
        <button style={S.btnGhost} onClick={onCancel}>
          Annuler
        </button>
      </div>
    </div>
  )
}
