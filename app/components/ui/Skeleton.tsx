'use client'

import type { CSSProperties } from 'react'

export interface SkeletonProps {
  width?: number | string
  height?: number | string
  radius?: number | string
  style?: CSSProperties
}

// Primitive de chargement générique — voir CLAUDE.md, aucun état de
// chargement de l'app ne doit rester en texte "Chargement…" seul. Animation
// shimmer en pure CSS (@keyframes injecté une seule fois par instance via
// <style>, coût négligeable vu la taille des blocs concernés).
export function Skeleton({ width = '100%', height = 14, radius = 6, style }: SkeletonProps) {
  return (
    <span
      style={{
        display: 'block',
        width,
        height,
        borderRadius: radius,
        background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.09) 37%, rgba(255,255,255,0.04) 63%)',
        backgroundSize: '400% 100%',
        animation: 'lb-skeleton-shimmer 1.4s ease infinite',
        ...style,
      }}
    />
  )
}

const cardStyle: CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }

export function SkeletonRow({ columns = 3 }: { columns?: number }) {
  return (
    <div style={{ ...cardStyle, padding: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
      <Skeleton width={30} height={30} radius={99} style={{ flexShrink: 0 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        <Skeleton width="40%" height={12} />
        <Skeleton width="65%" height={10} />
      </div>
      {Array.from({ length: Math.max(0, columns - 1) }).map((_, i) => (
        <Skeleton key={i} width={62} height={10} style={{ flexShrink: 0 }} />
      ))}
    </div>
  )
}

export function SkeletonCard() {
  return (
    <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Skeleton width="50%" height={14} />
      <Skeleton width="90%" height={10} />
      <Skeleton width="75%" height={10} />
    </div>
  )
}

export function SkeletonList({ rows = 5, columns = 3 }: { rows?: number; columns?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} columns={columns} />
      ))}
    </div>
  )
}
