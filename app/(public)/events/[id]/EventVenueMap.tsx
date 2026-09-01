'use client'

import { useState } from 'react'
import { MapPin } from 'lucide-react'
import SlideOverModal from '@/app/components/ui/SlideOverModal'
import Button from '@/app/components/ui/Button'

// Carte interactive du lieu (retour client) — pas de lib de cartographie
// (Leaflet/Mapbox) dans ce repo, donc simple <iframe> OpenStreetMap. L'objet
// Event (lib/models/Event.ts) n'a pas de champs lat/lon, uniquement du texte
// (location/city/region) : on utilise donc systématiquement l'embed de
// recherche par adresse OSM plutôt qu'un bbox par coordonnées.
export default function EventVenueMap({ address }: { address: string }) {
  const [open, setOpen] = useState(false)
  const encoded = encodeURIComponent(address)
  const osmEmbedSrc = `https://www.openstreetmap.org/export/embed.html?layer=mapnik&marker=&query=${encoded}`
  const googleMapsHref = `https://www.google.com/maps/search/?api=1&query=${encoded}`

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        onClick={() => setOpen(true)}
        style={{ marginTop: 12, padding: '9px 16px', fontSize: 'var(--font-size-footnote-lg)', display: 'inline-flex', alignItems: 'center', gap: 7 }}
      >
        <MapPin size={15} strokeWidth={2} aria-hidden="true" />
        Voir la carte
      </Button>

      {open && (
        <SlideOverModal onClose={() => setOpen(false)} ariaLabel="Localisation de l’événement" contentStyle={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 'var(--font-size-body)', fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{address}</p>
          </div>
          <div style={{ position: 'relative', width: '100%', aspectRatio: '4/3', background: 'var(--surface)' }}>
            <iframe
              title={`Carte — ${address}`}
              src={osmEmbedSrc}
              style={{ border: 0, width: '100%', height: '100%' }}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
          {/* Boutons pleine largeur, fond plein contrastant sur le fond de la
              carte (retour client : la croix de fermeture seule était trop
              discrète sur un fond de carte) — "Fermer" reste le pattern
              établi (Modal.tsx/SlideOverModal.tsx) mais rendu ici en texte +
              fond plein plutôt qu'en simple icône. */}
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
              onClick={() => setOpen(false)}
              style={{ flex: 1, borderRadius: 10, fontSize: 'var(--font-size-callout)', fontWeight: 800 }}
            >
              Fermer
            </Button>
          </div>
        </SlideOverModal>
      )}
    </>
  )
}
