'use client'

import type { ReactNode } from 'react'
import { ArrowLeft, MoreVertical, Search } from 'lucide-react'
import { Button } from '@/app/components/ui'

function HeaderIconButton({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <Button
      variant="secondary"
      title={title}
      aria-label={title}
      onClick={onClick}
      style={{
        position: 'relative',
        width: 44,
        height: 44,
        minWidth: 44,
        minHeight: 44,
        padding: 0,
        borderRadius: '50%',
        fontSize: 14,
      }}
    >
      {children}
    </Button>
  )
}

export default function ThreadHeader({
  label,
  subtitle,
  isDesktop,
  onBack,
  onPrimaryClick,
  onOpenSearch,
  avatar,
}: {
  label: string
  subtitle: string
  isDesktop: boolean
  onBack: () => void
  onPrimaryClick: () => void
  onOpenSearch: () => void
  avatar: ReactNode
}) {
  return (
    <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
      <Button
        variant="ghost"
        onClick={onPrimaryClick}
        style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', minWidth: 0, fontWeight: 400, padding: 0 }}
      >
        {!isDesktop ? (
          <span
            onClick={(e) => {
              e.stopPropagation()
              onBack()
            }}
            style={{ color: 'var(--text-faint)', fontSize: 18, marginRight: 4, display: 'inline-flex', alignItems: 'center' }}
          >
            <ArrowLeft size={18} />
          </span>
        ) : null}
        {avatar}
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</h2>
          <p style={{ fontSize: 11, color: subtitle === 'En ligne' ? '#22c55e' : 'var(--text-faint)', margin: 0 }}>{subtitle}</p>
        </div>
      </Button>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <HeaderIconButton title="Rechercher" onClick={onOpenSearch}>
          <Search size={16} />
        </HeaderIconButton>
        <HeaderIconButton title="Plus d’options" onClick={onPrimaryClick}>
          <MoreVertical size={18} />
        </HeaderIconButton>
      </div>
    </div>
  )
}
