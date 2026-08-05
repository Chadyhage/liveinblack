import type { LabelHTMLAttributes } from 'react'

export default function Label({ style, children, ...rest }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      style={{
        display: 'block',
        fontSize: 12.5,
        fontWeight: 700,
        color: 'var(--text-muted)',
        marginBottom: 6,
        ...style,
      }}
      {...rest}
    >
      {children}
    </label>
  )
}
