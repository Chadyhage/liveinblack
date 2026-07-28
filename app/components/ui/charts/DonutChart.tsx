'use client'

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

// Wrapper fin autour de Recharts (seule dépendance de chart du projet, voir
// CLAUDE.md — exception explicitement acceptée par le client pour ce module,
// le reste du design system reste 100% inline-style/zéro-dépendance).

export interface DonutChartSlice {
  label: string
  value: number
  color: string
}

export function DonutChart({ data, size = 160 }: { data: DonutChartSlice[]; size?: number }) {
  const total = data.reduce((sum, d) => sum + d.value, 0)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
      <div style={{ width: size, height: size, flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="100%" paddingAngle={data.length > 1 ? 2 : 0} stroke="none">
              {data.map((slice) => (
                <Cell key={slice.label} fill={slice.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
              itemStyle={{ color: 'var(--text)' }}
              formatter={(value, name) => [`${value} (${total ? Math.round((Number(value) / total) * 100) : 0}%)`, name]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 120 }}>
        {data.map((slice) => (
          <div key={slice.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: slice.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1 }}>{slice.label}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{slice.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
