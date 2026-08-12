'use client'

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import styles from './DonutChart.module.css'

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
    <div className={styles.root}>
      <div className={styles.chart} style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius="67%" outerRadius="96%" paddingAngle={data.length > 1 ? 5 : 0} cornerRadius={10} stroke="none">
              {data.map((slice) => (
                <Cell key={slice.label} fill={slice.color} />
              ))}
            </Pie>
            <text x="50%" y="46%" textAnchor="middle" dominantBaseline="middle" className={styles.total}>{total}</text>
            <text x="50%" y="59%" textAnchor="middle" dominantBaseline="middle" className={styles.totalLabel}>comptes</text>
            <Tooltip
              contentStyle={{ background: 'rgba(30,31,35,.96)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 14, boxShadow: '0 16px 42px rgba(0,0,0,.38)', fontSize: 12 }}
              itemStyle={{ color: 'var(--text)' }}
              cursor={false}
              formatter={(value, name) => [`${value} (${total ? Math.round((Number(value) / total) * 100) : 0}%)`, name]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className={styles.legend}>
        {data.map((slice) => (
          <div key={slice.label} className={styles.legendItem}>
            <span className={styles.dot} style={{ background: slice.color }} />
            <span className={styles.name}>{slice.label}</span>
            <strong>{slice.value}</strong>
            <small>{total ? Math.round((slice.value / total) * 100) : 0}%</small>
          </div>
        ))}
      </div>
    </div>
  )
}
