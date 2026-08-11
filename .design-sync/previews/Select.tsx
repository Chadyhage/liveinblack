import { useState } from 'react'
import { Select } from 'liveinblack-ui'
import { Stage } from './_stage'

export const Basic = () => {
  const [v, setV] = useState('vip')
  return (
    <Stage>
      <Select
        value={v}
        onChange={setV}
        options={[
          { value: 'standard', label: 'Standard — 15 €' },
          { value: 'vip', label: 'VIP — 35 €' },
          { value: 'carre', label: 'Carré VIP — 80 €' },
        ]}
        style={{ maxWidth: 260 }}
      />
    </Stage>
  )
}

export const PlaceholderAndDisabled = () => (
  <Stage>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 260 }}>
      <Select value="" onChange={() => {}} options={[{ value: 'a', label: 'Option A' }]} placeholder="Sélectionner une catégorie…" />
      <Select value="a" onChange={() => {}} options={[{ value: 'a', label: 'Option A' }]} disabled />
    </div>
  </Stage>
)
