// Port de src/components/StarRating.jsx — étoiles de notation (affichage
// lecture seule + saisie 1-5). Couleur champagne var(--gold)/#c8a96e.
import { useId, useRef } from 'react'

const GOLD = '#c8a96e'

function StarIcon({ fill, size, gradientId }: { fill: 'full' | 'half' | 'empty'; size: number; gradientId: string }) {
  const id = gradientId
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

export function Stars({ value = 0, size = 16 }: { value?: number; size?: number }) {
  const v = Math.max(0, Math.min(5, Number(value) || 0))
  const uid = useId()
  return (
    <span role="img" aria-label={`${v} sur 5`} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <StarIcon key={i} size={size} gradientId={`star-half-${uid}-${i}`} fill={v >= i - 0.25 ? 'full' : v >= i - 0.75 ? 'half' : 'empty'} />
      ))}
    </span>
  )
}

// Roving tabindex : seule l'étoile sélectionnée (ou la 1re si aucune) est
// dans l'ordre de tabulation, les flèches Gauche/Droite déplacent le focus
// et la sélection entre les 5 boutons — comportement radiogroup standard
// (voir practices ARIA), le clic direct reste inchangé.
export function StarInput({ value = 0, onChange, size = 30 }: { value?: number; onChange?: (value: number) => void; size?: number }) {
  const uid = useId()
  const btnRefs = useRef<Array<HTMLButtonElement | null>>([])
  const activeIndex = value >= 1 && value <= 5 ? value - 1 : 0

  function move(nextValue: number) {
    const clamped = Math.max(1, Math.min(5, nextValue))
    onChange?.(clamped)
    btnRefs.current[clamped - 1]?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, i: number) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      move(i + 1)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      move(i - 1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      move(1)
    } else if (e.key === 'End') {
      e.preventDefault()
      move(5)
    }
  }

  return (
    <div role="radiogroup" aria-label="Note sur 5" style={{ display: 'inline-flex', gap: 6 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          ref={(el) => { btnRefs.current[i - 1] = el }}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={`${i} étoile${i > 1 ? 's' : ''}`}
          tabIndex={i - 1 === activeIndex ? 0 : -1}
          onClick={() => onChange?.(i)}
          onKeyDown={(e) => handleKeyDown(e, i)}
          style={{ background: 'none', border: 'none', padding: 7, cursor: 'pointer', lineHeight: 0 }}
        >
          <StarIcon size={size} gradientId={`star-input-${uid}-${i}`} fill={value >= i ? 'full' : 'empty'} />
        </button>
      ))}
    </div>
  )
}
