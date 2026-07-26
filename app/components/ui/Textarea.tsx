'use client'

import { forwardRef, useState } from 'react'
import type { TextareaHTMLAttributes } from 'react'

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> {
  invalid?: boolean
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, style, onFocus, onBlur, disabled, rows = 4, ...rest },
  ref
) {
  const [focused, setFocused] = useState(false)
  return (
    <textarea
      ref={ref}
      rows={rows}
      disabled={disabled}
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
        border: `1px solid ${invalid ? '#e05a5a' : focused ? 'var(--teal)' : 'var(--border-strong)'}`,
        outline: 'none',
        fontFamily: 'inherit',
        fontSize: 13.5,
        padding: '12px 14px',
        borderRadius: 11,
        resize: 'vertical',
        transition: 'border-color 0.15s ease',
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? 'not-allowed' : 'text',
        ...style,
      }}
      {...rest}
    />
  )
})

export default Textarea
