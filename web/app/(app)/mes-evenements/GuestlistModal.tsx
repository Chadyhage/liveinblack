'use client'

import { useCallback, useEffect, useState } from 'react'

interface EventPlace {
  id: string
  type: string
  price: number
}

interface GuestlistModalProps {
  event: { id: string; name: string; places: EventPlace[] }
  onClose: () => void
}

interface GuestlistEntry {
  ticketCode: string
  place: string
  guestName: string | null
  bookedAt: string | null
  checkedInAt: string | null
  ticketUrl: string
}

interface GuestlistListResponse {
  ok: true
  entries: GuestlistEntry[]
}

interface GuestlistAddResponse {
  ok: true
  entry: GuestlistEntry
}

interface ApiErrorResponse {
  error?: string
}

const ADD_ERROR_MESSAGES: Record<string, string> = {
  guest_name_required: "Le nom de l'invité est requis.",
  place_not_found: 'Type de place introuvable.',
  sold_out: 'Complet pour ce type de place.',
  event_cancelled: 'Cet événement a été annulé.',
  forbidden: "Tu n'as pas accès à cette guestlist.",
  event_not_found: 'Événement introuvable.',
}

const REMOVE_ERROR_MESSAGES: Record<string, string> = {
  ticket_not_found: 'Billet introuvable.',
  already_checked_in: 'Cet invité est déjà arrivé, impossible de le retirer.',
  forbidden: "Tu n'as pas accès à cette guestlist.",
  event_not_found: 'Événement introuvable.',
}

function Spinner({ size = 14, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'inline-block' }} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={3} />
      <path d="M21 12a9 9 0 00-9-9" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite" />
      </path>
    </svg>
  )
}

