'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { fmtMoney } from '@/lib/shared/money'
import CameraScanner from './CameraScanner'

// Port de src/pages/ScannerPage.jsx (outil staff : porte + bar). Ce composant
// ne parle QU'aux routes HTTP déjà construites (/api/tickets/checkin et les
// huit routes /api/event-orders/*) — jamais aux fonctions de lib/server/
// directement. Les types ci-dessous sont donc des copies volontaires (pas des
// imports) des formes JSON exactes renvoyées par ces routes, exactement comme
// CommanderClient.tsx.

export type OrderItemStatus = 'sent' | 'served' | 'cancelled'
export type OrderItemKind = 'order' | 'preorder' | 'included'

export interface OrderItem {
  id: string
  menuItemId: string | null
  name: string
  quantity: number
  unitPriceMinor: number
  showOptionId: string | null
  showLabel: string | null
  showInfo: string | null
  ticketId: string
  addedBy: string
  addedByName: string | null
  status: OrderItemStatus
  kind: OrderItemKind
  servedAt: string | null
  servedBy: string | null
  servedByName: string | null
  paidAt: string | null
  paidBy: string | null
  paidByName: string | null
  cancelledAt: string | null
  cancelledBy: string | null
  cancellationReason: string | null
}

export interface MenuItemView {
  name: string
  emoji: string
  imageUrl: string | null
  price: number
  category: string
  description: string
}

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

// Tous les codes documentés par checkinTicket (lib/server/ticketCheckin.ts),
// plus le générique de repli — jamais d'échec silencieux.
const CHECKIN_ERROR_MESSAGES: Record<string, string> = {
  auth_required: 'Ta session a expiré — reconnecte-toi pour scanner.',
  invalid_body: 'Requête invalide.',
  invalid_code: 'Code invalide — vérifie la saisie ou réessaie le scan.',
  ticket_not_found: 'Billet introuvable.',
  revoked: 'Ce billet a été révoqué — entrée refusée.',
  event_not_found: "Cet événement n'existe plus.",
  forbidden: "Tu n'as pas les droits pour scanner ce billet.",
  stale_or_invalid_token: 'QR périmé ou invalide — redemande un billet à jour au titulaire.',
  manual_entry_not_allowed_for_reassigned_seat: "Ce siège a été réattribué — la saisie manuelle n'est pas acceptée ici, scanne le QR à jour.",
  event_ended: 'Cet événement est terminé — entrée refusée.',
  payment_pending: 'Paiement non confirmé — entrée refusée.',
  not_entitled: "Ce billet n'ouvre pas droit à l'entrée.",
  bad_response: 'Réponse du serveur illisible — réessaie.',
}

// Tous les codes documentés par les huit fonctions de
// lib/server/eventOrders.ts pertinentes ici (add/serve/pay/cancel/
// materialize/list) — un code non listé retombe sur un message générique.
const ORDER_ERROR_MESSAGES: Record<string, string> = {
  auth_required: 'Ta session a expiré — reconnecte-toi.',
  invalid_body: 'Requête invalide.',
  invalid_input: 'Requête invalide.',
  invalid_quantity: 'Quantité invalide.',
  event_not_found: "Cet événement n'existe plus.",
  unknown_menu_item: "Cet article n'est plus disponible au menu.",
  ticket_not_found: 'Billet introuvable pour cet événement.',
  not_your_ticket: "Ce billet ne t'appartient pas.",
  item_not_found: 'Cette ligne de commande est introuvable — elle a peut-être déjà été retirée.',
  item_cancelled: 'Cette ligne a été annulée — impossible de la servir.',
  serve_staff_only: 'Seul le staff peut marquer un article comme servi.',
  pay_staff_only: 'Seul un serveur, un manager ou le propriétaire peut encaisser.',
  cancel_manager_only: "Seul le manager ou le propriétaire de l'événement peut annuler une ligne.",
  reason_required: 'Un motif est requis pour annuler cette ligne.',
  nothing_to_pay: 'Rien à encaisser sur ce billet — tout est déjà payé ou annulé.',
  staff_only: 'Action réservée au staff.',
  forbidden: 'Action non autorisée.',
  bad_response: 'Réponse du serveur illisible — réessaie.',
}

function checkinErrorMessage(code: string | undefined): string {
  if (!code) return 'Une erreur est survenue. Réessaie.'
  return CHECKIN_ERROR_MESSAGES[code] ?? 'Une erreur est survenue. Réessaie.'
}

function orderErrorMessage(code: string | undefined): string {
  if (!code) return 'Une erreur est survenue. Réessaie.'
  return ORDER_ERROR_MESSAGES[code] ?? 'Une erreur est survenue. Réessaie.'
}

