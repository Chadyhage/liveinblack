import { useState } from 'react'
import { Radio } from 'liveinblack-ui'
import { Stage } from './_stage'

export const Group = () => {
  const [value, setValue] = useState('24h')
  const options = [
    { value: '1h', label: 'Muet 1 heure' },
    { value: '24h', label: 'Muet 24 heures' },
    { value: 'forever', label: 'Muet définitivement' },
  ]
  return (
    <Stage>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {options.map((o) => (
          <Radio key={o.value} name="mute-duration" checked={value === o.value} onChange={() => setValue(o.value)} label={o.label} />
        ))}
      </div>
    </Stage>
  )
}
