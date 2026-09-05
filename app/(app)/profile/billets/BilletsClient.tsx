'use client'

import { useState } from 'react'
import TicketWalletPanel, { type TicketWalletGroupView } from '../TicketWallet'
import { Button, Card, Input, Modal, Textarea } from '@/app/components/ui'
import { fmtMoney } from '@/lib/shared/money'

type RefundCaseView = {
  id: string
  eventId: string
  orderId: string
  cause: string
  flow: string
  status: string
  amountXOF: number
  refundPoint: { id: string; name?: string | null; address?: string | null } | null
  pickupCode: string | null
  codeLast4?: string | null
  individualDestinationType?: string | null
  originalPaymentDestinationMasked?: string | null
  declaredReference?: string | null
  declaredChannel?: string | null
  proofs?: unknown[]
  contestReason?: string | null
  createdAt?: string | null
}

const STATUS_LABELS: Record<string, string> = {
  code_active: 'Retrait au point',
  switched_individual: 'Remboursement individuel',
  individual_generated: 'Remboursement individuel',
  info_required: 'Infos requises',
  to_refund: 'À rembourser',
  declared: 'Remboursement déclaré',
  reimbursed: 'Remboursé',
  contested: 'Contesté',
  technical_failure: 'Action support requise',
}

const CAUSE_LABELS: Record<string, string> = {
  event_cancelled: 'Événement annulé',
  postponed_declined: 'Report refusé',
  cancellation_option: 'Option d’annulation',
}

export default function BilletsClient({ groups, currentUserId, initialRefunds }: { groups: TicketWalletGroupView[]; currentUserId: string; initialRefunds: RefundCaseView[] }) {
  return (
    <>
      <RefundCasesPanel initialRefunds={initialRefunds} />
      <TicketWalletPanel groups={groups} currentUserId={currentUserId} />
    </>
  )
}

