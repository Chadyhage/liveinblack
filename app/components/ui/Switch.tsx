'use client'

import { forwardRef, useEffect, useState } from 'react'
import type { ChangeEvent, InputHTMLAttributes } from 'react'

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className' | 'size'> {
  label?: React.ReactNode
}

// Interrupteur on/off custom — remplace les cases "actif/inactif" jusqu'ici
// bricolées à coup de <button> qui togglent une couleur de fond à la main
// (ex. AgentHomepageConfigClient, PromoCodesPanel). Visuel piloté en React à
// partir de `checked`, jamais via un sélecteur CSS `:checked + span` (voir
// commentaire de Checkbox.tsx pour la raison).
const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { label, disabled, style, id, checked, defaultChecked, onChange, ...rest },
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
      style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 10, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1, ...style }}
    >
      <span style={{ position: 'relative', width: 38, height: 22, flexShrink: 0 }}>
        <input
          ref={ref}
          id={id}
          type="checkbox"
          role="switch"
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
            borderRadius: 999,
            background: isChecked ? 'var(--primary)' : 'var(--surface-2)',
            border: `1.5px solid ${isChecked ? 'var(--primary)' : 'var(--border-strong)'}`,
            transition: 'background 0.15s ease, border-color 0.15s ease',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 2,
              left: 2,
              width: 15,
              height: 15,
              borderRadius: '50%',
              background: isChecked ? 'var(--obsidian)' : 'var(--text-faint)',
              transform: isChecked ? 'translateX(16px)' : 'translateX(0)',
              transition: 'transform 0.15s ease, background 0.15s ease',
            }}
          />
        </span>
      </span>
      {label && <span style={{ fontSize: 'var(--font-size-headline)', fontWeight: 600, color: 'var(--text)' }}>{label}</span>}
    </label>
  )
})

export default Switch
