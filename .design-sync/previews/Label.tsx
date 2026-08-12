import { Label, Input, Select } from 'liveinblack-ui'
import { Stage } from './_stage'

export const WithFields = () => (
  <Stage>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 320 }}>
      <div>
        <Label htmlFor="ev-name">Nom de l'événement</Label>
        <Input id="ev-name" defaultValue="AFROBEAT PARTY" style={{ marginTop: 6, width: '100%' }} />
      </div>
      <div>
        <Label htmlFor="ev-type">Type de place</Label>
        <Select
          value="vip"
          onChange={() => {}}
          options={[
            { value: 'standard', label: 'Standard — 15 €' },
            { value: 'vip', label: 'VIP — 35 €' },
          ]}
        />
      </div>
    </div>
  </Stage>
)
