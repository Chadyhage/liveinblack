'use client'

import { forwardRef, useEffect, useState } from 'react'
import type { InputHTMLAttributes, CSSProperties } from 'react'

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  invalid?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  size?: 'sm' | 'md'
  containerStyle?: CSSProperties
  autoTrim?: boolean
}

const SIZE_STYLES: Record<'sm' | 'md', CSSProperties> = {
  sm: { minHeight: 40, padding: '8px 12px', fontSize: 14, lineHeight: 1.35, borderRadius: 11 },
  md: { minHeight: 46, padding: '10px 14px', fontSize: 15.5, lineHeight: 1.38, borderRadius: 12 },
}

const ICON_OFFSET = 38

function horizontalPadding(style: CSSProperties | undefined, size: 'sm' | 'md', side: 'left' | 'right') {
  const explicit = side === 'left' ? style?.paddingLeft : style?.paddingRight
  if (explicit !== undefined) return explicit

  const padding = style?.padding ?? SIZE_STYLES[size].padding
  if (typeof padding === 'number') return padding
  if (typeof padding !== 'string') return 14

  const values = padding.trim().split(/\s+/)
  if (values.length === 1) return values[0]
  if (values.length === 2 || values.length === 3) return values[1]
  return side === 'left' ? values[3] : values[1]
}

const PLACEHOLDER_STYLE_ID = 'lb-input-placeholder-comfort'

function ensurePlaceholderComfortStyle() {
  if (typeof document === 'undefined' || document.getElementById(PLACEHOLDER_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = PLACEHOLDER_STYLE_ID
  style.textContent = `
    .lb-input-control::placeholder {
      color: rgba(255, 255, 255, 0.5);
      opacity: 1;
      letter-spacing: 0;
      transform: none;
      line-height: 1.4;
    }
  `
  document.head.appendChild(style)
}

// Champ texte custom de l'app — un <input> réel reste nécessaire sous le
// capot (saisie clavier/IME/accessibilité), mais jamais stylé inline
// directement dans une page : toujours ce composant, pour un look et un
// comportement (focus, erreur, icônes) garantis identiques partout.
const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    invalid,
    leftIcon,
    rightIcon,
    size = 'md',
    style,
    containerStyle,
    className,
    onFocus,
    onBlur,
    disabled,
    autoTrim,
    autoCapitalize,
    autoCorrect,
    spellCheck,
    type,
    ...rest
  },
  ref
) {
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    ensurePlaceholderComfortStyle()
  }, [])

  const isSensitiveType = type === 'email' || type === 'url' || type === 'tel'
  const shouldTrim = autoTrim ?? (isSensitiveType || type === 'search')
  const defaultAutoCapitalize = autoCapitalize ?? (isSensitiveType ? 'none' : undefined)
  const defaultAutoCorrect = autoCorrect ?? (isSensitiveType ? 'off' : undefined)
  const defaultSpellCheck = spellCheck ?? (isSensitiveType ? false : undefined)

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', ...containerStyle }}>
      {leftIcon && <span style={{ position: 'absolute', left: 11, display: 'flex', color: 'var(--text-faint)', pointerEvents: 'none' }}>{leftIcon}</span>}
      <input
        className={`lb-input-control${className ? ` ${className}` : ''}`}
        ref={ref}
        type={type}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        autoCapitalize={defaultAutoCapitalize}
        autoCorrect={defaultAutoCorrect}
        spellCheck={defaultSpellCheck}
        onFocus={(e) => {
          setFocused(true)
          onFocus?.(e)
        }}
        onBlur={(e) => {
          setFocused(false)
          if (shouldTrim && e.target.value) {
            const trimmed = e.target.value.trim()
            if (trimmed !== e.target.value) {
              e.target.value = trimmed
              const event = new Event('input', { bubbles: true })
              e.target.dispatchEvent(event)
            }
          }
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
          ...style,
          paddingLeft: leftIcon ? ICON_OFFSET : horizontalPadding(style, size, 'left'),
          paddingRight: rightIcon ? ICON_OFFSET : horizontalPadding(style, size, 'right'),
          opacity: disabled ? 0.55 : 1,
          cursor: disabled ? 'not-allowed' : 'text',
        }}
        {...rest}
      />
      {rightIcon && <span style={{ position: 'absolute', right: 11, display: 'flex', color: 'var(--text-faint)' }}>{rightIcon}</span>}
    </div>
  )
})

export default Input
