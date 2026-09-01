'use client'

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import styles from './LineChartCard.module.css'

// Voir DonutChart.tsx pour le contexte de la dépendance Recharts.

export interface LineChartPoint {
  date: string
  value: number
}

export function LineChartCard({ data, formatDate, height = 180 }: { data: LineChartPoint[]; formatDate: (iso: string) => string; height?: number }) {
  return (
    <div className={styles.root} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 12, right: 8, left: 8, bottom: 0 }}>
          <defs><linearGradient id="agent-signups-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={0.3}/><stop offset="92%" stopColor="var(--primary)" stopOpacity={0}/></linearGradient></defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 7" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            interval="preserveStartEnd"
            tick={{ fill: 'var(--text-faint)', fontSize: 'var(--font-size-caption-2)' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{ background: 'var(--modal-surface)', border: '1px solid var(--border-strong)', borderRadius: 14, boxShadow: 'none', fontSize: 'var(--font-size-footnote)' }}
            itemStyle={{ color: 'var(--primary)' }}
            labelStyle={{ color: 'var(--text-muted)' }}
            cursor={{ stroke: 'var(--focus-ring-color)', strokeWidth: 1 }}
            labelFormatter={(v) => (typeof v === 'string' ? formatDate(v) : v)}
            formatter={(value) => [`${value} compte${Number(value) > 1 ? 's' : ''}`, 'Nouveaux']}
          />
          <Area type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={3} fill="url(#agent-signups-area)" dot={false} activeDot={{ r: 5, fill: 'var(--primary)', stroke: 'var(--background)', strokeWidth: 3 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
