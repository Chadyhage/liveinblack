'use client'

import { forwardRef, useState } from 'react'
import type { TextareaHTMLAttributes } from 'react'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
  autoTrim?: boolean
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, style, className, onFocus, onBlur, disabled, autoTrim, rows = 4, ...rest },
  ref
) {
  const [focused, setFocused] = useState(false)
  return (
    <textarea
      className={`lb-input-control${className ? ` ${className}` : ''}`}
      ref={ref}
      rows={rows}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      onFocus={(e) => {
        setFocused(true)
        onFocus?.(e)
      }}
      onBlur={(e) => {
        setFocused(false)
        if (autoTrim && e.target.value) {
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
        minHeight: 104,
        fontSize: 14.5,
        lineHeight: 1.45,
        padding: '12px 14px',
        borderRadius: 'var(--radius-md)',
        resize: 'vertical',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        boxShadow: focused ? 'var(--focus-ring)' : undefined,
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? 'not-allowed' : 'text',
        ...style,
      }}
      {...rest}
    />
  )
})

export default Textarea
