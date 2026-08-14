'use client'

import { forwardRef, useEffect, useState } from 'react'
import type { ChangeEvent, InputHTMLAttributes } from 'react'

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className' | 'size'> {
  label?: React.ReactNode
  description?: React.ReactNode
}

// Bouton radio 100% custom — même patron que Checkbox : le visuel est
// piloté en React à partir de `checked`, jamais via un sélecteur CSS
// `:checked + span` (un style inline sur le span gagnerait de toute façon
// contre n'importe quelle règle externe, donc ce serait sans effet).
const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
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
        minHeight: 44,
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
          type="radio"
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
            borderRadius: '50%',
            border: `1.5px solid ${isChecked ? 'var(--teal-solid)' : 'var(--border-strong)'}`,
            background: 'var(--surface-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'border-color 0.12s ease',
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--teal-solid)', opacity: isChecked ? 1 : 0, transition: 'opacity 0.1s ease' }} />
        </span>
      </span>
      {(label || description) && (
        <span>
          {label && <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{label}</span>}
          {description && <span style={{ display: 'block', fontSize: 13.5, color: 'var(--text-faint)', marginTop: 3, lineHeight: 1.45 }}>{description}</span>}
        </span>
      )}
    </label>
  )
})

export default Radio
