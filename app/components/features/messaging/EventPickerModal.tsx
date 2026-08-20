'use client'

import NextImage from 'next/image'
import { useEffect, useState } from 'react'
import { Button, Input } from '@/app/components/ui'
import { ModalShell } from './MessagingModals'

interface EventSearchResult {
  id: string
  name: string
  date: string
  city: string | null
  image: string | null
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(118,118,128,.16)',
  color: 'var(--text)',
  fontSize: 14,
  marginBottom: 10,
  fontFamily: 'inherit',
}

const rowButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  textAlign: 'left',
  padding: '7px 4px',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
}

export default function EventPickerModal({
  onShare,
  onPoll,
  onClose,
  searchEvents,
}: {
  onShare: (eventId: string) => void
  onPoll: (eventId: string) => void
  onClose: () => void
  searchEvents: (query: string) => Promise<EventSearchResult[]>
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<EventSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const trimmedQuery = query.trim()

  useEffect(() => {
    if (!trimmedQuery) return
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        setResults(await searchEvents(trimmedQuery))
      } finally {
        setSearching(false)
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [searchEvents, trimmedQuery])

  const visibleResults = trimmedQuery ? results : []

  return (
    <ModalShell title="Partager un événement" onClose={onClose} wide>
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un événement…" style={inputStyle} autoFocus />
      {searching ? <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '0 0 8px' }}>Recherche…</p> : null}
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {!searching && trimmedQuery && visibleResults.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Aucun événement trouvé.</p>
        ) : null}
        {visibleResults.map((ev) => (
          <div key={ev.id} style={{ ...rowButtonStyle, alignItems: 'center', display: 'flex', gap: 10 }}>
            <div style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: 'var(--surface-2)' }}>
              {ev.image ? <NextImage src={ev.image} alt="" width={44} height={44} style={{ objectFit: 'cover' }} /> : null}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ev.name}
              </p>
              <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: 0 }}>{[ev.date, ev.city].filter(Boolean).join(' · ')}</p>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <Button variant="secondary" size="sm" onClick={() => onShare(ev.id)} style={{ fontSize: 11.5, padding: '6px 10px', whiteSpace: 'nowrap' }}>
                Partager
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onPoll(ev.id)} style={{ fontSize: 11.5, padding: '6px 10px', whiteSpace: 'nowrap' }}>
                Sondage
              </Button>
            </div>
          </div>
        ))}
      </div>
    </ModalShell>
  )
}
