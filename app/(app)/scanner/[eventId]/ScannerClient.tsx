'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { fmtMoney } from '@/lib/shared/money'
import CameraScanner from './CameraScanner'
import { Button, Card, Input, Label, Modal } from '@/app/components/ui'
import {
  checkinErrorMessage,
  findEditableLine,
  groupByCategory,
  orderErrorMessage,
  resolveScanInput,
  resolveTicketCodeForLookup,
  serviceSessionKey,
  type MenuItemView,
  type OrderItem,
  type OrderItemStatus,
} from './scannerUtils'
import styles from './ScannerClient.module.css'

// Port de src/pages/ScannerPage.jsx (outil staff : porte + bar). Ce composant
// ne parle QU'aux routes HTTP déjà construites (/api/tickets/checkin et les
// huit routes /api/event-orders/*) — jamais aux fonctions de lib/server/
// directement. Les types ci-dessous sont donc des copies volontaires (pas des
// imports) des formes JSON exactes renvoyées par ces routes, exactement comme
// CommanderClient.tsx.

export interface ScannerClientProps {
  eventId: string
  eventName: string
  currency: string
  menu: MenuItemView[]
  rank: number
}

interface CheckinTicketView {
  ticketCode: string
  eventId: string
  eventName: string
  eventDate: string
  place: string
  totalPrice: number
  currency: string
  preorders: { name: string; price: number; qty: number; showLabel: string | null; showInfo: string | null }[]
  guestName: string | null
  holderName: string | null
}

// ─────────────────────────── contrats de réponse HTTP ───────────────────────

interface ApiErrorResponse {
  error: string
}
interface CheckinSuccessResponse {
  ok: true
  alreadyCheckedIn: boolean
  pointAwarded: boolean
  ticket: CheckinTicketView
}
interface ListSuccessResponse {
  ok: true
  items: OrderItem[]
}
interface AddSuccessResponse {
  ok: true
  item: OrderItem
}
type ServeSuccessResponse = { ok: true; alreadyServed: true } | { ok: true; alreadyServed?: false; item: OrderItem }
interface PaySuccessResponse {
  ok: true
  total: number
  itemCount: number
}
type CancelSuccessResponse = { ok: true; noop: true } | { ok: true; noop?: false; item: OrderItem }
type UpdateQuantitySuccessResponse = { ok: true; noop: true } | { ok: true; noop?: false; item: OrderItem }
type RemoveSuccessResponse = { ok: true; noop: true } | { ok: true; noop?: false }

async function parseJson<T>(res: Response): Promise<T | ApiErrorResponse> {
  try {
    const data: unknown = await res.json()
    return data as T | ApiErrorResponse
  } catch {
    return { error: 'bad_response' }
  }
}

const STATUS_META: Record<OrderItemStatus, { label: string; color: string; bg: string }> = {
  sent: { label: 'En cours', color: 'var(--gold)', bg: 'rgba(184,243,74,0.14)' },
  served: { label: 'Servi', color: 'var(--primary)', bg: 'rgba(184, 243, 74,0.16)' },
  cancelled: { label: 'Annulé', color: 'var(--pink)', bg: 'rgba(224,90,170,0.2)' },
}

let toastSeq = 0

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-muted)',
  margin: '0 0 12px',
}

// <label> visuellement masqué mais lu par les lecteurs d'écran — le
// placeholder seul disparaît dès que l'utilisateur commence à taper.
const SR_ONLY_STYLE: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0,0,0,0)',
  whiteSpace: 'nowrap',
  border: 0,
}

type Mode = 'scan' | 'service'

