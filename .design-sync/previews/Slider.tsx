import { useState } from 'react'
import { Slider } from 'liveinblack-ui'
import { Stage } from './_stage'

export const Accents = () => {
  const [teal, setTeal] = useState(1.4)
  const [gold, setGold] = useState(2.1)
  return (
    <Stage>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 280 }}>
        <div>
          <span style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>Zoom photo de profil</span>
          <Slider accent="teal" min={1} max={3} step={0.01} value={teal} onChange={(e) => setTeal(Number(e.target.value))} style={{ marginTop: 8 }} />
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>Recadrage bannière</span>
          <Slider accent="gold" min={1} max={3} step={0.01} value={gold} onChange={(e) => setGold(Number(e.target.value))} style={{ marginTop: 8 }} />
        </div>
      </div>
    </Stage>
  )
}
