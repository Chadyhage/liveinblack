'use client'

import { forwardRef, useEffect, useState } from 'react'
import type { ChangeEvent, InputHTMLAttributes } from 'react'

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className' | 'size'> {
  label?: React.ReactNode
  description?: React.ReactNode
}

// Case à cocher 100% custom (jamais l'apparence par défaut du navigateur) :
// l'<input type="checkbox"> réel reste dans le DOM pour le clavier/lecteurs
// d'écran/formulaires, mais visuellement masqué (`opacity:0` + superposé) —
// la case visible est le <span> juste après, dont le style est piloté ICI en
// React (jamais via un sélecteur CSS `:checked + span` : un style inline sur
// le span gagnerait de toute façon contre n'importe quelle règle externe,
// donc ce serait silencieusement sans effet — piège vérifié en preview).
const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, disabled, style, id, checked, defaultChecked, onChange, ...rest },
  ref
) {
  const [isChecked, setIsChecked] = useState(Boolean(checked ?? defaultChecked))
  useEffect(() => {
    if (checked !== undefined) setIsChecked(checked)
  }, [checked])

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    setIsChecked(e.target.checked)
    onChange?.(e)
  }

  return (
    <label
      htmlFor={id}
      style={{
        display: 'flex',
        alignItems: description ? 'flex-start' : 'center',
        gap: 10,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        ...style,
      }}
    >
      <span style={{ position: 'relative', width: 18, height: 18, flexShrink: 0, marginTop: description ? 1 : 0 }}>
        <input
          ref={ref}
          id={id}
          type="checkbox"
          disabled={disabled}
          checked={checked}
          defaultChecked={defaultChecked}
          onChange={handleChange}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, margin: 0, cursor: disabled ? 'not-allowed' : 'pointer' }}
          {...rest}
        />
        <span
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 'var(--radius-sm)',
            border: `1.5px solid ${isChecked ? 'var(--teal-solid)' : 'var(--border-strong)'}`,
            background: isChecked ? 'var(--teal-solid)' : 'var(--surface-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.12s ease, border-color 0.12s ease',
          }}
        >
          <svg width="11" height="9" viewBox="0 0 11 9" fill="none" style={{ opacity: isChecked ? 1 : 0, transition: 'opacity 0.1s ease' }}>
            <path d="M1 4.2L4 7.2L10 1" stroke="var(--obsidian)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </span>
      {(label || description) && (
        <span>
          {label && <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{label}</span>}
          {description && <span style={{ display: 'block', fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{description}</span>}
        </span>
      )}
    </label>
  )
})

export default Checkbox
