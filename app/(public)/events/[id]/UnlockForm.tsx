'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

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
        <input
          type="text"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase())
            setError(null)
          }}
          placeholder="Code d'accès"
          style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: `1px solid ${error ? 'var(--pink)' : 'var(--border-strong)'}`, background: 'var(--surface)', color: 'var(--text)', textTransform: 'uppercase' }}
          required
        />
        <button type="submit" disabled={loading} style={{ padding: '11px 18px', borderRadius: 10, border: 'none', background: 'var(--teal-solid)', color: '#04120e', fontWeight: 700, cursor: 'pointer' }}>
          {loading ? '…' : 'Valider'}
        </button>
      </form>
      {error && (
        <p role="alert" aria-live="assertive" style={{ marginTop: 10, fontSize: 13, color: 'var(--pink)' }}>
          {error}
        </p>
      )}
    </div>
  )
}
