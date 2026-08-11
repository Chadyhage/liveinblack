import { LineChartCard } from 'liveinblack-ui'
import { Stage } from './_stage'

const DATA = Array.from({ length: 14 }, (_, i) => ({
  date: `2026-07-${String(i + 1).padStart(2, '0')}`,
  value: Math.round(8 + Math.sin(i / 2) * 5 + i * 1.2),
}))

const fmtDay = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7)

export const SignupsLast14Days = () => (
  <Stage>
    <LineChartCard data={DATA} formatDate={fmtDay} />
  </Stage>
)
