'use client'

import { useState } from 'react'

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
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(3,4,8,0.72)', backdropFilter: 'blur(8px)' }} onClick={onClose} />
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 480,
          maxHeight: '88vh',
          overflowY: 'auto',
          background: '#12131c',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 20,
          padding: 22,
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
        }}
      >
        <button onClick={onClose} aria-label="Fermer" style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 0, color: 'rgba(255,255,255,0.5)', fontSize: 26, cursor: 'pointer', lineHeight: 1 }}>
          ×
        </button>
        <h2 style={{ font: '700 22px Inter, sans-serif', color: '#fff', margin: '0 0 10px' }}>Reporter l&rsquo;événement ?</h2>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, margin: '0 0 14px' }}>
          Les billets déjà vendus restent valables pour la nouvelle date — personne n&rsquo;est remboursé. Chaque acheteur est prévenu par e-mail (ancienne et nouvelle date).
        </p>
        <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.5)', margin: '0 0 16px' }}>
          Date actuelle : <span style={{ textDecoration: 'line-through' }}>{event.dateDisplay || event.date}</span> · {event.time}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ font: '600 11px Inter, sans-serif', color: 'rgba(255,255,255,0.55)' }}>Nouvelle date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ padding: '11px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: '#0b0c12', color: '#fff' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ font: '600 11px Inter, sans-serif', color: 'rgba(255,255,255,0.55)' }}>Heure</span>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              style={{ padding: '11px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: '#0b0c12', color: '#fff' }}
            />
          </label>
        </div>
        {error && <p style={{ color: 'var(--pink)', fontSize: 12.5, marginBottom: 12 }}>{error}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 10 }}>
          <button
            onClick={onClose}
            disabled={busy}
            style={{ padding: '12px 0', borderRadius: 12, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
          >
            Retour
          </button>
          <button
            onClick={confirm}
            disabled={busy}
            style={{ padding: '12px 0', borderRadius: 12, border: 'none', background: 'var(--gold)', color: 'var(--obsidian)', fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}
          >
            {busy ? 'Report en cours…' : 'Confirmer le report'}
          </button>
        </div>
      </div>
    </div>
  )
}
