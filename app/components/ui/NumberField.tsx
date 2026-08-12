'use client'

import { forwardRef, useEffect, useState } from 'react'
import type { CSSProperties, FocusEvent } from 'react'
import Input from './Input'
import type { InputProps } from './Input'

export interface NumberFieldProps extends Omit<InputProps, 'value' | 'onChange' | 'type' | 'inputMode'> {
  value: number
  // Toujours un nombre valide déjà borné [min, max] — jamais appelé avec
  // NaN/vide/négatif, contrairement à un <input type="number"> brut qui
  // renvoie '' ou une valeur hors bornes selon le navigateur.
  onChange: (value: number) => void
  min?: number
  max?: number
}

// Champ numérique custom — corrige deux bugs confirmés sur les <input
// type="number"> stylés à la main dans EventWizard.tsx (prix, quantités,
// max/compte) : impossible d'effacer un 0 pour retaper une autre valeur
// (un <input> contrôlé directement par `value={n}` réaffiche 0 dès que le
// champ devient vide, avant que l'utilisateur ait pu taper le chiffre
// suivant), et des valeurs négatives acceptées via le clavier ou les
// flèches natives du navigateur malgré un `min` HTML (jamais fiable seul).
//
// Stratégie : état texte LOCAL, synchronisé depuis `value` uniquement quand
// le champ n'a pas le focus (jamais pendant la frappe, sinon on écraserait
// ce que l'utilisateur est en train de taper). Aucun caractère non chiffre
// n'est accepté (regex stricte) — donc jamais de signe négatif possible,
// même en tapant. Le champ peut rester VIDE pendant la frappe (le parent
// n'est pas notifié tant que ce n'est pas un nombre valide) ; au blur, une
// valeur vide ou hors bornes est ramenée au minimum logique, jamais laissée
// invalide.
const NumberField = forwardRef<HTMLInputElement, NumberFieldProps>(function NumberField(
  { value, onChange, min = 0, max, onFocus, onBlur, style, ...rest },
  ref
) {
  const [text, setText] = useState(String(value))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setText(String(value))
  }, [value, focused])

  function clamp(n: number): number {
    let v = n
    if (Number.isFinite(min) && v < min) v = min
    if (typeof max === 'number' && Number.isFinite(max) && v > max) v = max
    return v
  }

  return (
    <Input
      ref={ref}
      inputMode="numeric"
      style={{ textAlign: 'right', ...style } as CSSProperties}
      value={text}
      onFocus={(e: FocusEvent<HTMLInputElement>) => {
        setFocused(true)
        onFocus?.(e)
      }}
      onChange={(e) => {
        // Ne garde que les chiffres — un signe négatif ou tout autre
        // caractère est simplement ignoré, jamais accepté puis rejeté après
        // coup (évite le flash "valeur refusée" et empêche structurellement
        // toute valeur négative).
        const digitsOnly = e.target.value.replace(/[^\d]/g, '')
        setText(digitsOnly)
        if (digitsOnly === '') return // champ vide toléré pendant la frappe
        const n = Number(digitsOnly)
        if (Number.isFinite(n)) onChange(clamp(n))
      }}
      onBlur={(e: FocusEvent<HTMLInputElement>) => {
        setFocused(false)
        const n = text === '' ? min : Number(text)
        const clamped = clamp(Number.isFinite(n) ? n : min)
        setText(String(clamped))
        onChange(clamped)
        onBlur?.(e)
      }}
      {...rest}
    />
  )
})

export default NumberField
