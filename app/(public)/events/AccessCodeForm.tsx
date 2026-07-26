'use client'

import { useState } from 'react'
import { Button, Input } from '@/app/components/ui'

export default function AccessCodeForm() {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!code.trim() || loading) return
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/events/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await response.json().catch(() => null) as { eventId?: string; error?: string } | null
      if (response.ok && data?.eventId) {
        window.location.assign(`/events/${encodeURIComponent(data.eventId)}`)
        return
      }
      setError(response.status === 429 ? 'Trop de tentatives. Réessaie dans quelques minutes.' : 'Code invalide ou déjà utilisé.')
    } catch {
      setError('Connexion impossible. Réessaie.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section id="access-code" style={{ marginTop: 18, maxWidth: 520, padding: 18, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>Tu as un code d&apos;accès ?</p>
      <p style={{ margin: '5px 0 12px', color: 'var(--text-muted)', fontSize: 12.5 }}>Saisis le code reçu pour ouvrir ton événement privé.</p>
      <form onSubmit={submit} style={{ display: 'flex', gap: 8 }}>
        <Input
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="CODE D'ACCÈS"
          aria-label="Code d'accès à un événement privé"
          aria-invalid={Boolean(error)}
          invalid={Boolean(error)}
          disabled={loading}
          maxLength={64}
          style={{ flex: 1, minWidth: 0, borderRadius: 10, background: 'var(--obsidian)', fontSize: 13.5, textTransform: 'uppercase' }}
        />
        <Button
          type="submit"
          variant="primary"
          disabled={loading || !code.trim()}
          loading={loading}
          loadingText="Vérification…"
          style={{ padding: '11px 16px', borderRadius: 8, background: 'var(--gold)', color: '#181104', textTransform: 'uppercase', letterSpacing: '.03em', fontSize: 13 }}
        >
          Ouvrir
        </Button>
      </form>
      {error && <p role="alert" style={{ margin: '9px 0 0', color: 'var(--pink)', fontSize: 12 }}>{error}</p>}
    </section>
  )
}
