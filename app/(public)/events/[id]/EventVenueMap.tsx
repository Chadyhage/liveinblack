'use client'

import { useState } from 'react'
import { MapPin, ExternalLink, Maximize2 } from 'lucide-react'
import SlideOverModal from '@/app/components/ui/SlideOverModal'
import Button from '@/app/components/ui/Button'

export default function EventVenueMap({ address }: { address: string }) {
  const [openModal, setOpenModal] = useState(false)
  const encoded = encodeURIComponent(address)
  const osmEmbedSrc = `https://www.openstreetmap.org/export/embed.html?layer=mapnik&marker=&query=${encoded}`
  const googleMapsHref = `https://www.google.com/maps/search/?api=1&query=${encoded}`
  const osmMapsHref = `https://www.openstreetmap.org/search?query=${encoded}`

  return (
    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
      {/* Carte OpenStreetMap intégrée directement */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: 280,
          borderRadius: 16,
          overflow: 'hidden',
          border: '1px solid var(--border)',
          background: 'var(--surface-2)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        }}
      >
        <iframe
          title={`Carte OpenStreetMap — ${address}`}
          src={osmEmbedSrc}
          style={{ border: 0, width: '100%', height: '100%' }}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />

        <button
          type="button"
          onClick={() => setOpenModal(true)}
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            padding: '6px 12px',
            borderRadius: 999,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: '#FFFFFF',
            fontSize: 'var(--font-size-caption-lg)',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
          }}
        >
          <Maximize2 size={13} />
          Plein écran
        </button>
      </div>

      {/* Barre d'action */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <a
          href={googleMapsHref}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            minHeight: 38,
            padding: '0 16px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            borderRadius: 'var(--radius-control)',
            background: 'var(--primary)',
            color: 'var(--primary-ink)',
            fontSize: 'var(--font-size-footnote-lg)',
            fontWeight: 750,
            textDecoration: 'none',
          }}
        >
          <MapPin size={14} />
          Ouvrir dans Google Maps
        </a>

        <a
          href={osmMapsHref}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            minHeight: 38,
            padding: '0 14px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            borderRadius: 'var(--radius-control)',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            fontSize: 'var(--font-size-footnote)',
            fontWeight: 650,
            textDecoration: 'none',
          }}
        >
          <ExternalLink size={14} />
          OpenStreetMap
        </a>
      </div>

      {/* Modal Plein écran */}
      {openModal && (
        <SlideOverModal onClose={() => setOpenModal(false)} ariaLabel="Carte interactive OpenStreetMap" contentStyle={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 'var(--font-size-body)', fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{address}</p>
          </div>
          <div style={{ position: 'relative', width: '100%', height: 'calc(100vh - 120px)', background: 'var(--surface)' }}>
            <iframe
              title={`Carte Plein Écran — ${address}`}
              src={osmEmbedSrc}
              style={{ border: 0, width: '100%', height: '100%' }}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
          <div style={{ display: 'flex', gap: 10, padding: 14, background: 'var(--surface-2)' }}>
            <a
              href={googleMapsHref}
              target="_blank"
              rel="noopener noreferrer"
              style={{ flex: 1, minHeight: 38, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, background: 'var(--primary)', color: 'var(--primary-ink)', fontSize: 'var(--font-size-footnote-lg)', fontWeight: 800, textDecoration: 'none', textAlign: 'center' }}
            >
              Ouvrir dans Google Maps
            </a>
            <Button
              variant="secondary"
              onClick={() => setOpenModal(false)}
              style={{ minHeight: 38, padding: '0 16px', borderRadius: 10, fontSize: 'var(--font-size-footnote-lg)', fontWeight: 700 }}
            >
              Fermer
            </Button>
          </div>
        </SlideOverModal>
      )}
    </div>
  )
}