export default function ScannerClient({ eventId, eventName, currency, menu, rank }: ScannerClientProps) {
  const [mode, setMode] = useState<Mode>('scan')
  const [scanning, setScanning] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const [checkinBusy, setCheckinBusy] = useState(false)
  const [confirmPayOpen, setConfirmPayOpen] = useState(false)
  const [checkinError, setCheckinError] = useState<string | null>(null)
  const [checkinErrorCode, setCheckinErrorCode] = useState<string | undefined>(undefined)
  const [checkinResult, setCheckinResult] = useState<CheckinSuccessResponse | null>(null)

  const [ticketCode, setTicketCode] = useState<string | null>(null)
  // Miroir synchrone de `ticketCode`, lu par fetchOrders() pour rejeter les
  // réponses en retard : une réponse arrivée pour un billet qui n'est plus le
  // billet affiché (staff a switché via resetToScan pendant qu'un
  // serve/pay/cancel/poll était encore en vol) ne doit jamais écraser les
  // items du nouveau billet. `ticketCode` (state) ne suffit pas seul car sa
  // mise à jour n'est visible dans les closures qu'après un re-render ; ce
  // ref est assigné de façon synchrone au même endroit que chaque
  // setTicketCode.
  const ticketCodeRef = useRef<string | null>(null)
  const [items, setItems] = useState<OrderItem[]>([])
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [confirmRemoveItem, setConfirmRemoveItem] = useState<{ menuItem: MenuItemView; item: OrderItem } | null>(null)
  const [cancellingItemId, setCancellingItemId] = useState<string | null>(null)
  const [cancelDrafts, setCancelDrafts] = useState<Record<string, string>>({})

  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([])
  const [notice, setNotice] = useState<string | null>(null)

  const pushToast = useCallback((message: string) => {
    const id = ++toastSeq
    setToasts((prev) => [...prev, { id, message }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500)
  }, [])

  const showNotice = useCallback((message: string) => {
    setNotice(message)
    setTimeout(() => setNotice((prev) => (prev === message ? null : prev)), 5000)
  }, [])

  const fetchOrders = useCallback(
    async (code: string) => {
      try {
        const res = await fetch(`/api/event-orders/${eventId}?ticketId=${encodeURIComponent(code)}`, { cache: 'no-store' })
        const data = await parseJson<ListSuccessResponse>(res)
        // Garde de péremption : si le staff a changé de billet (ou l'a quitté)
        // pendant que cette requête était en vol, `ticketCodeRef.current` a
        // déjà changé — on jette la réponse plutôt que d'écraser les items du
        // billet actuellement affiché avec ceux d'un billet précédent.
        if (ticketCodeRef.current !== code) return
        if (res.ok && 'ok' in data && data.ok) {
          setItems(data.items)
        }
        // Échec de lecture en tâche de fond : pas de toast (spammerait toutes
        // les 4s en cas de coupure réseau prolongée) — le prochain tick réessaiera.
      } catch {
        // idem — coupure réseau ponctuelle, silencieuse.
      }
    },
    [eventId]
  )

  // Polling toutes les 4s UNIQUEMENT en mode service, nettoyé au retour en
  // mode scan / démontage / changement de billet (même convention que
  // CommanderClient.tsx). Jamais pour le rang 1 (contrôle entrée pur) : ce
  // rôle ne voit jamais la carte commande, inutile de faire tourner le
  // polling en tâche de fond pour lui (voir séparation des interfaces, D4).
  useEffect(() => {
    if (mode !== 'service' || !ticketCode || rank < 2) return
    const interval = setInterval(() => {
      void fetchOrders(ticketCode)
    }, 4000)
    return () => clearInterval(interval)
  }, [mode, ticketCode, fetchOrders, rank])

  const enterServiceMode = useCallback(
    async (code: string) => {
      ticketCodeRef.current = code
      setTicketCode(code)
      setItems([])
      setCancellingItemId(null)
      setCancelDrafts({})
      setMode('service')
      try {
        sessionStorage.setItem(serviceSessionKey(eventId), code)
      } catch {
        // sessionStorage indisponible (navigation privée stricte...) — pas
        // bloquant, juste pas de reprise possible après rechargement.
      }

      // Best-effort : matérialise précommandes/inclus AVANT le premier fetch
      // pour qu'ils apparaissent immédiatement plutôt qu'au prochain tick de
      // polling — ne bloque jamais l'entrée en mode service si ça échoue
      // (rang ≥ 1 déjà garanti par la gate de page, donc un échec ici ne peut
      // venir que d'un souci réseau ponctuel).
      try {
        await fetch('/api/event-orders/materialize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId, ticketId: code }),
        })
      } catch {
        // best-effort — voir commentaire ci-dessus.
      }

      await fetchOrders(code)
    },
    [eventId, fetchOrders]
  )

  const performCheckin = useCallback(
    async (rawValue: string) => {
      const value = rawValue.trim()
      if (!value) return
      setCheckinBusy(true)
      setCheckinError(null)
      try {
        const input = resolveScanInput(value)
        const res = await fetch('/api/tickets/checkin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...input, eventId }),
        })
        const data = await parseJson<CheckinSuccessResponse>(res)
        if (!res.ok || !('ok' in data) || !data.ok) {
          const code = 'error' in data ? data.error : undefined
          setCheckinErrorCode(code)
          setCheckinError(checkinErrorMessage(code))
          return
        }
        setCheckinErrorCode(undefined)
        setCheckinResult(data)
        await enterServiceMode(data.ticket.ticketCode)
      } catch {
        setCheckinErrorCode(undefined)
        setCheckinError('Connexion impossible — réessaie.')
      } finally {
        setCheckinBusy(false)
      }
    },
    [enterServiceMode, eventId]
  )

  const handleScanValue = useCallback(
    (value: string) => {
      // CameraScanner a déjà arrêté son flux en interne dès qu'il a trouvé un
      // QR (voir CameraScanner.tsx) — `scanning` doit refléter cet état
      // immédiatement (succès OU échec du check-in qui suit), sinon le bouton
      // afficherait encore "Désactiver la caméra" alors que la caméra réelle
      // est déjà coupée.
      setScanning(false)
      // Rôle 'serveur' (rang 2) : ouvre directement la commande du billet,
      // ne valide JAMAIS une entrée (voir resolveTicketCodeForLookup et le
      // garde serveur dans ticketCheckin.ts — un serveur n'est de toute façon
      // plus autorisé à appeler /api/tickets/checkin).
      if (rank === 2) {
        void enterServiceMode(resolveTicketCodeForLookup(value))
        return
      }
      void performCheckin(value)
    },
    [performCheckin, enterServiceMode, rank]
  )

  function resetToScan() {
    ticketCodeRef.current = null
    setMode('scan')
    setTicketCode(null)
    setItems([])
    setCheckinResult(null)
    setCheckinError(null)
    setCheckinErrorCode(undefined)
    setManualCode('')
    setScanning(false)
    setCancellingItemId(null)
    setCancelDrafts({})
    try {
      sessionStorage.removeItem(serviceSessionKey(eventId))
    } catch {
      // voir enterServiceMode — best-effort.
    }
  }

  // Reprise après un rechargement accidentel en plein mode service : un
  // billet mémorisé en sessionStorage pour CET événement rouvre directement
  // le mode service (sans repasser par un check-in, purement une reprise
  // d'affichage) plutôt que de renvoyer le staff en mode scan et lui faire
  // perdre le contexte du billet en cours.
  useEffect(() => {
    let cancelled = false
    async function restore() {
      let savedCode: string | null = null
      try {
        savedCode = sessionStorage.getItem(serviceSessionKey(eventId))
      } catch {
        return
      }
      if (!savedCode || cancelled) return
      await enterServiceMode(savedCode)
    }
    void restore()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restauration au montage uniquement, `enterServiceMode` est stable (deps eventId/fetchOrders).
  }, [])

  async function handleAddItem(menuItem: MenuItemView) {
    if (!ticketCode) return
    const code = ticketCode
    const key = `add:${menuItem.name}`
    setBusyKey(key)
    try {
      const res = await fetch('/api/event-orders/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, ticketId: code, menuItemId: menuItem.name, quantity: 1 }),
      })
      const data = await parseJson<AddSuccessResponse>(res)
      if (!res.ok || !('ok' in data) || !data.ok) {
        pushToast(orderErrorMessage('error' in data ? data.error : undefined))
        return
      }
      // Même garde de péremption que fetchOrders : si le staff a déjà switché
      // vers un autre billet (enterServiceMode a réinitialisé items: []) pendant
      // que cet ajout était en vol, ne pas injecter la ligne du billet précédent
      // dans la liste du nouveau billet affiché.
      if (ticketCodeRef.current !== code) return
      setItems((prev) => [...prev, data.item])
    } catch {
      pushToast('Connexion impossible — réessaie.')
    } finally {
      setBusyKey((prev) => (prev === key ? null : prev))
    }
  }

  // Ajuste la quantité d'une ligne déjà ajoutée par le staff (n'importe
  // lequel — voir findEditableLine) plutôt que de créer une nouvelle ligne à
  // chaque clic sur "Ajouter" pour le même article.
  async function handleSetQuantity(menuItem: MenuItemView, item: OrderItem, quantity: number) {
    const key = `add:${menuItem.name}`
    setBusyKey(key)
    try {
      const res = await fetch('/api/event-orders/update-quantity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, itemId: item.id, quantity }),
      })
      const data = await parseJson<UpdateQuantitySuccessResponse>(res)
      if (!res.ok || !('ok' in data) || !data.ok) {
        pushToast(orderErrorMessage('error' in data ? data.error : undefined))
        return
      }
      if (data.noop) {
        // La ligne a été servie/payée/annulée entre-temps par un autre
        // membre du staff — l'état local optimiste n'est plus fiable.
        showNotice('Cet article a déjà été servi, payé ou annulé — modification impossible.')
        if (ticketCode) void fetchOrders(ticketCode)
        return
      }
      setItems((prev) => prev.map((i) => (i.id === item.id ? data.item : i)))
    } catch {
      pushToast('Connexion impossible — réessaie.')
    } finally {
      setBusyKey((prev) => (prev === key ? null : prev))
    }
  }

  async function handleRemoveLine(menuItem: MenuItemView, item: OrderItem) {
    const key = `add:${menuItem.name}`
    setBusyKey(key)
    try {
      const res = await fetch('/api/event-orders/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, itemId: item.id }),
      })
      const data = await parseJson<RemoveSuccessResponse>(res)
      if (!res.ok || !('ok' in data) || !data.ok) {
        pushToast(orderErrorMessage('error' in data ? data.error : undefined))
        return
      }
      if (data.noop) {
        showNotice('Cet article a déjà été servi, payé ou annulé — modification impossible.')
        if (ticketCode) void fetchOrders(ticketCode)
        return
      }
      setItems((prev) => prev.filter((i) => i.id !== item.id))
    } catch {
      pushToast('Connexion impossible — réessaie.')
    } finally {
      setBusyKey((prev) => (prev === key ? null : prev))
    }
  }

  function handleStep(menuItem: MenuItemView, editable: OrderItem | undefined, delta: number) {
    if (!editable) {
      if (delta > 0) void handleAddItem(menuItem)
      return
    }
    const next = editable.quantity + delta
    if (next <= 0) {
      setConfirmRemoveItem({ menuItem, item: editable })
      return
    }
    else void handleSetQuantity(menuItem, editable, next)
  }

  async function handleServe(item: OrderItem) {
    const key = `serve:${item.id}`
    setBusyKey(key)
    try {
      const res = await fetch('/api/event-orders/serve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, itemId: item.id }),
      })
      const data = await parseJson<ServeSuccessResponse>(res)
      if (!res.ok || !('ok' in data) || !data.ok) {
        pushToast(orderErrorMessage('error' in data ? data.error : undefined))
        return
      }
      if (data.alreadyServed) {
        showNotice('Cet article était déjà marqué comme servi.')
        if (ticketCode) void fetchOrders(ticketCode)
        return
      }
      setItems((prev) => prev.map((i) => (i.id === item.id ? data.item : i)))
    } catch {
      pushToast('Connexion impossible — réessaie.')
    } finally {
      setBusyKey((prev) => (prev === key ? null : prev))
    }
  }

  async function handlePay() {
    if (!ticketCode) return
    setConfirmPayOpen(true)
  }

  async function confirmPay() {
    if (!ticketCode) return
    setBusyKey('pay')
    try {
      const res = await fetch('/api/event-orders/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, ticketId: ticketCode }),
      })
      const data = await parseJson<PaySuccessResponse>(res)
      if (!res.ok || !('ok' in data) || !data.ok) {
        pushToast(orderErrorMessage('error' in data ? data.error : undefined))
        return
      }
      showNotice(`Encaissé : ${fmtMoney(data.total, currency)} (${data.itemCount} article${data.itemCount > 1 ? 's' : ''}).`)
      void fetchOrders(ticketCode)
    } catch {
      pushToast('Connexion impossible — réessaie.')
    } finally {
      setBusyKey((prev) => (prev === 'pay' ? null : prev))
    }
  }

  async function handleCancel(item: OrderItem) {
    const reason = (cancelDrafts[item.id] ?? '').trim()
    // Garde-fou silencieux : inatteignable en usage normal, le bouton
    // "Confirmer" est déjà désactivé tant que le motif est vide (voir le
    // rendu ci-dessous) — pas de toast ici, juste un filet de sécurité.
    if (!reason) return
    const key = `cancel:${item.id}`
    setBusyKey(key)
    try {
      const res = await fetch('/api/event-orders/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, itemId: item.id, reason }),
      })
      const data = await parseJson<CancelSuccessResponse>(res)
      if (!res.ok || !('ok' in data) || !data.ok) {
        pushToast(orderErrorMessage('error' in data ? data.error : undefined))
        return
      }
      if (data.noop) {
        showNotice('Cette ligne était déjà annulée ou payée.')
        if (ticketCode) void fetchOrders(ticketCode)
        return
      }
      setItems((prev) => prev.map((i) => (i.id === item.id ? data.item : i)))
      setCancellingItemId(null)
      setCancelDrafts((prev) => {
        const next = { ...prev }
        delete next[item.id]
        return next
      })
    } catch {
      pushToast('Connexion impossible — réessaie.')
    } finally {
      setBusyKey((prev) => (prev === key ? null : prev))
    }
  }

  const unpaidTotal = items.reduce((sum, i) => {
    if (i.kind === 'preorder' || i.status === 'cancelled' || i.paidAt) return sum
    return sum + i.unitPriceMinor * i.quantity
  }, 0)
  const groups = groupByCategory(menu)

  return (
    <main className={styles.shell}>
      <div className={styles.workspace}>
        <div className={styles.header}>
          <div>
            <Link href="/my-shifts" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', fontSize: 14, color: 'var(--text-faint)', textDecoration: 'none' }}>
              ← Événements
            </Link>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '14px 0 4px' }}>
              {/* Rang 1 (contrôle entrée pur) : jamais "Service sur place",
                  même une fois un billet scanné — il n'a accès qu'au contrôle
                  d'accès, jamais aux commandes (voir D4). */}
              {mode === 'service' && rank >= 2 ? 'Service sur place' : 'Contrôle des entrées'}
            </p>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 6px', letterSpacing: '-0.3px' }}>
              {mode === 'service' && rank >= 2 ? `Billet ${ticketCode}` : mode === 'service' ? 'Billet scanné' : 'Scanner'}
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>{eventName}</p>
          </div>
          {mode === 'service' && (
            <Button type="button" variant="secondary" size="sm" onClick={resetToScan}>
              Scanner un autre billet
            </Button>
          )}
        </div>

        {notice && (
          <div role="status" aria-live="polite" style={{ background: 'rgba(184,243,74,0.12)', border: '1px solid rgba(184,243,74,0.35)', borderRadius: 16, padding: '10px 14px' }}>
            <p style={{ fontSize: 13, color: 'var(--gold)', margin: 0 }}>{notice}</p>
          </div>
        )}

        {mode === 'scan' ? (
          <div className={styles.scanGrid}>
            {checkinError && (
              <div className={styles.fullWidth} role="alert" aria-live="assertive" style={{ background: 'rgba(224,90,170,0.08)', border: '1px solid rgba(224,90,170,0.35)', borderRadius: 16, padding: '10px 14px' }}>
                <p style={{ fontSize: 13, color: 'var(--pink)', margin: checkinErrorCode === 'auth_required' ? '0 0 8px' : 0 }}>{checkinError}</p>
                {checkinErrorCode === 'auth_required' && (
                  <Link href="/login" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--teal)', textDecoration: 'none' }}>
                    Se reconnecter
                  </Link>
                )}
              </div>
            )}

            <Card className={styles.cameraCard} style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Caméra</h2>
                <Button type="button" variant="secondary" size="sm" onClick={() => setScanning((s) => !s)}>
                  {scanning ? 'Désactiver' : 'Activer'} la caméra
                </Button>
              </div>
              <CameraScanner active={scanning} onScan={handleScanValue} />
            </Card>

            <Card className={styles.manualCard} style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
              <h2 style={sectionTitleStyle}>Saisie manuelle</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  // Rôle 'serveur' (rang 2) : ouvre la commande, ne valide
                  // jamais d'entrée — voir handleScanValue.
                  if (rank === 2) {
                    void enterServiceMode(resolveTicketCodeForLookup(manualCode))
                    return
                  }
                  void performCheckin(manualCode)
                }}
                className={styles.manualForm}
              >
                <Label htmlFor="scanner-manual-code" style={SR_ONLY_STYLE}>
                  Code du billet
                </Label>
                <Input
                  id="scanner-manual-code"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="Code du billet"
                  invalid={Boolean(checkinError)}
                  style={{ flex: 1, minWidth: 0, textTransform: 'uppercase' }}
                  autoCapitalize="characters"
                />
                <Button type="submit" variant="primary" size="sm" disabled={checkinBusy || !manualCode.trim()} loading={checkinBusy} loadingText="…">
                  {rank === 2 ? 'Ouvrir' : 'Valider'}
                </Button>
              </form>
            </Card>
          </div>
        ) : (
          <div className={styles.serviceGrid}>
            <div className={styles.servicePrimary}>
            {checkinResult && (
              <Card
                className={styles.resultCard}
                style={{
                  border: checkinResult.alreadyCheckedIn ? '1px solid rgba(184,243,74,0.35)' : '1px solid rgba(184, 243, 74,0.35)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                }}
              >
                {/* Même langage visuel icône-cercle + gros titre que
                    app/ticket/[token]/page.tsx (billet valide/invalide) et les
                    GateScreen de commander/scanner (rôle refusé) — repris ici
                    à une échelle adaptée au contexte de carte inline plutôt
                    qu'à une page plein écran. */}
                <div style={{ textAlign: 'center', marginBottom: 10 }}>
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: '50%',
                      margin: '0 auto 10px',
                      background: checkinResult.alreadyCheckedIn ? 'rgba(184,243,74,0.10)' : 'rgba(184, 243, 74,0.10)',
                      border: checkinResult.alreadyCheckedIn ? '2px solid rgba(184,243,74,0.50)' : '2px solid rgba(184, 243, 74,0.50)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {checkinResult.alreadyCheckedIn ? (
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5-6a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ) : (
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--teal-solid)" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                  </div>
                  <p
                    style={{
                      fontSize: 24,
                      fontWeight: 800,
                      margin: 0,
                      letterSpacing: '-0.3px',
                      // --teal-solid ici (pas --teal) : le badge "Servi" d'une
                      // ligne de commande, plus bas sur cette même page, utilise
                      // déjà --teal — deux informations différentes (validité
                      // d'entrée vs statut d'un article) méritent des teintes
                      // légèrement distinctes plutôt que la même partout.
                      color: checkinResult.alreadyCheckedIn ? 'var(--gold)' : 'var(--teal-solid)',
                    }}
                  >
                    {checkinResult.alreadyCheckedIn ? 'Déjà entré' : 'Billet valide'}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: 13.5, color: 'var(--text)', margin: '0 0 4px' }}>
                    {checkinResult.ticket.place} · {fmtMoney(checkinResult.ticket.totalPrice, checkinResult.ticket.currency)}
                  </p>
                  {checkinResult.ticket.holderName && (
                    <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 4px' }}>Titulaire : {checkinResult.ticket.holderName}</p>
                  )}
                  {checkinResult.ticket.guestName && (
                    <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 4px' }}>Invité : {checkinResult.ticket.guestName}</p>
                  )}
                  {checkinResult.ticket.preorders.length > 0 && (
                    <div style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 6px' }}>
                      <p style={{ margin: '0 0 3px' }}>Précommandes :</p>
                      {checkinResult.ticket.preorders.map((p, index) => <p key={`${p.name}-${index}`} style={{ margin: '2px 0' }}>{p.name} ×{p.qty}{p.showLabel ? <span style={{ color: 'var(--teal)' }}> · Show : {p.showLabel}{p.showInfo ? ` (${p.showInfo})` : ''}</span> : null}</p>)}
                    </div>
                  )}
                  <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>
                    {checkinResult.pointAwarded ? 'Point de fidélité crédité au titulaire.' : 'Pas de point de fidélité pour ce scan.'}
                  </p>
                </div>
              </Card>
            )}

            {/* Jamais pour le rang 1 (contrôle entrée pur) — un contrôleur
                d'entrée ne doit ni voir ni gérer les commandes/précommandes,
                c'est le rôle du serveur (rang 2+) uniquement. Voir D4,
                confirmé en réunion live le 11/08/2026. */}
            {rank >= 2 && (
            <Card style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
              <h2 style={sectionTitleStyle}>Commande de ce billet</h2>
              {items.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Aucun article pour l&apos;instant.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {items.map((item) => {
                    const meta = STATUS_META[item.status]
                    const canServe = item.status === 'sent'
                    // Reflète EXACTEMENT la condition serveur de cancelOrderItem
                    // (lib/server/eventOrders.ts) : seul un item déjà payé ou déjà
                    // annulé est un no-op — un item déjà SERVI reste annulable
                    // (ex. erreur de service à corriger), donc pas exclu ici.
                    const canCancel = rank === 3 && item.status !== 'cancelled' && !item.paidAt
                    const isCancelling = cancellingItemId === item.id
                    const serveKey = `serve:${item.id}`
                    const cancelKey = `cancel:${item.id}`
                    // Une action en cours sur CETTE ligne (Servir en vol) doit
                    // bloquer l'ouverture du formulaire d'annulation concurrent
                    // sur la même ligne, pas seulement son propre bouton.
                    const rowBusy = busyKey === serveKey || busyKey === cancelKey
                    return (
                      <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                          <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--text)', minWidth: 0 }}>
                            {item.name} <span style={{ color: 'var(--text-faint)', fontWeight: 500 }}>×{item.quantity}</span>
                            {item.showLabel && <small style={{ display: 'block', color: 'var(--teal)', marginTop: 2 }}>Show : {item.showLabel}{item.showInfo ? ` · ${item.showInfo}` : ''}</small>}
                          </p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)' }}>{fmtMoney(item.unitPriceMinor * item.quantity, currency)}</span>
                            <span style={{ fontSize: 10.5, fontWeight: 700, color: meta.color, background: meta.bg, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                              {meta.label}
                            </span>
                            {item.paidAt && (
                              <span
                                style={{
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                  color: 'var(--teal-solid)',
                                  background: 'rgba(159,224,34,0.16)',
                                  padding: '3px 9px',
                                  borderRadius: 999,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                Payé
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {canServe && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={busyKey === serveKey}
                              loading={busyKey === serveKey}
                              loadingText="…"
                              onClick={() => void handleServe(item)}
                              style={{
                                border: '1px solid rgba(184, 243, 74,0.4)',
                                color: 'var(--primary)',
                                background: busyKey === serveKey ? 'rgba(255,255,255,0.03)' : 'rgba(184, 243, 74,0.1)',
                                minWidth: 64,
                              }}
                            >
                              Servir
                            </Button>
                          )}
                          {canCancel && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={rowBusy}
                              onClick={() => setCancellingItemId(isCancelling ? null : item.id)}
                            >
                              Annuler
                            </Button>
                          )}
                        </div>
                        {isCancelling && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <Label htmlFor={`cancel-reason-${item.id}`} style={SR_ONLY_STYLE}>
                                Motif de l&apos;annulation
                              </Label>
                              <Input
                                id={`cancel-reason-${item.id}`}
                                value={cancelDrafts[item.id] ?? ''}
                                onChange={(e) => setCancelDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                placeholder="Motif de l'annulation"
                                style={{ flex: 1, minWidth: 0 }}
                              />
                              <Button
                                type="button"
                                variant="danger"
                                size="sm"
                                disabled={!(cancelDrafts[item.id] ?? '').trim() || busyKey === cancelKey}
                                loading={busyKey === cancelKey}
                                loadingText="…"
                                onClick={() => void handleCancel(item)}
                              >
                                Confirmer
                              </Button>
                            </div>
                            <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: 0 }}>Motif obligatoire.</p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
            )}
            </div>

            {rank >= 2 && (
            <section className={styles.menuPanel}>
              <h2 style={{ ...sectionTitleStyle, marginBottom: 18 }}>Ajouter au menu</h2>
              {menu.length === 0 ? (
                <Card style={{ padding: '40px 20px', textAlign: 'center', boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
                  <p style={{ fontSize: 15, fontWeight: 700, margin: '0 0 6px' }}>Aucune carte disponible</p>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>L&apos;organisateur n&apos;a pas publié de menu pour cet événement.</p>
                </Card>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                  {groups.map(([category, catItems]) => (
                    <div key={category}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {category}
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {catItems.map((menuItem) => {
                          const key = `add:${menuItem.name}`
                          const busy = busyKey === key
                          const editable = findEditableLine(items, menuItem.name)
                          return (
                            <Card
                              key={menuItem.name}
                              style={{
                                borderRadius: 12,
                                boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                                padding: '12px 14px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: 12,
                              }}
                            >
                              {(menuItem.imageUrl || menuItem.emoji) && <div style={{ width: 42, height: 42, flexShrink: 0, borderRadius: 9, overflow: 'hidden', display: 'grid', placeItems: 'center', background: 'var(--surface-2)', fontSize: 20 }}>{menuItem.imageUrl ? <Image src={menuItem.imageUrl} alt="" width={42} height={42} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span aria-hidden="true">{menuItem.emoji}</span>}</div>}
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{menuItem.name}</p>
                                {menuItem.description && <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '2px 0 0' }}>{menuItem.description}</p>}
                                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', margin: '4px 0 0' }}>{fmtMoney(menuItem.price, currency)}</p>
                              </div>
                              {editable ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                                  <StepButton label="−" disabled={busy} onClick={() => handleStep(menuItem, editable, -1)} />
                                  <span style={{ minWidth: 18, textAlign: 'center', fontWeight: 700 }}>{editable.quantity}</span>
                                  <StepButton label="+" disabled={busy} onClick={() => handleStep(menuItem, editable, 1)} />
                                </div>
                              ) : (
                                <Button type="button" variant="primary" size="sm" disabled={busy} loading={busy} loadingText="…" onClick={() => void handleAddItem(menuItem)}>
                                  Ajouter
                                </Button>
                              )}
                            </Card>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
            )}
          </div>
        )}
      </div>

      {mode === 'service' && rank >= 2 && items.length > 0 && (
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 40,
            background: 'var(--surface-2)',
            borderTop: '1px solid var(--border-strong)',
            padding: '14px 16px',
          }}
        >
          <div className={styles.payBarInner}>
            <div>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>À encaisser</span>
              <span style={{ fontSize: 19, fontWeight: 800, color: 'var(--gold)' }}>{fmtMoney(unpaidTotal, currency)}</span>
            </div>
            {rank >= 2 && (
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={busyKey === 'pay' || unpaidTotal <= 0}
                loading={busyKey === 'pay'}
                loadingText="…"
                onClick={() => void handlePay()}
              >
                Marquer payé
              </Button>
            )}
          </div>
        </div>
      )}

      <div
        role="status"
        aria-live="polite"
        style={{
          position: 'fixed',
          bottom: mode === 'service' && items.length > 0 ? 74 : 16,
          left: 0,
          right: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          padding: '0 16px',
          pointerEvents: 'none',
          zIndex: 50,
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              background: 'var(--surface-2)',
              border: '1px solid rgba(224,90,170,0.4)',
              color: 'var(--text)',
              borderRadius: 12,
              padding: '10px 16px',
              fontSize: 13,
              maxWidth: 400,
              textAlign: 'center',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}
          >
            {t.message}
          </div>
        ))}
      </div>
      {confirmPayOpen && (
        <Modal
          onClose={() => setConfirmPayOpen(false)}
          maxWidth={420}
          ariaLabel="Confirmer l'encaissement"
          title="Confirmer l'encaissement"
          actions={
            <>
              <Button variant="secondary" onClick={() => setConfirmPayOpen(false)} disabled={busyKey === 'pay'}>
                Annuler
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setConfirmPayOpen(false)
                  void confirmPay()
                }}
                disabled={busyKey === 'pay'}
                loading={busyKey === 'pay'}
                loadingText="Encaissement…"
              >
                Encaisser
              </Button>
            </>
          }
        >
          <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.6, fontSize: 14 }}>
            Confirmer l&apos;encaissement de {fmtMoney(unpaidTotal, currency)} pour ce ticket.
          </p>
        </Modal>
      )}
      {confirmRemoveItem && (
        <Modal onClose={() => setConfirmRemoveItem(null)} maxWidth={390} title="Retirer cette ligne ?">
          <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.6, fontSize: 14 }}>
            « {confirmRemoveItem.item.name} » sera retiré de la commande de ce billet.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <Button variant="secondary" onClick={() => setConfirmRemoveItem(null)} style={{ flex: 1 }}>
              Annuler
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const target = confirmRemoveItem
                setConfirmRemoveItem(null)
                if (target) void handleRemoveLine(target.menuItem, target.item)
              }}
              style={{ flex: 1, textTransform: 'none', letterSpacing: 'normal' }}
            >
              Retirer
            </Button>
          </div>
        </Modal>
      )}
    </main>
  )
}

function StepButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="secondary"
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 44,
        height: 44,
        minWidth: 44,
        minHeight: 44,
        padding: 0,
        borderRadius: '50%',
        fontSize: 16,
      }}
    >
      {label}
    </Button>
  )
}
