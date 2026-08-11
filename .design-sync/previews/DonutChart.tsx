import { DonutChart } from 'liveinblack-ui'
import { Stage } from './_stage'

export const RoleBreakdown = () => (
  <Stage>
    <DonutChart
      data={[
        { label: 'Clients', value: 1840, color: 'var(--teal)' },
        { label: 'Organisateurs', value: 210, color: 'var(--gold)' },
        { label: 'Prestataires', value: 96, color: 'var(--violet)' },
        { label: 'Agents', value: 6, color: 'var(--pink)' },
      ]}
    />
  </Stage>
)
