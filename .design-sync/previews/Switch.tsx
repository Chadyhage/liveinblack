import { useState } from 'react'
import { Switch } from 'liveinblack-ui'
import { Stage } from './_stage'

export const OnOff = () => {
  const [on, setOn] = useState(true)
  const [off, setOff] = useState(false)
  return (
    <Stage>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Switch checked={on} onChange={(e) => setOn(e.target.checked)} />
          <span style={{ color: 'var(--text)', fontSize: 13.5 }}>Notifications par email</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Switch checked={off} onChange={(e) => setOff(e.target.checked)} />
          <span style={{ color: 'var(--text)', fontSize: 13.5 }}>Notifications push</span>
        </div>
      </div>
    </Stage>
  )
}
