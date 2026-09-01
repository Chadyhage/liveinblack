'use client'

import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'

export type IconButtonTone = 'default' | 'accent' | 'danger'

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  label: string
  icon: ReactNode
  tone?: IconButtonTone
  size?: number
}

const TONE_STYLES: Record<IconButtonTone, CSSProperties> = {
  default: { color: 'var(--text-muted)', border: '1px solid var(--border-strong)', background: 'var(--surface-2)' },
  accent: { color: 'var(--accent-text)', border: '1px solid var(--primary-a35)', background: 'var(--primary-a08)' },
  danger: { color: 'var(--danger)', border: '1px solid color-mix(in srgb, var(--danger) 35%, transparent)', background: 'color-mix(in srgb, var(--danger) 8%, transparent)' },
}

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, tone = 'default', size = 44, disabled, style, type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      disabled={disabled}
      data-lb-icon-button="true"
      {...rest}
      style={{
        width: Math.max(size, 44),
        height: Math.max(size, 44),
        minWidth: 44,
        minHeight: 44,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        padding: 0,
        borderRadius: 'var(--radius-md)',
        fontFamily: 'inherit',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? .5 : 1,
        transition: 'transform .16s ease, background .16s ease, border-color .16s ease',
        ...TONE_STYLES[tone],
        ...style,
      }}
    >
      {icon}
    </button>
  )
})

export default IconButton
