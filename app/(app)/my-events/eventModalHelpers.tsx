'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/app/components/ui'

export interface EventPlaceOption {
  id: string
  type: string
  price: number
}

interface EventPlacesResponse {
  ok?: boolean
  event?: {
    places?: EventPlaceOption[]
  }
}

export function normalizeEventPlaces(data: EventPlacesResponse | null | undefined): EventPlaceOption[] {
  if (!data?.ok || !Array.isArray(data.event?.places)) return []
  return data.event.places.map((place) => ({ id: place.id, type: place.type, price: place.price }))
}

export function LoadingPlacesModal({ onClose, ariaLabel }: { onClose: () => void; ariaLabel: string }) {
  return (
    <Modal onClose={onClose} hideClose ariaLabel={ariaLabel} contentStyle={{ width: 40, height: 40, background: 'none', border: 'none', boxShadow: 'none', padding: 0, borderRadius: 0, maxHeight: 'none', overflowY: 'visible' }}>
      <div style={{ position: 'relative', width: 40, height: 40 }} aria-label={ariaLabel}>
        <svg width={40} height={40} viewBox="0 0 24 24" style={{ display: 'inline-block' }} aria-hidden="true">
          <circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={3} />
          <path d="M21 12a9 9 0 00-9-9" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round">
            <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite" />
          </path>
        </svg>
      </div>
    </Modal>
  )
}

export function useEventPlaces(eventId: string) {
  const [places, setPlaces] = useState<EventPlaceOption[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/organizer-events/${eventId}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        setPlaces(normalizeEventPlaces(data))
      })
      .catch(() => {
        if (!cancelled) setPlaces([])
      })
    return () => {
      cancelled = true
    }
  }, [eventId])

  return places
}
