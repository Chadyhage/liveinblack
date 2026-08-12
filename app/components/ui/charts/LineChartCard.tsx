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
          <defs><linearGradient id="agent-signups-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#b8f34a" stopOpacity={0.3}/><stop offset="92%" stopColor="#b8f34a" stopOpacity={0}/></linearGradient></defs>
          <CartesianGrid stroke="rgba(255,255,255,.075)" strokeDasharray="3 7" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            interval="preserveStartEnd"
            tick={{ fill: 'rgba(245,245,247,.32)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{ background: 'rgba(30,31,35,.96)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 14, boxShadow: '0 16px 42px rgba(0,0,0,.38)', fontSize: 12 }}
            itemStyle={{ color: '#b8f34a' }}
            labelStyle={{ color: 'var(--text-muted)' }}
            cursor={{ stroke: 'rgba(184,243,74,.28)', strokeWidth: 1 }}
            labelFormatter={(v) => (typeof v === 'string' ? formatDate(v) : v)}
            formatter={(value) => [`${value} compte${Number(value) > 1 ? 's' : ''}`, 'Nouveaux']}
          />
          <Area type="monotone" dataKey="value" stroke="#b8f34a" strokeWidth={3} fill="url(#agent-signups-area)" dot={false} activeDot={{ r: 5, fill: '#b8f34a', stroke: '#1a1c15', strokeWidth: 3 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
