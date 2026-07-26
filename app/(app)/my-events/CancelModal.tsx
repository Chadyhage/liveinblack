'use client'

import { useState } from 'react'
import { Button, Modal, Textarea } from '@/app/components/ui'

// Port du modal de suppression/annulation (MesEvenementsPage.jsx lignes
// ~1826-1896). Contrairement au legacy (qui connaissait le nombre de
// réservations À L'AVANCE, calculé côté client), ce port tente d'abord la
// suppression pure (DELETE) — l'API renvoie 409 `has_bookings` si des
// réservations existent, et c'est CETTE réponse qui fait basculer le modal
// vers le flux d'annulation avec message, jamais une estimation client.
export default function CancelModal({ event, onClose, onDone }: { event: { id: string; name: string }; onClose: () => void; onDone: () => void }) {
  const [phase, setPhase] = useState<'confirm' | 'cancel-with-message'>('confirm')
  const [bookingCount, setBookingCount] = useState(0)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function attemptDelete() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/organizer-events/${event.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (res.status === 409 && data.error === 'has_bookings') {
        setBookingCount(data.bookingCount ?? 0)
        setPhase('cancel-with-message')
        setBusy(false)
        return
      }
      if (!res.ok || !data.ok) {
        setError('La suppression a échoué — réessaie.')
        setBusy(false)
        return
      }
      onDone()
    } catch {
      setError('La suppression a échoué — vérifie ta connexion.')
      setBusy(false)
    }
  }

  async function confirmCancel() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/organizer-events/${event.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError("L'annulation a échoué — réessaie.")
        setBusy(false)
        return
      }
      onDone()
    } catch {
      setError("L'annulation a échoué — vérifie ta connexion.")
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose} maxWidth={520}>
        <h2 style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 14px' }}>
          {phase === 'confirm' ? "Supprimer l’événement ?" : "Annuler l’événement ?"}
        </h2>

        {phase === 'confirm' ? (
          <>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, margin: '0 0 18px' }}>
              Cette action est irréversible s&rsquo;il n&rsquo;y a aucune réservation. S&rsquo;il y en a déjà, l&rsquo;événement sera annulé et remboursé plutôt que supprimé.
            </p>
            {error && <p style={{ color: 'var(--pink)', fontSize: 12.5, marginBottom: 12 }}>{error}</p>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Button
                variant="secondary"
                onClick={onClose}
                disabled={busy}
                style={{ padding: '12px 0', borderRadius: 12 }}
              >
                Annuler
              </Button>
              <Button
                variant="danger"
                onClick={attemptDelete}
                disabled={busy}
                loading={busy}
                loadingText="Suppression…"
                style={{ padding: '12px 0', borderRadius: 8, background: 'var(--pink)', textTransform: 'uppercase', letterSpacing: '.03em' }}
              >
                Supprimer
              </Button>
            </div>
          </>
        ) : (
          <>
            <div style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.08)', marginBottom: 16 }}>
              <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.75)', lineHeight: 1.7, margin: 0 }}>
                {bookingCount} réservation(s) {bookingCount > 1 ? 'ont' : 'a'} déjà eu lieu. En confirmant, les acheteurs sont remboursés automatiquement (carte bancaire) ou placés dans ta liste de remboursement mobile money — tu ne touches jamais l&rsquo;argent d&rsquo;un événement annulé, et chaque acheteur est prévenu par e-mail.
              </p>
            </div>
            <label style={{ display: 'grid', gap: 6, marginBottom: 6 }}>
              <span style={{ font: '600 11px Inter, sans-serif', color: 'rgba(255,255,255,0.55)' }}>Message aux acheteurs (optionnel)</span>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 500))}
                rows={4}
                placeholder="Ex : Nous sommes au regret de vous annoncer l'annulation de cet événement pour cause de force majeure. Le remboursement du prix de votre billet vous sera versé automatiquement (hors frais de service, non remboursables)."
                style={{ background: '#0b0c12' }}
              />
            </label>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', margin: '0 0 14px' }}>
              Ce message s&rsquo;affichera sur le billet de chaque acheteur, accompagné d&rsquo;un bouton de contact support. ({message.length}/500)
            </p>
            <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, margin: '0 0 18px' }}>
              L&rsquo;événement sera marqué <strong style={{ color: '#fff' }}>Annulé</strong> et retiré du site, mais restera accessible aux personnes ayant un billet pour qu&rsquo;elles voient ce message.
            </p>
            {error && <p style={{ color: 'var(--pink)', fontSize: 12.5, marginBottom: 12 }}>{error}</p>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 10 }}>
              <Button
                variant="secondary"
                onClick={() => setPhase('confirm')}
                disabled={busy}
                style={{ padding: '12px 0', borderRadius: 12 }}
              >
                Retour
              </Button>
              <Button
                variant="danger"
                onClick={confirmCancel}
                disabled={busy}
                loading={busy}
                loadingText="Annulation en cours…"
                style={{ padding: '12px 0', borderRadius: 8, background: 'var(--pink)', textTransform: 'uppercase', letterSpacing: '.03em' }}
              >
                Confirmer l&apos;annulation
              </Button>
            </div>
          </>
        )}
    </Modal>
  )
}
