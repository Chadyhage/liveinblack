'use client'

import { useState } from 'react'
import { Button, ConfirmDialog } from '@/app/components/ui'

// Bouton "lien sécurisé" pour un acheteur SANS compte (Politique Annulation/
// Remboursement §2) — visible uniquement sur un billet invité (ticket.guestName),
// un titulaire de compte utilise déjà /profile/billets (TicketWallet.tsx).
// Le token de l'URL EST la preuve de possession (POST /api/refund-link/[token]) —
// aucune donnée d'éligibilité (report/assurance) n'est chargée côté page pour
// garder getTicketDisplay() inchangé : le serveur tranche et renvoie un
// message clair si la demande n'est pas éligible, plutôt que de dupliquer la
// logique d'éligibilité côté client.
const ERROR_MESSAGES: Record<string, string> = {
  order_not_paid: "Ce billet n'a pas de paiement associé — rien à rembourser.",
  already_requested: 'Un remboursement a déjà été demandé pour ce billet.',
  free_ticket_not_refundable: 'Ce billet est gratuit, il n’y a rien à rembourser.',
  event_cancelled_cash_pickup_created: "L'événement est annulé : le dossier de retrait est créé automatiquement pour l'acheteur.",
  xof_required: 'Ce remboursement suit le parcours de lancement au Bénin, en FCFA uniquement.',
  not_eligible: "Ce billet n'est pas éligible à un remboursement pour le moment.",
  refund_window_closed: 'La fenêtre pour demander un remboursement est passée.',
  ticket_already_checked_in: 'Ce billet a déjà été scanné à l’entrée — impossible de le rembourser.',
  invalid_token: 'Lien invalide ou expiré.',
  ticket_not_found: 'Billet introuvable.',
  revoked: 'Ce billet a été révoqué.',
}

export default function TicketRefundRequestButton({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'err'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  async function handleClick() {
    setState('busy')
    setMessage(null)
    try {
      const res = await fetch(`/api/refund-link/${encodeURIComponent(token)}`, { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.ok) {
        setState('done')
      } else {
        setState('err')
        setMessage(ERROR_MESSAGES[data?.error] || 'Demande impossible pour le moment — réessaie plus tard.')
      }
    } catch {
      setState('err')
      setMessage('Connexion impossible — réessaie.')
    }
  }

  if (state === 'done') {
    return <p style={{ fontSize: 'var(--font-size-footnote-lg)', color: 'var(--primary)', textAlign: 'center', margin: 0 }}>Remboursement demandé — un email de confirmation te sera envoyé.</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
      <Button
        variant="secondary"
        onClick={() => setConfirmOpen(true)}
        disabled={state === 'busy'}
        loading={state === 'busy'}
        loadingText="Envoi…"
        style={{ width: '100%', padding: '13px 0', borderRadius: 12, fontSize: 'var(--font-size-body)', fontWeight: 700 }}
      >
        Demander un remboursement
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        title="Demander un remboursement ?"
        body="Ta demande sera transmise immédiatement pour ce billet. Tu recevras ensuite la confirmation par email si elle est acceptée."
        confirmLabel="Confirmer"
        confirmVariant="primary"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false)
          void handleClick()
        }}
      />
      {message && <p style={{ fontSize: 'var(--font-size-caption-lg)', color: 'var(--danger)', textAlign: 'center', margin: 0 }}>{message}</p>}
    </div>
  )
}