export default function GuestlistModal({ event, onClose }: GuestlistModalProps) {
  const [entries, setEntries] = useState<GuestlistEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [placeId, setPlaceId] = useState(event.places[0]?.id ?? '')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  const loadEntries = useCallback(async () => {
    try {
      const res = await fetch(`/api/organizer-events/${event.id}/guestlist`)
      const data = (await res.json().catch(() => null)) as (GuestlistListResponse & ApiErrorResponse) | null
      if (res.ok && data?.ok) {
        setEntries(data.entries)
      }
    } finally {
      setLoading(false)
    }
  }, [event.id])

  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  async function handleAddGuest() {
    const trimmed = name.trim()
    if (!trimmed || adding) return
    setAdding(true)
    setError('')
    try {
      const res = await fetch(`/api/organizer-events/${event.id}/guestlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeId, guestName: trimmed }),
      })
      const data = (await res.json().catch(() => null)) as (GuestlistAddResponse & ApiErrorResponse) | null
      if (!res.ok || !data?.ok) {
        setError(ADD_ERROR_MESSAGES[data?.error ?? ''] ?? "Impossible d'ajouter cet invité.")
        return
      }
      setEntries((prev) => [...prev, data.entry])
      setName('')
    } catch {
      setError("Impossible d'ajouter cet invité.")
    } finally {
      setAdding(false)
    }
  }

  async function handleRemoveGuest(ticketCode: string) {
    setError('')
    try {
      const res = await fetch(`/api/organizer-events/${event.id}/guestlist`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketCode }),
      })
      const data = (await res.json().catch(() => null)) as ApiErrorResponse & { ok?: boolean }
      if (!res.ok || !data?.ok) {
        setError(REMOVE_ERROR_MESSAGES[data?.error ?? ''] ?? 'Impossible de retirer cet invité.')
        return
      }
      setEntries((prev) => prev.filter((entry) => entry.ticketCode !== ticketCode))
    } catch {
      setError('Impossible de retirer cet invité.')
    }
  }

  async function copyGuestLink(entry: GuestlistEntry) {
    try {
      await navigator.clipboard.writeText(entry.ticketUrl)
      setCopiedCode(entry.ticketCode)
      setTimeout(() => {
        setCopiedCode((prev) => (prev === entry.ticketCode ? null : prev))
      }, 2000)
    } catch {
      // Clipboard access denied — silently ignore, matching legacy behavior.
    }
  }

  const arrivedCount = entries.filter((entry) => entry.checkedInAt).length

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(3,4,8,0.72)', backdropFilter: 'blur(8px)' }} onClick={onClose} />
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 560,
          maxHeight: '88vh',
          overflowY: 'auto',
          background: '#12131c',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 20,
          padding: 22,
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Fermer"
          style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 0, color: 'rgba(255,255,255,0.5)', fontSize: 26, cursor: 'pointer', lineHeight: 1 }}
        >
          ×
        </button>

        <div style={{ marginBottom: 16, paddingRight: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth={1.5}>
              <circle cx="9" cy="7" r="4" />
              <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" />
              <line x1="19" y1="8" x2="19" y2="14" />
              <line x1="16" y1="11" x2="22" y2="11" />
            </svg>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 20, fontWeight: 700, color: 'rgba(255,255,255,0.93)', margin: 0 }}>Guestlist</p>
          </div>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, margin: 0 }}>
            Invitations pour <span style={{ color: 'var(--teal)' }}>{event.name}</span>
            {entries.length > 0 && (
              <>
                {' '}
                · {entries.length} invité{entries.length > 1 ? 's' : ''} · {arrivedCount} arrivé{arrivedCount > 1 ? 's' : ''}
              </>
            )}
          </p>
        </div>

        {/* Add guest form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 14, marginBottom: 16 }}>
          <div>
            <label style={{ display: 'block', fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)', marginBottom: 6 }}>
              Nom de l&apos;invité
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex : Aminata Koné"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 10,
                padding: '10px 12px',
                color: '#fff',
                fontFamily: 'Inter, sans-serif',
                fontSize: 14,
              }}
            />
          </div>
          {event.places.length > 0 && (
            <div>
              <label style={{ display: 'block', fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)', marginBottom: 6 }}>
                Type de place
              </label>
              <select
                value={placeId}
                onChange={(e) => setPlaceId(e.target.value)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 10,
                  padding: '10px 12px',
                  color: '#fff',
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                {event.places.map((place) => (
                  <option key={place.id} value={place.id}>
                    {place.type} (offert, {place.price})
                  </option>
                ))}
              </select>
            </div>
          )}
          {error && <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(220,100,100,0.9)', margin: 0 }}>{error}</p>}
          <button
            onClick={handleAddGuest}
            disabled={adding || !name.trim()}
            style={{
              padding: 12,
              borderRadius: 10,
              border: 'none',
              cursor: adding || !name.trim() ? 'not-allowed' : 'pointer',
              background: adding || !name.trim() ? 'rgba(255,255,255,0.07)' : '#3ed6b5',
              color: adding || !name.trim() ? 'rgba(255,255,255,0.35)' : '#04120e',
              fontFamily: 'Inter, sans-serif',
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {adding ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                <Spinner size={14} />
                Ajout…
              </span>
            ) : (
              'Ajouter à la guestlist'
            )}
          </button>
        </div>

        {/* Guest list */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0' }}>
            <Spinner size={16} />
          </div>
        ) : entries.length === 0 ? (
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '12px 0', lineHeight: 1.6 }}>
            Pas encore d&apos;invité — ajoute le premier ci-dessus.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {entries.map((entry) => {
              const guestName = entry.guestName || 'Invité'
              const waLink = `https://wa.me/?text=${encodeURIComponent(`Salut ${guestName} ! Voici ton entrée pour ${event.name}: ${entry.ticketUrl}`)}`
              return (
                <div key={entry.ticketCode} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <p
                        style={{
                          fontFamily: 'Inter, sans-serif',
                          fontSize: 15,
                          fontWeight: 600,
                          color: 'rgba(255,255,255,0.92)',
                          margin: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {guestName}
                      </p>
                      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: '2px 0 0' }}>{entry.place}</p>
                    </div>
                    <span
                      style={{
                        fontFamily: 'Inter, sans-serif',
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        flexShrink: 0,
                        color: entry.checkedInAt ? 'var(--teal)' : 'rgba(255,255,255,0.45)',
                      }}
                    >
                      {entry.checkedInAt ? 'Arrivé' : 'En attente'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button
                      onClick={() => copyGuestLink(entry)}
                      style={{
                        flex: 1,
                        padding: 9,
                        borderRadius: 10,
                        cursor: 'pointer',
                        background: copiedCode === entry.ticketCode ? '#3ed6b5' : 'rgba(255,255,255,0.08)',
                        border: copiedCode === entry.ticketCode ? 'none' : '1px solid rgba(255,255,255,0.14)',
                        color: copiedCode === entry.ticketCode ? '#04120e' : 'rgba(255,255,255,0.9)',
                        fontFamily: 'Inter, sans-serif',
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {copiedCode === entry.ticketCode ? 'Copié' : 'Copier le lien'}
                    </button>
                    <a
                      href={waLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        flex: 1,
                        padding: 9,
                        borderRadius: 10,
                        textAlign: 'center',
                        textDecoration: 'none',
                        background: 'rgba(34,197,94,0.14)',
                        border: '1px solid rgba(34,197,94,0.35)',
                        color: '#22c55e',
                        fontFamily: 'Inter, sans-serif',
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      WhatsApp
                    </a>
                    {!entry.checkedInAt && (
                      <button
                        onClick={() => handleRemoveGuest(entry.ticketCode)}
                        title="Retirer"
                        aria-label="Retirer"
                        style={{
                          padding: '9px 12px',
                          borderRadius: 10,
                          cursor: 'pointer',
                          background: 'rgba(224,90,170,0.14)',
                          border: '1px solid rgba(224,90,170,0.55)',
                          color: '#ff9ed2',
                          fontFamily: 'Inter, sans-serif',
                          fontSize: 12,
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, margin: 0 }}>
          Chaque invité reçoit un billet réel (gratuit) à ce lien — il le présente à l&apos;entrée, le videur le scanne comme n&apos;importe quel billet.
        </p>
      </div>
    </div>
  )
}