const STATUS_META: Record<OrderItemStatus, { label: string; color: string; bg: string }> = {
  sent: { label: 'En cours', color: 'var(--gold)', bg: 'rgba(200,169,110,0.14)' },
  served: { label: 'Servi', color: 'var(--teal)', bg: 'rgba(78,232,200,0.16)' },
  cancelled: { label: 'Annulé', color: 'var(--pink)', bg: 'rgba(224,90,170,0.2)' },
}

function isLocked(item: OrderItem): boolean {
  return Boolean(item.servedAt) || Boolean(item.paidAt) || item.status === 'cancelled'
}

// Ligne du billet actuellement affiché encore modifiable par un ajout du
// staff (kind commande normale, pas encore servie/payée/annulée) — même
// principe que findEditableLine côté CommanderClient, mais sans filtre
// `addedBy` : côté staff, update-quantity et remove n'imposent aucune
// restriction de propriété au-delà du verrou (voir lib/server/eventOrders.ts,
// rank >= 1), donc n'importe quel membre du staff peut ajuster une ligne déjà
// ajoutée par un collègue plutôt que d'en créer une nouvelle en double.
function findEditableLine(items: OrderItem[], menuItemName: string): OrderItem | undefined {
  return items.find((i) => i.menuItemId === menuItemName && i.kind === 'order' && !isLocked(i))
}

// Un QR encode toujours l'URL COMPLÈTE de la page billet
// (`https://liveinblack.com/ticket/{token}`) — jamais le jeton nu. La saisie
// manuelle, elle, est toujours un ticketCode brut. Une seule fonction gère
// les deux sources (caméra ET texte tapé) pour ne jamais dupliquer cette
// décision de routage.
const TICKET_URL_TOKEN_RE = /\/ticket\/([A-Za-z0-9_.-]+)/

function resolveScanInput(raw: string): { token: string } | { ticketCode: string } {
  const trimmed = raw.trim()
  const match = trimmed.match(TICKET_URL_TOKEN_RE)
  if (match) return { token: match[1] }
  return { ticketCode: trimmed.toUpperCase() }
}

function groupByCategory(menu: MenuItemView[]): Array<[string, MenuItemView[]]> {
  const map = new Map<string, MenuItemView[]>()
  for (const item of menu) {
    const category = item.category?.trim() || 'Autres'
    const bucket = map.get(category)
    if (bucket) bucket.push(item)
    else map.set(category, [item])
  }
  return Array.from(map.entries())
}

let toastSeq = 0

const cardStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 16,
  padding: 18,
  boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-muted)',
  margin: '0 0 12px',
}

const primaryButtonStyle = (disabled: boolean): React.CSSProperties => ({
  padding: '8px 16px',
  borderRadius: 999,
  border: 'none',
  fontSize: 13,
  fontWeight: 700,
  color: '#fff',
  background: 'var(--violet)',
  opacity: disabled ? 0.5 : 1,
  cursor: disabled ? 'default' : 'pointer',
})

const secondaryButtonStyle = (disabled: boolean): React.CSSProperties => ({
  padding: '8px 16px',
  borderRadius: 999,
  border: '1px solid var(--border-strong)',
  fontSize: 12.5,
  fontWeight: 700,
  color: 'var(--text)',
  background: disabled ? 'rgba(255,255,255,0.03)' : 'var(--surface-2)',
  cursor: disabled ? 'default' : 'pointer',
})

// Variante teal du bouton secondaire pour les actions "métier" (Servir) —
// visuellement distinctes des actions de navigation légère (Scanner un autre
// billet, Activer/Désactiver la caméra) qui gardent secondaryButtonStyle.
const serveButtonStyle = (disabled: boolean): React.CSSProperties => ({
  padding: '8px 16px',
  borderRadius: 999,
  border: '1px solid rgba(78,232,200,0.4)',
  fontSize: 12.5,
  fontWeight: 700,
  color: 'var(--teal)',
  background: disabled ? 'rgba(255,255,255,0.03)' : 'rgba(78,232,200,0.1)',
  cursor: disabled ? 'default' : 'pointer',
  minWidth: 64,
})

const dangerButtonStyle = (disabled: boolean): React.CSSProperties => ({
  padding: '8px 16px',
  borderRadius: 999,
  border: 'none',
  fontSize: 12.5,
  fontWeight: 700,
  color: '#fff',
  background: disabled ? 'rgba(224,90,170,0.5)' : 'var(--pink)',
  cursor: disabled ? 'default' : 'pointer',
})

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: 'var(--surface-2)',
  border: '1px solid var(--border-strong)',
  borderRadius: 10,
  padding: '10px 12px',
  color: 'var(--text)',
  fontSize: 14,
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

