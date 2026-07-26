'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input } from '@/app/components/ui'

// Seule partie interactive de la page détail (phase 2 est en lecture seule) —
// nécessaire pour vérifier le code d'un événement privé sans jamais l'exposer
// au client (voir app/api/events/[id]/unlock, lib/server/eventUnlock.ts).
export default function UnlockForm({ eventId }: { eventId: string }) {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await fetch(`/api/events/${eventId}/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    setLoading(false)
    if (!res.ok) {
      setError('Code invalide.')
      return
    }
    router.refresh()
  }

  return (
    <div style={{ maxWidth: 340, margin: '18px auto 0' }}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8 }}>
        <Input
          type="text"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase())
            setError(null)
          }}
          placeholder="Code d'accès"
          invalid={Boolean(error)}
          style={{ flex: 1, borderRadius: 10, background: 'var(--surface)', textTransform: 'uppercase' }}
          required
        />
        <Button type="submit" variant="primary" disabled={loading} loading={loading} style={{ padding: '11px 18px', borderRadius: 10 }}>
          Valider
        </Button>
      </form>
      {error && (
        <p role="alert" aria-live="assertive" style={{ marginTop: 10, fontSize: 13, color: 'var(--pink)' }}>
          {error}
        </p>
      )}
    </div>
  )
}
