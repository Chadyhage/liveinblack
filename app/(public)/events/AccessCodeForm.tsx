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
    <section id="access-code" className="lb-access-code">
      <p className="lb-tool-label">Accès privé</p>
      <p className="lb-tool-help">Saisis le code reçu pour ouvrir ton événement.</p>
      <form onSubmit={submit} className="lb-search-panel__controls">
        <Input
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="CODE D'ACCÈS"
          aria-label="Code d'accès à un événement privé"
          aria-invalid={Boolean(error)}
          invalid={Boolean(error)}
          disabled={loading}
          maxLength={64}
          style={{ flex: 1, minWidth: 0, minHeight: 52, background: 'var(--obsidian)', fontSize: 14, textTransform: 'uppercase' }}
        />
        <Button
          type="submit"
          variant="primary"
          disabled={loading || !code.trim()}
          loading={loading}
          loadingText="Vérification…"
          style={{ minHeight: 52, padding: '12px 22px', background: 'var(--primary)', color: 'var(--primary-ink)', textTransform: 'none', letterSpacing: 'normal', fontSize: 14 }}
        >
          Ouvrir
        </Button>
      </form>
      {error && <p role="alert" style={{ margin: '9px 0 0', color: 'var(--pink)', fontSize: 12 }}>{error}</p>}
    </section>
  )
}
