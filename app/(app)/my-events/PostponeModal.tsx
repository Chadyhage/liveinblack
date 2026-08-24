'use client'

import { useState } from 'react'
import { Button, Input, Label, Modal } from '@/app/components/ui'

// Port du modal de report (MesEvenementsPage.jsx lignes ~1797-1825).
export interface PostponeModalEvent {
  id: string
  name: string
  date: string
  dateDisplay: string
  time: string
}

export default function PostponeModal({ event, onClose, onDone }: { event: PostponeModalEvent; onClose: () => void; onDone: () => void }) {
  const [date, setDate] = useState('')
  const [time, setTime] = useState(event.time || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    if (!date) {
      setError('Choisis une nouvelle date.')
      return
    }
    const newDateTime = new Date(`${date}T${time || '00:00'}`)
    if (Number.isNaN(newDateTime.getTime()) || newDateTime.getTime() <= Date.now()) {
      setError('La nouvelle date doit être dans le futur.')
      return
    }
    if (date === event.date && time === event.time) {
      setError("La nouvelle date/heure doit être différente de l'actuelle.")
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/organizer-events/${event.id}/postpone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, time }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError('Le report a échoué — réessaie.')
        setBusy(false)
        return
      }
      onDone()
    } catch {
      setError('Le report a échoué — vérifie ta connexion.')
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose} maxWidth={520} ariaLabel="Reporter l’événement">
        <h2 style={{ fontSize: 14, fontWeight: 400, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '3.2px', fontFamily: 'var(--font-display), sans-serif', margin: '0 0 10px' }}>Reporter l&rsquo;événement ?</h2>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, margin: '0 0 14px' }}>
          Les billets déjà vendus restent valables pour la nouvelle date — personne n&rsquo;est remboursé. Chaque acheteur est prévenu par e-mail (ancienne et nouvelle date).
        </p>
        <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.5)', margin: '0 0 16px' }}>
          Date actuelle : <span style={{ textDecoration: 'line-through' }}>{event.dateDisplay || event.date}</span> · {event.time}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <Label style={{ font: '600 11px var(--font-open-sans)', color: 'rgba(255,255,255,0.55)', margin: 0 }}>Nouvelle date</Label>
            <Input
              type="date"
              value={date}
              min={new Date().toISOString().split('T')[0]}
              onChange={(e) => setDate(e.target.value)}
              style={{ padding: '11px 12px', borderRadius: 10, background: '#0b0c12', color: '#fff' }}
            />
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <Label style={{ font: '600 11px var(--font-open-sans)', color: 'rgba(255,255,255,0.55)', margin: 0 }}>Heure</Label>
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              style={{ padding: '11px 12px', borderRadius: 10, background: '#0b0c12', color: '#fff' }}
            />
          </div>
        </div>
        {error && <p style={{ color: 'var(--pink)', fontSize: 12.5, marginBottom: 12 }}>{error}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 10 }}>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={busy}
            style={{ padding: '12px 0', borderRadius: 12 }}
          >
            Retour
          </Button>
          <Button
            variant="primary"
            onClick={confirm}
            disabled={busy}
            loading={busy}
            loadingText="Report en cours…"
            style={{ padding: '12px 0', borderRadius: 3, background: 'var(--gold)', color: 'var(--obsidian)', textTransform: 'none', letterSpacing: 'normal' }}
          >
            Confirmer le report
          </Button>
        </div>
    </Modal>
  )
}
