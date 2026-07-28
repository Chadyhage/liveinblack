'use client'

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'

// Voir DonutChart.tsx pour le contexte de la dépendance Recharts.

export interface LineChartPoint {
  date: string
  value: number
}

export function LineChartCard({ data, formatDate, height = 180 }: { data: LineChartPoint[]; formatDate: (iso: string) => string; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            interval="preserveStartEnd"
            tick={{ fill: 'var(--text-faint)', fontSize: 10 }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
            itemStyle={{ color: 'var(--teal)' }}
            labelStyle={{ color: 'var(--text-muted)' }}
            labelFormatter={(v) => (typeof v === 'string' ? formatDate(v) : v)}
            formatter={(value) => [`${value} compte${Number(value) > 1 ? 's' : ''}`, 'Nouveaux']}
          />
          <Line type="monotone" dataKey="value" stroke="var(--teal)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
