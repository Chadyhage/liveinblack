'use client'

import { useState } from 'react'

export default function EventShareButton({ eventName }: { eventName: string }) {
  const [copied, setCopied] = useState(false)

  async function share() {
    const payload = {
      title: `${eventName} — LIVEINBLACK`,
      text: `Découvre ${eventName} sur LIVEINBLACK`,
      url: window.location.href,
    }

    try {
      if (navigator.share) await navigator.share(payload)
      else {
        await navigator.clipboard.writeText(payload.url)
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      }
    } catch {
      // Le partage natif peut être annulé sans que ce soit une erreur.
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      aria-label={`Partager ${eventName}`}
      style={{ minHeight: 38, padding: '8px 13px', borderRadius: 999, border: '1px solid rgba(255,255,255,.24)', background: 'rgba(4,4,11,.72)', backdropFilter: 'blur(10px)', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
    >
      {copied ? 'Lien copié' : 'Partager'}
    </button>
  )
}