// Clé sessionStorage (par événement) mémorisant le billet en cours de
// service — permet de survivre à un rechargement accidentel du navigateur
// sans perdre le contexte et devoir rescanner/ressaisir le code.
function serviceSessionKey(eventId: string): string {
  return `liveinblack:scanner:${eventId}:ticketCode`
}

export default function ScannerClient({ eventId, eventName, currency, menu, rank }: ScannerClientProps) {
  const [mode, setMode] = useState<Mode>('scan')
  const [scanning, setScanning] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const [checkinBusy, setCheckinBusy] = useState(false)
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
  // CommanderClient.tsx).
  useEffect(() => {
    if (mode !== 'service' || !ticketCode) return
    const interval = setInterval(() => {
      void fetchOrders(ticketCode)
    }, 4000)
    return () => clearInterval(interval)
  }, [mode, ticketCode, fetchOrders])

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
          body: JSON.stringify(input),
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
    [enterServiceMode]
  )

  const handleScanValue = useCallback(
    (value: string) => {
      // CameraScanner a déjà arrêté son flux en interne dès qu'il a trouvé un
      // QR (voir CameraScanner.tsx) — `scanning` doit refléter cet état
      // immédiatement (succès OU échec du check-in qui suit), sinon le bouton
      // afficherait encore "Désactiver la caméra" alors que la caméra réelle
      // est déjà coupée.
      setScanning(false)
      void performCheckin(value)
    },
    [performCheckin]
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
    const key = `add:${menuItem.name}`
    setBusyKey(key)
    try {
      const res = await fetch('/api/event-orders/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, ticketId: ticketCode, menuItemId: menuItem.name, quantity: 1 }),
      })
      const data = await parseJson<AddSuccessResponse>(res)
      if (!res.ok || !('ok' in data) || !data.ok) {
        pushToast(orderErrorMessage('error' in data ? data.error : undefined))
        return
      }
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
    if (next <= 0) void handleRemoveLine(menuItem, editable)
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
    // Action financière potentiellement conséquente et immédiate (pas de
    // brouillon) — une confirmation explicite évite qu'un mistap n'encaisse
    // tout le ticket, symétrique du motif écrit déjà exigé pour annuler.
    if (!window.confirm(`Confirmer l'encaissement de ${fmtMoney(unpaidTotal, currency)} ?`)) return
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
    <main style={{ minHeight: '100vh', padding: '28px 16px 110px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <Link href="/scanner" style={{ fontSize: 12.5, color: 'var(--text-faint)', textDecoration: 'none' }}>
              ← Événements
            </Link>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '14px 0 4px' }}>
              {mode === 'service' ? 'Service sur place' : 'Contrôle des entrées'}
            </p>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 6px', letterSpacing: '-0.3px' }}>
              {mode === 'service' ? `Billet ${ticketCode}` : 'Scanner'}
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>{eventName}</p>
          </div>
          {mode === 'service' && (
            <button type="button" onClick={resetToScan} style={secondaryButtonStyle(false)}>
              Scanner un autre billet
            </button>
          )}
        </div>

        {notice && (
          <div role="status" aria-live="polite" style={{ background: 'rgba(200,169,110,0.12)', border: '1px solid rgba(200,169,110,0.35)', borderRadius: 16, padding: '10px 14px' }}>
            <p style={{ fontSize: 13, color: 'var(--gold)', margin: 0 }}>{notice}</p>
          </div>
        )}

        {mode === 'scan' ? (
          <>
            {checkinError && (
              <div role="alert" aria-live="assertive" style={{ background: 'rgba(224,90,170,0.08)', border: '1px solid rgba(224,90,170,0.35)', borderRadius: 16, padding: '10px 14px' }}>
                <p style={{ fontSize: 13, color: 'var(--pink)', margin: checkinErrorCode === 'auth_required' ? '0 0 8px' : 0 }}>{checkinError}</p>
                {checkinErrorCode === 'auth_required' && (
                  <Link href="/login" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--teal)', textDecoration: 'none' }}>
                    Se reconnecter
                  </Link>
                )}
              </div>
            )}

            <section style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Caméra</h2>
                <button type="button" onClick={() => setScanning((s) => !s)} style={secondaryButtonStyle(false)}>
                  {scanning ? 'Désactiver' : 'Activer'} la caméra
                </button>
              </div>
              <CameraScanner active={scanning} onScan={handleScanValue} />
            </section>

            <section style={cardStyle}>
              <h2 style={sectionTitleStyle}>Saisie manuelle</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void performCheckin(manualCode)
                }}
                style={{ display: 'flex', gap: 8 }}
              >
                <label htmlFor="scanner-manual-code" style={SR_ONLY_STYLE}>
                  Code du billet
                </label>
                <input
                  id="scanner-manual-code"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="Code du billet"
                  style={{
                    ...inputStyle,
                    textTransform: 'uppercase',
                    ...(checkinError ? { border: '1px solid var(--pink)' } : {}),
                  }}
                  autoCapitalize="characters"
                />
                <button type="submit" disabled={checkinBusy || !manualCode.trim()} style={primaryButtonStyle(checkinBusy || !manualCode.trim())}>
                  {checkinBusy ? '…' : 'Valider'}
                </button>
              </form>
            </section>
          </>
        ) : (
          <>
            {checkinResult && (
              <section
                style={{
                  ...cardStyle,
                  border: checkinResult.alreadyCheckedIn ? '1px solid rgba(200,169,110,0.35)' : '1px solid rgba(78,232,200,0.35)',
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
                      background: checkinResult.alreadyCheckedIn ? 'rgba(200,169,110,0.10)' : 'rgba(78,232,200,0.10)',
                      border: checkinResult.alreadyCheckedIn ? '2px solid rgba(200,169,110,0.50)' : '2px solid rgba(78,232,200,0.50)',
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
              </section>
            )}

            <section style={cardStyle}>
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
                                  background: 'rgba(62,214,181,0.16)',
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
                            <button
                              type="button"
                              disabled={busyKey === serveKey}
                              onClick={() => void handleServe(item)}
                              style={serveButtonStyle(busyKey === serveKey)}
                            >
                              {busyKey === serveKey ? '…' : 'Servir'}
                            </button>
                          )}
                          {canCancel && (
                            <button
                              type="button"
                              disabled={rowBusy}
                              onClick={() => setCancellingItemId(isCancelling ? null : item.id)}
                              style={secondaryButtonStyle(rowBusy)}
                            >
                              Annuler
                            </button>
                          )}
                        </div>
                        {isCancelling && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <label htmlFor={`cancel-reason-${item.id}`} style={SR_ONLY_STYLE}>
                                Motif de l&apos;annulation
                              </label>
                              <input
                                id={`cancel-reason-${item.id}`}
                                value={cancelDrafts[item.id] ?? ''}
                                onChange={(e) => setCancelDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                placeholder="Motif de l'annulation"
                                style={inputStyle}
                              />
                              <button
                                type="button"
                                disabled={!(cancelDrafts[item.id] ?? '').trim() || busyKey === cancelKey}
                                onClick={() => void handleCancel(item)}
                                style={dangerButtonStyle(!(cancelDrafts[item.id] ?? '').trim() || busyKey === cancelKey)}
                              >
                                {busyKey === cancelKey ? '…' : 'Confirmer'}
                              </button>
                            </div>
                            <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: 0 }}>Motif obligatoire.</p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            <section>
              <h2 style={{ ...sectionTitleStyle, marginBottom: 18 }}>Ajouter au menu</h2>
              {menu.length === 0 ? (
                <div style={{ ...cardStyle, padding: '40px 20px', textAlign: 'center' }}>
                  <p style={{ fontSize: 15, fontWeight: 700, margin: '0 0 6px' }}>Aucune carte disponible</p>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>L&apos;organisateur n&apos;a pas publié de menu pour cet événement.</p>
                </div>
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
                            <div
                              key={menuItem.name}
                              style={{
                                ...cardStyle,
                                borderRadius: 12,
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
                                <button type="button" disabled={busy} onClick={() => void handleAddItem(menuItem)} style={primaryButtonStyle(busy)}>
                                  {busy ? '…' : 'Ajouter'}
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {mode === 'service' && items.length > 0 && (
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
          <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>À encaisser</span>
              <span style={{ fontSize: 19, fontWeight: 800, color: 'var(--gold)' }}>{fmtMoney(unpaidTotal, currency)}</span>
            </div>
            {rank >= 2 && (
              <button
                type="button"
                disabled={busyKey === 'pay' || unpaidTotal <= 0}
                onClick={() => void handlePay()}
                style={primaryButtonStyle(busyKey === 'pay' || unpaidTotal <= 0)}
              >
                {busyKey === 'pay' ? '…' : 'Marquer payé'}
              </button>
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
    </main>
  )
}

function StepButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 30,
        height: 30,
        borderRadius: '50%',
        border: '1px solid var(--border-strong)',
        background: disabled ? 'rgba(255,255,255,0.03)' : 'var(--surface-2)',
        color: 'var(--text)',
        fontSize: 16,
        fontWeight: 700,
        cursor: disabled ? 'default' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {label}
    </button>
  )
}
