'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  invalid?: boolean
  size?: 'sm' | 'md'
  name?: string
  id?: string
  style?: CSSProperties
  'aria-label'?: string
}

// Select 100% custom (jamais le <select> natif du navigateur, dont le menu
// déroulant ne peut pas être stylé de façon cohérente cross-browser) :
// déclencheur + liste personnalisée, navigation clavier (flèches/Entrée/
// Échap), fermeture au clic extérieur. `name` optionnel pose un <input
// type="hidden"> pour rester compatible avec un <form> natif existant.
export default function Select({ value, onChange, options, placeholder = 'Sélectionner…', disabled, invalid, size = 'md', name, id, style, ...aria }: SelectProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const reactId = useId()
  const listboxId = `lb-select-listbox-${reactId}`

  const selected = options.find((o) => o.value === value) || null

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  useEffect(() => {
    if (open) setActiveIndex(Math.max(0, options.findIndex((o) => o.value === value)))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps -- ne réagit qu'à l'ouverture, pas à chaque changement de `value`/`options`

  useEffect(() => {
    if (open && activeIndex >= 0) {
      const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      el?.scrollIntoView({ block: 'nearest' })
    }
  }, [open, activeIndex])

  function commit(index: number) {
    const opt = options[index]
    if (!opt || opt.disabled) return
    onChange(opt.value)
    setOpen(false)
  }

  function onTriggerKeyDown(e: React.KeyboardEvent) {
    if (disabled) return
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      setOpen(true)
      return
    }
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(options.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      commit(activeIndex)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  const sizeStyle = size === 'sm' ? { padding: '9px 12px', fontSize: 12.5 } : { padding: '12px 14px', fontSize: 13.5 }

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      {name && <input type="hidden" name={name} value={value} />}
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        {...aria}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          background: 'var(--surface-2)',
          color: selected ? 'var(--text)' : 'var(--text-faint)',
          border: `1px solid ${invalid ? '#e05a5a' : open ? 'var(--teal)' : 'var(--border-strong)'}`,
          borderRadius: 11,
          fontFamily: 'inherit',
          fontWeight: 600,
          textAlign: 'left',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.55 : 1,
          transition: 'border-color 0.15s ease',
          ...sizeStyle,
          ...style,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected ? selected.label : placeholder}</span>
        <svg width="11" height="7" viewBox="0 0 11 7" fill="none" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s ease' }}>
          <path d="M1 1L5.5 5.5L10 1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          tabIndex={-1}
          style={{
            position: 'absolute',
            zIndex: 'var(--z-floating)' as unknown as number,
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            maxHeight: 240,
            overflowY: 'auto',
            margin: 0,
            padding: 6,
            listStyle: 'none',
            background: 'var(--surface-2)',
            border: '1px solid var(--border-strong)',
            borderRadius: 12,
            boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
          }}
        >
          {options.length === 0 && <li style={{ padding: '10px 12px', fontSize: 12.5, color: 'var(--text-faint)' }}>Aucune option</li>}
          {options.map((opt, i) => {
            const isSelected = opt.value === value
            const isActive = i === activeIndex
            return (
              <li
                key={opt.value}
                data-index={i}
                role="option"
                aria-selected={isSelected}
                aria-disabled={opt.disabled}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => commit(i)}
                style={{
                  padding: '9px 12px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: isSelected ? 700 : 500,
                  color: opt.disabled ? 'var(--text-faint)' : isSelected ? 'var(--teal)' : 'var(--text)',
                  background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                  cursor: opt.disabled ? 'not-allowed' : 'pointer',
                }}
              >
                {opt.label}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
