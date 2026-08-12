'use client'

import type { CSSProperties, InputHTMLAttributes } from 'react'

export interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'> {
  accent?: 'teal' | 'gold'
}

// Curseur custom : le <input type="range"> réel reste nécessaire sous le
// capot (drag/clavier/accessibilité natifs), stylé via la classe globale
// `.lb-slider` (app/globals.css — piste fine + curseur avec halo) plutôt que
// le rendu par défaut du navigateur. `accent` choisit la couleur du curseur
// via la variable CSS --lb-slider-accent (teal/gold convergent aujourd'hui
// vers --primary, voir DESIGN_SYSTEM.md — gold reste distinct pour un futur
// re-thème sans toucher aux appelants).
export default function Slider({ accent = 'teal', style, ...rest }: SliderProps) {
  const accentVar = accent === 'gold' ? 'var(--gold)' : 'var(--teal-solid)'
  return (
    <input
      type="range"
      className="lb-slider"
      style={{ width: '100%', ['--lb-slider-accent' as string]: accentVar, ...style } as CSSProperties}
      {...rest}
    />
  )
}
