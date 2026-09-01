'use client'

import type { CSSProperties } from 'react'
import Button from './Button'

export interface TabsProps {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  style?: CSSProperties
}

// Contrôle segmenté custom — remplace le patron de boutons "pilule active/
// inactive" dupliqué pour les bascules Connexion/Inscription, filtres à
// onglets, etc. (ex. AuthForm, TabsSection).
export default function Tabs({ value, onChange, options, style }: TabsProps) {
  return (
    <div
      style={{
        display: 'flex',
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: 4,
        gap: 4,
        ...style,
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <Button
            key={opt.value}
            variant={active ? 'secondary' : 'ghost'}
            onClick={() => onChange(opt.value)}
            fullWidth
            style={{
              borderRadius: 'var(--radius-md)',
              border: active ? '1px solid var(--primary-a35)' : '1px solid transparent',
              background: active ? 'var(--primary-a10)' : 'transparent',
              color: active ? 'var(--accent-text)' : 'var(--text-faint)',
            }}
          >
            {opt.label}
          </Button>
        )
      })}
    </div>
  )
}
