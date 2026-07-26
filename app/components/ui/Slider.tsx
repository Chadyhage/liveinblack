'use client'

import type { InputHTMLAttributes } from 'react'

export interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'> {
  accent?: 'teal' | 'gold'
}

// Curseur custom : le <input type="range"> réel reste nécessaire sous le
// capot (drag/clavier/accessibilité natifs), mais stylé pour matcher le
// design system plutôt que le rendu par défaut du navigateur — piste teal/or
// via `accent-color`, seule propriété cross-browser fiable pour un thumb
// stylé sans réimplémenter le drag à la main.
export default function Slider({ accent = 'teal', style, ...rest }: SliderProps) {
  return (
    <input
      type="range"
      style={{
        width: '100%',
        accentColor: accent === 'gold' ? 'var(--gold)' : 'var(--teal-solid)',
        cursor: 'pointer',
        ...style,
      }}
      {...rest}
    />
  )
}
