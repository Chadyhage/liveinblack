'use client'

import { forwardRef, useState } from 'react'
import type { ButtonHTMLAttributes, CSSProperties } from 'react'
import Spinner from './Spinner'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'link'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  loadingText?: string
  fullWidth?: boolean
  icon?: React.ReactNode
}

const SIZE_STYLES: Record<ButtonSize, CSSProperties> = {
  sm: { minHeight: 34, padding: '6px 10px', fontSize: 12.5, borderRadius: 9, gap: 5 },
  md: { minHeight: 38, padding: '8px 12px', fontSize: 13.25, borderRadius: 10, gap: 6 },
  lg: { minHeight: 42, padding: '9px 15px', fontSize: 13.5, borderRadius: 11, gap: 6 },
}

function variantStyle(variant: ButtonVariant, disabled: boolean): CSSProperties {
  switch (variant) {
    case 'primary':
      return {
        background: disabled ? 'var(--primary-a35)' : 'var(--gold)',
        color: 'var(--obsidian)',
        border: '1px solid transparent',
      }
    case 'secondary':
      return {
        background: 'transparent',
        color: 'var(--text)',
        border: '1px solid var(--primary-a55)',
      }
    case 'danger':
      return {
        background: disabled ? 'rgba(224,90,90,0.35)' : '#e05a5a',
        color: '#fff',
        border: '1px solid transparent',
      }
    case 'ghost':
      return {
        background: 'transparent',
        color: 'var(--text-muted)',
        border: '1px solid transparent',
      }
    case 'link':
      return {
        background: 'transparent',
        color: 'var(--teal)',
        border: 'none',
        padding: 0,
        textDecoration: 'underline',
      }
  }
}

// Bouton custom unique de l'app — jamais de <button> brut stylé inline
// ailleurs (voir CLAUDE.md, design system). variant='link' retombe sur un
// style texte-seul (pas de padding/fond), pour les actions secondaires
// discrètes qui utilisaient auparavant un <button> sans style.
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, loadingText, fullWidth, icon, disabled, style, children, type = 'button', ...rest },
  ref
) {
  const isDisabled = Boolean(disabled || loading)
  const isLink = variant === 'link'
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)
  // Feedback hover/active centralisé ici (et pas via className, volontairement
  // absent de ButtonProps — voir commentaire plus bas) pour que tous les
  // boutons de l'app répondent visuellement sans dupliquer de CSS par écran.
  const interactive = !isDisabled && !isLink
  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      {...rest}
      onMouseEnter={(e) => { setHovered(true); rest.onMouseEnter?.(e) }}
      onMouseLeave={(e) => { setHovered(false); setPressed(false); rest.onMouseLeave?.(e) }}
      onMouseDown={(e) => { setPressed(true); rest.onMouseDown?.(e) }}
      onMouseUp={(e) => { setPressed(false); rest.onMouseUp?.(e) }}
      aria-busy={loading || undefined}
      style={{
        minHeight: size === 'sm' ? 34 : size === 'lg' ? 42 : 38,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontFamily: 'inherit',
        cursor: isDisabled ? (loading ? 'wait' : 'not-allowed') : 'pointer',
        width: fullWidth ? '100%' : undefined,
        transition: 'opacity 0.15s ease, transform 0.1s ease, filter 0.15s ease',
        opacity: isDisabled && !loading ? 0.6 : 1,
        filter: interactive && hovered ? 'brightness(1.08)' : undefined,
        transform: interactive && pressed ? 'translateY(1px)' : undefined,
        ...(isLink ? {} : SIZE_STYLES[size]),
        ...variantStyle(variant, isDisabled),
        ...style,
      }}
    >
      {loading ? <Spinner text={loadingText} /> : (
        <>
          {icon}
          {children}
        </>
      )}
    </button>
  )
})

export default Button
