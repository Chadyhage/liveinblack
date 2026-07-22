'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { fmtMoney } from '@/lib/shared/money'

// Port de src/pages/OnSiteOrderPage.jsx (partie interactive uniquement — les
// gates de chargement/accès vivent dans page.tsx, un Server Component). Ce
// composant ne parle QU'aux quatre routes HTTP déjà construites
// (app/api/event-orders/{add,update-quantity,remove,[eventId]}/route.ts) —
// jamais aux fonctions de lib/server/eventOrders.ts directement, qui restent
// un détail d'implémentation serveur invisible d'ici. Les types ci-dessous
// sont donc des copies volontaires (pas des imports) des formes JSON exactes
// renvoyées par ces routes, pas de la vue serveur interne.

export type OrderItemStatus = 'sent' | 'served' | 'cancelled'
export type OrderItemKind = 'order' | 'preorder' | 'included'

export interface OrderItem {
  id: string
  menuItemId: string | null
  name: string
  quantity: number
  unitPriceMinor: number
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
  price: number
  category: string
  description: string
}

export interface CommanderClientProps {
  eventId: string
  ticketCode: string
  eventName: string
  currency: string
  menu: MenuItemView[]
  initialItems: OrderItem[]
  currentUserId: string
}

// ─────────────────────────── contrats de réponse HTTP ───────────────────────

interface ApiErrorResponse {
  error: string
}
interface AddSuccessResponse {
  ok: true
  item: OrderItem
}
type UpdateQuantitySuccessResponse = { ok: true; noop: true } | { ok: true; noop?: false; item: OrderItem }
type RemoveSuccessResponse = { ok: true; noop: true } | { ok: true; noop?: false }
interface ListSuccessResponse {
  ok: true
  items: OrderItem[]
}

async function parseJson<T>(res: Response): Promise<T | ApiErrorResponse> {
  try {
    const data: unknown = await res.json()
    return data as T | ApiErrorResponse
  } catch {
    return { error: 'bad_response' }
  }
}

// Tous les codes d'erreur documentés par les quatre routes, plus quelques
// codes additionnels réellement renvoyés par lib/server/eventOrders.ts pour
// un appelant rang 0 (not_your_item, locked) — jamais d'échec silencieux :
// un code non listé retombe sur un message générique, jamais un no-op muet.
const ERROR_MESSAGES: Record<string, string> = {
  auth_required: 'Ta session a expiré — reconnecte-toi pour commander.',
  not_your_ticket: "Ce billet ne t'appartient pas.",
  not_your_item: "Cette ligne de commande ne t'appartient pas.",
  unknown_menu_item: "Cet article n'est plus disponible au menu.",
  invalid_quantity: 'Quantité invalide.',
  invalid_input: 'Requête invalide.',
  invalid_body: 'Requête invalide.',
  item_not_found: 'Cette ligne de commande est introuvable — elle a peut-être déjà été retirée.',
  ticket_not_found: 'Billet introuvable.',
  forbidden: 'Action non autorisée.',
  locked: 'Cet article a déjà été servi, payé ou annulé — modification impossible.',
  bad_response: 'Réponse du serveur illisible — réessaie.',
}

function errorMessageFor(code: string | undefined): string {
  if (!code) return 'Une erreur est survenue. Réessaie.'
  return ERROR_MESSAGES[code] ?? 'Une erreur est survenue. Réessaie.'
}

const STATUS_META: Record<OrderItemStatus, { label: string; color: string; bg: string }> = {
  sent: { label: 'En cours', color: 'var(--gold)', bg: 'rgba(200,169,110,0.14)' },
  served: { label: 'Servi', color: 'var(--teal)', bg: 'rgba(78,232,200,0.16)' },
  cancelled: { label: 'Annulé', color: 'var(--pink)', bg: 'rgba(224,90,170,0.2)' },
}

function isLocked(item: OrderItem): boolean {
  return Boolean(item.servedAt) || Boolean(item.paidAt) || item.status === 'cancelled'
}

// Une ligne n'est "la mienne à éditer via +/-" que si (a) c'est bien MOI qui
// l'ai ajoutée et (b) c'est une ligne de commande normale (`kind === 'order'`)
// — pas un `included` (perk offert avec la place, matérialisé par le staff
// via /api/event-orders/materialize, donc addedBy = un membre du staff,
// jamais le client) ni un `preorder`. Sans le filtre `addedBy`, une ligne
// ajoutée par le staff SUR le billet du client (flux normal — voir
// addOrderItem, rank >= 1) serait aussi confondue avec "ma ligne éditable" :
// le client taperait alors sur +/- une ligne qui ne lui appartient pas et
// recevrait systématiquement 403 not_your_item côté serveur, sans jamais
// pouvoir retomber sur le bouton "Ajouter".
function findEditableLine(items: OrderItem[], menuItemName: string, currentUserId: string): OrderItem | undefined {
  return items.find((i) => i.menuItemId === menuItemName && i.kind === 'order' && i.addedBy === currentUserId && !isLocked(i))
}

