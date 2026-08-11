import { useState } from 'react'
import { Input } from 'liveinblack-ui'
import { Search } from 'lucide-react'
import { Stage } from './_stage'

export const Basic = () => {
  const [v, setV] = useState('')
  return (
    <Stage>
      <Input value={v} onChange={(e) => setV(e.target.value)} placeholder="Nom de l'événement" style={{ maxWidth: 320 }} />
    </Stage>
  )
}

export const WithIconAndSizes = () => (
  <Stage>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 320 }}>
      <Input defaultValue="Afrobeat" rightIcon={<Search size={15} strokeWidth={2} aria-hidden="true" />} placeholder="Rechercher un titre, un artiste…" />
      <Input size="sm" defaultValue="12" type="number" min={1} max={20} />
    </div>
  </Stage>
)

export const Invalid = () => (
  <Stage>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 320 }}>
      <Input invalid defaultValue="pas-un-email" />
      <span style={{ color: 'var(--pink)', fontSize: 12.5 }}>Adresse email invalide</span>
    </div>
  </Stage>
)
