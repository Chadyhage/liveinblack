'use client'

import { forwardRef, useEffect, useState } from 'react'
import type { InputHTMLAttributes, CSSProperties } from 'react'

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  invalid?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  size?: 'sm' | 'md'
  containerStyle?: CSSProperties
}

const SIZE_STYLES: Record<'sm' | 'md', CSSProperties> = {
  sm: { minHeight: 48, padding: '14px 20px', fontSize: 15, borderRadius: 'var(--radius-md)' },
  md: { minHeight: 54, padding: '17px 24px', fontSize: 16, borderRadius: 'var(--radius-md)' },
}

const ICON_OFFSET = 52

const PLACEHOLDER_STYLE_ID = 'lb-input-placeholder-comfort'

function ensurePlaceholderComfortStyle() {
  if (typeof document === 'undefined' || document.getElementById(PLACEHOLDER_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = PLACEHOLDER_STYLE_ID
  style.textContent = `
    .lb-input-control::placeholder {
      color: rgba(255, 255, 255, 0.46);
      opacity: 1;
      letter-spacing: 0;
      transform: translateY(0.2px);
    }
  `
  document.head.appendChild(style)
}

// Champ texte custom de l'app — un <input> réel reste nécessaire sous le
// capot (saisie clavier/IME/accessibilité), mais jamais stylé inline
// directement dans une page : toujours ce composant, pour un look et un
// comportement (focus, erreur, icônes) garantis identiques partout.
const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, leftIcon, rightIcon, size = 'md', style, containerStyle, className, onFocus, onBlur, disabled, ...rest },
  ref
) {
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    ensurePlaceholderComfortStyle()
  }, [])
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', ...containerStyle }}>
      {leftIcon && <span style={{ position: 'absolute', left: 15, display: 'flex', color: 'var(--text-faint)', pointerEvents: 'none' }}>{leftIcon}</span>}
      <input
        className={`lb-input-control${className ? ` ${className}` : ''}`}
        ref={ref}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        onFocus={(e) => {
          setFocused(true)
          onFocus?.(e)
        }}
        onBlur={(e) => {
          setFocused(false)
          onBlur?.(e)
        }}
        style={{
          width: '100%',
          background: 'var(--surface-2)',
          color: 'var(--text)',
          border: `1px solid ${invalid ? '#ff5b5b' : focused ? 'var(--teal)' : 'var(--border-strong)'}`,
          outline: 'none',
          fontFamily: 'inherit',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          boxShadow: focused ? 'var(--focus-ring)' : undefined,
          ...SIZE_STYLES[size],
          paddingLeft: leftIcon ? ICON_OFFSET : undefined,
          paddingRight: rightIcon ? ICON_OFFSET : undefined,
          opacity: disabled ? 0.55 : 1,
          cursor: disabled ? 'not-allowed' : 'text',
          ...style,
        }}
        {...rest}
      />
      {rightIcon && <span style={{ position: 'absolute', right: 15, display: 'flex', color: 'var(--text-faint)' }}>{rightIcon}</span>}
    </div>
  )
})

export default Input
