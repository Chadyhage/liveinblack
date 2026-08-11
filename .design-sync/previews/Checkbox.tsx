import { useState } from 'react'
import { Checkbox } from 'liveinblack-ui'
import { Stage } from './_stage'

export const Basic = () => {
  const [checked, setChecked] = useState(true)
  return (
    <Stage>
      <Checkbox checked={checked} onChange={(e) => setChecked(e.target.checked)} label="Awa Diallo" description="awa.diallo@example.com" />
    </Stage>
  )
}

export const GroupSelection = () => {
  const [ids, setIds] = useState(new Set(['1']))
  const people = [
    { id: '1', name: 'Awa Diallo' },
    { id: '2', name: 'Kenji Traoré' },
    { id: '3', name: 'Nova Entertainment' },
  ]
  return (
    <Stage>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {people.map((p) => (
          <Checkbox
            key={p.id}
            checked={ids.has(p.id)}
            onChange={() => setIds((prev) => { const next = new Set(prev); next.has(p.id) ? next.delete(p.id) : next.add(p.id); return next })}
            label={p.name}
          />
        ))}
      </div>
    </Stage>
  )
}

export const Disabled = () => (
  <Stage>
    <Checkbox disabled checked label="Option indisponible" />
  </Stage>
)
