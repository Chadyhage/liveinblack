'use client'

import type { CSSProperties, ChangeEvent } from 'react'
import { LockKeyhole, X } from 'lucide-react'
import { Button, Input, NumberField, Switch } from '@/app/components/ui'

const labelStyle: CSSProperties = { display: 'block', marginBottom: 6, color: 'var(--text-muted)', fontSize: 12, fontWeight: 700 }
const inputStyle: CSSProperties = { background: '#0b0c12', borderRadius: 7, fontSize: 14, fontWeight: 500 }

export function LockIcon() {
  return <LockKeyhole size={11} strokeWidth={1.8} color="var(--gold)" aria-hidden="true" />
}

export function IconClose({ size = 12, color = 'rgba(255,255,255,0.5)' }: { size?: number; color?: string }) {
  return <X size={size} strokeWidth={2} color={color} aria-hidden="true" />
}

export function Toggle({ value, onChange, disabled = false }: { value: boolean; onChange: () => void; disabled?: boolean }) {
  return <Switch checked={value} onChange={onChange} disabled={disabled} />
}

export function InputField({ label, value, onChange, placeholder, type = 'text', error, style, min, max, maxLength, locked = false }: {
  label?: string
  value: string | number
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  type?: string
  error?: string
  style?: CSSProperties
  min?: string | number
  max?: string | number
  maxLength?: number
  locked?: boolean
}) {
  return (
    <div>
      {label && <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>{label}{locked && <LockIcon />}</label>}
      <Input type={type} min={min} max={max} maxLength={maxLength} disabled={locked} invalid={Boolean(error)} title={locked ? 'Verrouillé — billets déjà vendus' : undefined} style={{ ...inputStyle, opacity: locked ? 0.55 : 1, background: locked ? 'var(--primary-a04)' : inputStyle.background, ...style }} placeholder={placeholder} value={value} onChange={onChange} />
      {error && <p style={{ margin: '4px 0 0', color: '#ff7b7b', fontSize: 12 }}>{error}</p>}
    </div>
  )
}

// Variante numérique d'InputField — remplace un <input type="number"> brut
// (zéro impossible à effacer/retaper, valeurs négatives acceptées via le
// clavier ou les flèches du navigateur, confirmé en réunion live le
// 11/08/2026) par NumberField (app/components/ui/NumberField.tsx), qui
// interdit structurellement toute valeur négative et tolère un champ vide
// pendant la frappe. `onChange` reçoit directement un nombre déjà borné, pas
// un ChangeEvent — API volontairement différente d'InputField.
export function NumberInputField({ label, value, onChange, placeholder, error, style, min = 0, max, locked = false }: {
  label?: string
  value: number
  onChange: (value: number) => void
  placeholder?: string
  error?: string
  style?: CSSProperties
  min?: number
  max?: number
  locked?: boolean
}) {
  return (
    <div>
      {label && <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>{label}{locked && <LockIcon />}</label>}
      <NumberField
        min={min}
        max={max}
        disabled={locked}
        invalid={Boolean(error)}
        title={locked ? 'Verrouillé — billets déjà vendus' : undefined}
        style={{ ...inputStyle, opacity: locked ? 0.55 : 1, background: locked ? 'var(--primary-a04)' : inputStyle.background, ...style }}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
      />
      {error && <p style={{ margin: '4px 0 0', color: '#ff7b7b', fontSize: 12 }}>{error}</p>}
    </div>
  )
}

export function Pill({ label, active, onClick, disabled = false, accent = 'var(--teal)' }: { label: string; active: boolean; onClick: () => void; disabled?: boolean; accent?: string }) {
  return <Button variant="ghost" onClick={onClick} disabled={disabled} title={disabled ? 'Verrouillé — billets déjà vendus' : undefined} style={{ padding: '8px 12px', borderRadius: 5, opacity: disabled ? 0.35 : 1, border: active ? `1px solid ${accent}` : '1px solid rgba(255,255,255,0.10)', background: active ? `${accent}22` : 'transparent', color: active ? accent : 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 800 }}>{label}</Button>
}
