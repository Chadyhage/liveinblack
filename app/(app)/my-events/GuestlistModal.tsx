'use client'

import { useCallback, useEffect, useState } from 'react'
import { fmtMoney } from '@/lib/shared/money'
import { Button, Input, Label, Modal, Select, SlideOverModal, Spinner } from '@/app/components/ui'

interface EventPlace {
  id: string
  type: string
  price: number
}

interface GuestlistModalProps {
  event: { id: string; name: string; places: EventPlace[]; currency: 'EUR' | 'XOF' }
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

export default function GuestlistModal({ event, onClose }: GuestlistModalProps) {
  const [entries, setEntries] = useState<GuestlistEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [placeId, setPlaceId] = useState(event.places[0]?.id ?? '')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<{ ticketCode: string; guestName: string } | null>(null)
  const [waSentCode, setWaSentCode] = useState<string | null>(null)

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

  function askRemoveGuest(ticketCode: string, guestName: string) {
    setConfirmRemove({ ticketCode, guestName })
  }

  async function doConfirmRemoveGuest() {
    if (!confirmRemove) return
    const { ticketCode } = confirmRemove
    setConfirmRemove(null)
    await handleRemoveGuest(ticketCode)
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
    <SlideOverModal onClose={onClose} ariaLabel="Liste des invités" padded>
        <div style={{ marginBottom: 16, paddingRight: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth={1.5}>
              <circle cx="9" cy="7" r="4" />
              <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" />
              <line x1="19" y1="8" x2="19" y2="14" />
              <line x1="16" y1="11" x2="22" y2="11" />
            </svg>
            <p style={{ fontSize: 14, fontWeight: 400, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '3.2px', fontFamily: 'var(--font-display), sans-serif', margin: 0 }}>Guestlist</p>
          </div>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, margin: 0 }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            <div>
              <Label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)', marginBottom: 6 }}>
                Nom de l&apos;invité
              </Label>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex : Aminata Koné"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 10,
                  padding: '10px 12px',
                  color: '#fff',
                  fontSize: 14,
                }}
              />
            </div>
            {event.places.length > 0 && (
              <div>
                <Label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)', marginBottom: 6 }}>
                  Type de place
                </Label>
                <Select
                  value={placeId}
                  onChange={(value) => setPlaceId(value)}
                  options={event.places.map((place) => ({
                    value: place.id,
                    label: `${place.type} — normalement ${fmtMoney(place.price, event.currency)}, offert à l'invité`,
                  }))}
                />
              </div>
            )}
          </div>
          {error && <p style={{ fontSize: 12, color: 'rgba(220,100,100,0.9)', margin: 0 }}>{error}</p>}
          <Button
            variant="primary"
            onClick={handleAddGuest}
            disabled={adding || !name.trim()}
            loading={adding}
            loadingText="Ajout…"
            fullWidth
            style={{
              padding: 12,
              borderRadius: 3,
              border: 'none',
              background: adding || !name.trim() ? 'rgba(255,255,255,0.07)' : 'var(--teal-solid)',
              color: adding || !name.trim() ? 'rgba(255,255,255,0.35)' : 'var(--primary-ink)',
              fontSize: 14,
              fontWeight: 500,
              textTransform: 'none',
              letterSpacing: 'normal',
            }}
          >
            Ajouter à la guestlist
          </Button>
        </div>

        {/* Guest list */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0' }}>
            <Spinner size={16} />
          </div>
        ) : entries.length === 0 ? (
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '12px 0', lineHeight: 1.6 }}>
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
                      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: '2px 0 0' }}>{entry.place}</p>
                    </div>
                    <span
                      style={{
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
                    <Button
                      variant="secondary"
                      onClick={() => copyGuestLink(entry)}
                      style={{
                        flex: 1,
                        padding: 9,
                        borderRadius: 10,
                        background: copiedCode === entry.ticketCode ? 'var(--teal-solid)' : 'rgba(255,255,255,0.08)',
                        border: copiedCode === entry.ticketCode ? 'none' : '1px solid rgba(255,255,255,0.14)',
                        color: copiedCode === entry.ticketCode ? 'var(--primary-ink)' : 'rgba(255,255,255,0.9)',
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {copiedCode === entry.ticketCode ? 'Copié' : 'Copier le lien'}
                    </Button>
                    <a
                      href={waLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        setWaSentCode(entry.ticketCode)
                        setTimeout(() => {
                          setWaSentCode((prev) => (prev === entry.ticketCode ? null : prev))
                        }, 2000)
                      }}
                      style={{
                        flex: 1,
                        padding: 9,
                        borderRadius: 10,
                        textAlign: 'center',
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 5,
                        background: 'rgba(34,197,94,0.14)',
                        border: '1px solid rgba(34,197,94,0.35)',
                        color: '#22c55e',
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.33 4.95L2.05 22l5.29-1.39a9.9 9.9 0 004.7 1.2h.01c5.46 0 9.91-4.45 9.91-9.9C22 6.45 17.5 2 12.04 2zm5.8 14.15c-.24.68-1.4 1.3-1.93 1.38-.5.08-1.12.11-1.8-.11-.42-.13-.95-.31-1.63-.6-2.87-1.24-4.74-4.13-4.88-4.32-.14-.19-1.17-1.55-1.17-2.96 0-1.4.74-2.09 1-2.38.26-.28.57-.35.76-.35.19 0 .38 0 .55.01.18.01.41-.07.64.49.24.58.81 2 .88 2.14.07.14.12.31.02.5-.09.19-.14.31-.28.48-.14.16-.29.36-.42.49-.14.14-.28.29-.12.57.16.28.71 1.17 1.52 1.9 1.05.94 1.93 1.23 2.21 1.37.28.14.44.12.6-.07.16-.19.68-.79.87-1.06.19-.28.37-.23.62-.14.26.09 1.63.77 1.91.91.28.14.47.21.54.33.07.12.07.68-.17 1.36z" />
                      </svg>
                      {waSentCode === entry.ticketCode ? 'Ouvert' : 'WhatsApp'}
                    </a>
                    {!entry.checkedInAt && (
                      <Button
                        variant="danger"
                        onClick={() => askRemoveGuest(entry.ticketCode, guestName)}
                        title="Retirer"
                        aria-label="Retirer"
                        style={{
                          padding: '9px 12px',
                          borderRadius: 10,
                          background: 'rgba(224,90,170,0.14)',
                          border: '1px solid rgba(224,90,170,0.55)',
                          color: '#ff9ed2',
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        ×
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, margin: 0 }}>
          Chaque invité reçoit un billet réel (gratuit) à ce lien — il le présente à l&apos;entrée, le videur le scanne comme n&apos;importe quel billet.
        </p>

      {/* Confirmation de retrait */}
      {confirmRemove && (
        <Modal onClose={() => setConfirmRemove(null)} maxWidth={440} hideClose ariaLabel="Retirer un invité" contentStyle={{ padding: 22, borderRadius: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 17, fontWeight: 700, color: '#fff', margin: 0 }}>Retirer cet invité ?</p>
            <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.55 }}>
              <strong style={{ color: '#fff' }}>{confirmRemove.guestName}</strong> n&apos;aura plus accès à ce billet. Tu pourras le réinviter à tout moment.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
              <Button
                variant="secondary"
                onClick={() => setConfirmRemove(null)}
                style={{ flex: 1, padding: '11px', borderRadius: 12, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.9)', fontSize: 13.5, fontWeight: 600 }}
              >
                Annuler
              </Button>
              <Button
                variant="danger"
                onClick={doConfirmRemoveGuest}
                style={{ flex: 1.4, padding: '11px', borderRadius: 3, background: 'var(--pink)', border: '1px solid transparent', color: '#fff', fontSize: 13.5, fontWeight: 500, textTransform: 'none', letterSpacing: 'normal' }}
              >
                Retirer
              </Button>
            </div>
        </Modal>
      )}
    </SlideOverModal>
  )
}
