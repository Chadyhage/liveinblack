'use client'

import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Select, type SelectOption } from '@/app/components/ui'

// Adapte le Select custom (contrôlé, value/onChange) à un usage dans un
// <form method="get"> server-rendered sans état client (pages d'annuaire
// organisateurs/prestataires) : un état local initialisé depuis la valeur
// de l'URL courante, et le prop `name` du Select qui pose un input caché
// repris par la soumission native du formulaire — aucun changement du flux
// de navigation existant (toujours un submit explicite, pas d'auto-filtre).
export default function FilterSelect({
  name,
  defaultValue,
  options,
  ariaLabel,
  style,
}: {
  name: string
  defaultValue: string
  options: SelectOption[]
  ariaLabel: string
  style?: CSSProperties
}) {
  const [value, setValue] = useState(defaultValue)
  return <Select name={name} value={value} onChange={setValue} options={options} aria-label={ariaLabel} style={style} />
}