// Ligne (verrouillée) qui explique pourquoi le contrôle +/- vient de
// disparaître pour cet article, plutôt que de laisser le client face à un
// bouton "Ajouter" qui réapparaît silencieusement comme si rien n'avait
// jamais été commandé.
function findLockedOwnLine(items: OrderItem[], menuItemName: string, currentUserId: string): OrderItem | undefined {
  return items.find((i) => i.menuItemId === menuItemName && i.kind === 'order' && i.addedBy === currentUserId && isLocked(i))
}

function lockedLineLabel(item: OrderItem): string {
  if (item.paidAt) return 'Déjà payé — non modifiable'
  if (item.servedAt) return 'Déjà servi — non modifiable'
  return 'Annulé — non modifiable'
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

export default function CommanderClient({ eventId, ticketCode, eventName, currency, menu, initialItems, currentUserId }: CommanderClientProps) {
  const [items, setItems] = useState<OrderItem[]>(initialItems)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const pushToast = useCallback((message: string) => {
    const id = ++toastSeq
    setToasts((prev) => [...prev, { id, message }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500)
  }, [])

  const showNotice = useCallback((message: string) => {
    setNotice(message)
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 5000)
  }, [])

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch(`/api/event-orders/${eventId}?ticketId=${encodeURIComponent(ticketCode)}`, { cache: 'no-store' })
      const data = await parseJson<ListSuccessResponse>(res)
      if (res.ok && 'ok' in data && data.ok) {
        setItems(data.items)
      }
      // Échec de lecture en tâche de fond : pas de toast (spammerait toutes les
      // 4s en cas de coupure réseau prolongée) — le prochain tick réessaiera.
    } catch {
      // idem — coupure réseau ponctuelle, silencieuse.
    }
  }, [eventId, ticketCode])

  useEffect(() => {
    const interval = setInterval(fetchOrders, 4000)
    return () => clearInterval(interval)
  }, [fetchOrders])

  useEffect(() => {
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current)
    }
  }, [])

  async function handleAdd(menuItem: MenuItemView) {
    setBusyKey(menuItem.name)
    try {
      const res = await fetch('/api/event-orders/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, ticketId: ticketCode, menuItemId: menuItem.name, quantity: 1 }),
      })
      const data = await parseJson<AddSuccessResponse>(res)
      if (!res.ok || !('ok' in data) || !data.ok) {
        pushToast(errorMessageFor('error' in data ? data.error : undefined))
        return
      }
      setItems((prev) => [...prev, data.item])
    } catch {
      pushToast('Connexion impossible — réessaie.')
    } finally {
      setBusyKey(null)
    }
  }

  async function handleSetQuantity(item: OrderItem, quantity: number) {
    setBusyKey(item.menuItemId ?? item.id)
    try {
      const res = await fetch('/api/event-orders/update-quantity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, itemId: item.id, quantity }),
      })
      const data = await parseJson<UpdateQuantitySuccessResponse>(res)
      if (!res.ok || !('ok' in data) || !data.ok) {
        pushToast(errorMessageFor('error' in data ? data.error : undefined))
        return
      }
      if (data.noop) {
        // La ligne a été servie/payée/annulée par le staff entre-temps — l'état
        // local optimiste n'est plus fiable, on force un re-fetch immédiat.
        showNotice('Cet article a déjà été servi, payé ou annulé — modification impossible.')
        void fetchOrders()
        return
      }
      setItems((prev) => prev.map((i) => (i.id === item.id ? data.item : i)))
    } catch {
      pushToast('Connexion impossible — réessaie.')
    } finally {
      setBusyKey(null)
    }
  }

  async function handleRemoveLine(item: OrderItem) {
    setBusyKey(item.menuItemId ?? item.id)
    try {
      const res = await fetch('/api/event-orders/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, itemId: item.id }),
      })
      const data = await parseJson<RemoveSuccessResponse>(res)
      if (!res.ok || !('ok' in data) || !data.ok) {
        pushToast(errorMessageFor('error' in data ? data.error : undefined))
        return
      }
      if (data.noop) {
        showNotice('Cet article a déjà été servi, payé ou annulé — modification impossible.')
        void fetchOrders()
        return
      }
      setItems((prev) => prev.filter((i) => i.id !== item.id))
    } catch {
      pushToast('Connexion impossible — réessaie.')
    } finally {
      setBusyKey(null)
    }
  }

  function handleStep(menuItem: MenuItemView, editable: OrderItem | undefined, delta: number) {
    if (!editable) {
      if (delta > 0) void handleAdd(menuItem)
      return
    }
    const next = editable.quantity + delta
    if (next <= 0) void handleRemoveLine(editable)
    else void handleSetQuantity(editable, next)
  }

  const hasOwnItems = items.some((i) => i.status !== 'cancelled')
  const total = items.reduce((sum, i) => {
    if (i.kind === 'preorder' || i.status === 'cancelled' || i.paidAt) return sum
    return sum + i.unitPriceMinor * i.quantity
  }, 0)
  const groups = groupByCategory(menu)

  return (
    <main style={{ minHeight: '100vh', padding: '28px 16px 110px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <Link href="/profile" style={{ fontSize: 12.5, color: 'var(--text-faint)', textDecoration: 'none' }}>
            ← Retour
          </Link>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '14px 0 4px' }}>
            Service sur place
          </p>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 6px', letterSpacing: '-0.3px' }}>Commander</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            {eventName} · Billet {ticketCode}
          </p>
        </div>

        {notice && (
          <div role="status" aria-live="polite" style={{ background: 'rgba(200,169,110,0.12)', border: '1px solid rgba(200,169,110,0.35)', borderRadius: 12, padding: '10px 14px' }}>
            <p style={{ fontSize: 13, color: 'var(--gold)', margin: 0 }}>{notice}</p>
          </div>
        )}

        {hasOwnItems && (
          <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 18, boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-faint)', margin: '0 0 12px' }}>
              Commande de ce billet
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {items.map((item) => {
                const meta = STATUS_META[item.status]
                return (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--text)', minWidth: 0 }}>
                      {item.name} <span style={{ color: 'var(--text-faint)', fontWeight: 500 }}>×{item.quantity}</span>
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{fmtMoney(item.unitPriceMinor * item.quantity, currency)}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: meta.color, background: meta.bg, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                        {meta.label}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        <section>
          <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-faint)', margin: '0 0 12px' }}>
            Le menu
          </h2>
          {menu.length === 0 ? (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '40px 20px', textAlign: 'center', boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
              <p style={{ fontSize: 15, fontWeight: 700, margin: '0 0 6px' }}>Aucune carte disponible</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                L&apos;organisateur n&apos;a pas encore publié de menu pour la commande sur place.
              </p>
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
                      const editable = findEditableLine(items, menuItem.name, currentUserId)
                      const lockedLine = !editable ? findLockedOwnLine(items, menuItem.name, currentUserId) : undefined
                      const busy = busyKey === menuItem.name
                      return (
                        <div
                          key={menuItem.name}
                          style={{
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: 12,
                            padding: '12px 14px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 12,
                            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{menuItem.name}</p>
                            {menuItem.description && <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '2px 0 0' }}>{menuItem.description}</p>}
                            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', margin: '4px 0 0' }}>{fmtMoney(menuItem.price, currency)}</p>
                          </div>
                          <div style={{ flexShrink: 0 }}>
                            {editable ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <StepButton label="−" disabled={busy} onClick={() => handleStep(menuItem, editable, -1)} />
                                <span style={{ minWidth: 18, textAlign: 'center', fontWeight: 700 }}>{editable.quantity}</span>
                                <StepButton label="+" disabled={busy} onClick={() => handleStep(menuItem, editable, 1)} />
                              </div>
                            ) : lockedLine ? (
                              <span style={{ fontSize: 11.5, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>{lockedLineLabel(lockedLine)}</span>
                            ) : (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleStep(menuItem, undefined, 1)}
                                style={{
                                  padding: '8px 16px',
                                  borderRadius: 999,
                                  border: 'none',
                                  fontSize: 13,
                                  fontWeight: 700,
                                  color: '#fff',
                                  background: 'var(--violet)',
                                  opacity: busy ? 0.5 : 1,
                                  cursor: busy ? 'default' : 'pointer',
                                }}
                              >
                                {busy ? '…' : 'Ajouter'}
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {hasOwnItems && (
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
          <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>À régler au bar</span>
            <span style={{ fontSize: 19, fontWeight: 800, color: 'var(--gold)' }}>{fmtMoney(total, currency)}</span>
          </div>
        </div>
      )}

      <div
        role="status"
        aria-live="polite"
        style={{
          position: 'fixed',
          bottom: 74,
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