function RefundCasesPanel({ initialRefunds }: { initialRefunds: RefundCaseView[] }) {
  const [refunds, setRefunds] = useState(initialRefunds)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [destinationCase, setDestinationCase] = useState<RefundCaseView | null>(null)
  const [contestCase, setContestCase] = useState<RefundCaseView | null>(null)
  const [destinationType, setDestinationType] = useState<'bank_account' | 'verified_mobile_money'>('bank_account')
  const [destinationDetails, setDestinationDetails] = useState('')
  const [contestReason, setContestReason] = useState('')

  async function refresh() {
    const res = await fetch('/api/refunds')
    const data = await res.json().catch(() => null)
    if (res.ok && Array.isArray(data?.refunds)) setRefunds(data.refunds)
  }

  async function postAction(refundId: string, path: string, body?: unknown) {
    setBusyId(refundId)
    setMessage(null)
    try {
      const res = await fetch(`/api/refunds/${refundId}/${path}`, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'failed')
      await refresh()
      setMessage('Dossier mis à jour.')
    } catch {
      setMessage("L'action n'a pas pu être enregistrée. Réessaie ou contacte le support.")
    } finally {
      setBusyId(null)
    }
  }

  if (refunds.length === 0) return null

  return (
    <section className="lb-dashboard-page" style={{ paddingBottom: 0 }}>
      <header className="lb-dashboard-page-header" style={{ marginBottom: 16 }}>
        <p style={{ margin: '0 0 6px', color: 'var(--primary)', fontSize: 'var(--font-size-body-sm)', letterSpacing: '3.2px', textTransform: 'uppercase', fontFamily: 'var(--font-display), sans-serif' }}>Remboursements</p>
        <h2 className="lb-dashboard-title" style={{ fontSize: 'var(--font-size-title-2)' }}>Mes dossiers actifs</h2>
        <p className="lb-dashboard-description">Retrait espèces par code, bascule individuelle irréversible, preuve et contestation restent suivis ici.</p>
      </header>
      {message && <p style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>{message}</p>}
      <div style={{ display: 'grid', gap: 12, marginBottom: 24 }}>
        {refunds.map((refund) => (
          <Card key={refund.id} style={{ padding: 16, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <p style={{ margin: 0, color: 'var(--gold)', fontSize: 'var(--font-size-caption)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 800 }}>{CAUSE_LABELS[refund.cause] || refund.cause}</p>
                <h3 style={{ margin: '4px 0 0', color: 'var(--text)', fontSize: 'var(--font-size-title-4)' }}>{fmtMoney(refund.amountXOF, 'XOF')}</h3>
              </div>
              <span style={{ alignSelf: 'start', padding: '5px 10px', borderRadius: 999, background: 'var(--primary-a10)', color: 'var(--primary)', fontSize: 'var(--font-size-caption-lg)', fontWeight: 800 }}>
                {STATUS_LABELS[refund.status] || refund.status}
              </span>
            </div>

            {refund.flow === 'cash_pickup' && refund.status === 'code_active' && (
              <div style={{ padding: 12, borderRadius: 12, background: 'var(--fill-secondary)', display: 'grid', gap: 8 }}>
                <p style={{ margin: 0, color: 'var(--text)', fontWeight: 800 }}>Code de retrait : {refund.pickupCode || `•••• ${refund.codeLast4 || ''}`}</p>
                <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.5 }}>{refund.refundPoint?.name || 'Point de remboursement'} · {refund.refundPoint?.address || 'Adresse communiquée par support'}</p>
                <p style={{ margin: 0, color: 'var(--text-faint)', fontSize: 'var(--font-size-caption-lg)', lineHeight: 1.5 }}>Toute personne avec ce code peut retirer l’argent. Si tu ne peux pas te déplacer, le basculement vers un remboursement individuel annule définitivement ce code.</p>
                <Button variant="secondary" disabled={busyId === refund.id} onClick={() => void postAction(refund.id, 'switch-individual')}>
                  Je ne peux pas me déplacer
                </Button>
              </div>
            )}

            {refund.flow === 'individual' && (
              <div style={{ padding: 12, borderRadius: 12, background: 'var(--fill-secondary)', display: 'grid', gap: 8 }}>
                <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {refund.individualDestinationType === 'locked_mobile_money'
                    ? `Destination verrouillée sur le Mobile Money d'origine : ${refund.originalPaymentDestinationMasked || 'numéro masqué'}.`
                    : 'Ajoute les coordonnées vérifiées de ton compte pour que l’organisateur puisse effectuer le remboursement.'}
                </p>
                {refund.individualDestinationType !== 'locked_mobile_money' && ['switched_individual', 'individual_generated', 'info_required'].includes(refund.status) && (
                  <Button variant="secondary" onClick={() => setDestinationCase(refund)}>Fournir mes coordonnées</Button>
                )}
              </div>
            )}

            {refund.status === 'declared' && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button variant="primary" disabled={busyId === refund.id} onClick={() => void postAction(refund.id, 'confirm-received')}>J’ai reçu le remboursement</Button>
                <Button variant="secondary" onClick={() => setContestCase(refund)}>Je n’ai pas reçu le remboursement</Button>
              </div>
            )}
            {refund.declaredReference && <p style={{ margin: 0, color: 'var(--text-faint)', fontSize: 'var(--font-size-caption-lg)' }}>Référence déclarée : {refund.declaredReference} · {refund.declaredChannel || 'canal non précisé'}</p>}
            {refund.proofs?.map((proof, index) => {
              const item = proof && typeof proof === 'object' ? proof as { url?: unknown; label?: unknown } : null
              const url = typeof item?.url === 'string' ? item.url : ''
              const label = typeof item?.label === 'string' ? item.label : 'Preuve téléversée'
              return url ? <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>{label}</a> : null
            })}
          </Card>
        ))}
      </div>

      {destinationCase && (
        <Modal
          onClose={() => setDestinationCase(null)}
          title="Coordonnées de remboursement"
          subtitle="Le compte doit t’appartenir. Les informations sont chiffrées côté serveur."
          ariaLabel="Fournir les coordonnées de remboursement"
          actions={
            <>
              <Button variant="secondary" onClick={() => setDestinationCase(null)}>Annuler</Button>
              <Button
                variant="primary"
                disabled={!destinationDetails.trim() || busyId === destinationCase.id}
                onClick={() => {
                  const id = destinationCase.id
                  setDestinationCase(null)
                  void postAction(id, 'destination', { destinationType, details: destinationDetails })
                  setDestinationDetails('')
                }}
              >
                Envoyer
              </Button>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 10 }}>
            <select value={destinationType} onChange={(e) => setDestinationType(e.target.value as typeof destinationType)} style={{ minHeight: 42, borderRadius: 10, background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)', padding: '0 10px' }}>
              <option value="bank_account">Compte bancaire / RIB</option>
              <option value="verified_mobile_money">Mobile Money vérifié</option>
            </select>
            <Textarea value={destinationDetails} onChange={(e) => setDestinationDetails(e.target.value)} placeholder="Nom du titulaire, banque/opérateur, IBAN/RIB ou numéro, justificatif si nécessaire…" rows={5} />
          </div>
        </Modal>
      )}

      {contestCase && (
        <Modal
          onClose={() => setContestCase(null)}
          title="Signaler un remboursement non reçu"
          subtitle="Vérifie d’abord le compte ou le numéro prévu, puis indique ce qui bloque."
          ariaLabel="Contester un remboursement déclaré"
          actions={
            <>
              <Button variant="secondary" onClick={() => setContestCase(null)}>Annuler</Button>
              <Button
                variant="danger"
                disabled={!contestReason.trim() || busyId === contestCase.id}
                onClick={() => {
                  const id = contestCase.id
                  setContestCase(null)
                  void postAction(id, 'contest', { reason: contestReason })
                  setContestReason('')
                }}
              >
                Contester
              </Button>
            </>
          }
        >
          <Input value={contestReason} onChange={(e) => setContestReason(e.target.value)} placeholder="Ex : référence inconnue, mauvais numéro, montant non reçu…" />
        </Modal>
      )}
    </section>
  )
}
