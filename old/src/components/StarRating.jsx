// Étoiles de notation — affichage (lecture seule, demi-étoiles) et saisie
// (boutons 1→5). Couleur champagne var(--gold) #c8a96e, conforme au design.

const GOLD = '#c8a96e'

function StarIcon({ fill = 'full', size = 16 }) {
  // fill: 'full' | 'half' | 'empty'
  const id = `star-half-${size}`
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
      {fill === 'half' && (
        <defs>
          <linearGradient id={id}>
            <stop offset="50%" stopColor={GOLD} />
            <stop offset="50%" stopColor="rgba(255,255,255,0.16)" />
          </linearGradient>
        </defs>
      )}
      <path
        d="M12 2.6l2.9 5.9 6.5.95-4.7 4.58 1.1 6.47L12 17.44 6.2 20.5l1.1-6.47L2.6 9.45l6.5-.95z"
        fill={fill === 'full' ? GOLD : fill === 'half' ? `url(#${id})` : 'rgba(255,255,255,0.16)'}
      />
    </svg>
  )
}

// Affichage d'une note (ex. 4.3) en étoiles, lecture seule.
export function Stars({ value = 0, size = 16 }) {
  const v = Math.max(0, Math.min(5, Number(value) || 0))
  return (
    <span role="img" aria-label={`${v} sur 5`} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <StarIcon key={i} size={size} fill={v >= i - 0.25 ? 'full' : v >= i - 0.75 ? 'half' : 'empty'} />
      ))}
    </span>
  )
}

// Saisie d'une note 1..5 (boutons accessibles).
export function StarInput({ value = 0, onChange, size = 30 }) {
  return (
    <div role="radiogroup" aria-label="Note sur 5" style={{ display: 'inline-flex', gap: 6 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={`${i} étoile${i > 1 ? 's' : ''}`}
          onClick={() => onChange?.(i)}
          style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', lineHeight: 0 }}
        >
          <StarIcon size={size} fill={value >= i ? 'full' : 'empty'} />
        </button>
      ))}
    </div>
  )
}
