'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { fmtMoney } from '@/lib/shared/money'
import { Button, Card, ConfirmDialog } from '@/app/components/ui'
import {
  errorMessageFor,
  findEditableLine,
  findLockedOwnLine,
  groupByCategory,
  lockedLineLabel,
  type MenuItemView,
  type OrderItem,
  type OrderItemStatus,
} from './commanderUtils'

// Port de src/pages/OnSiteOrderPage.jsx (partie interactive uniquement — les
// gates de chargement/accès vivent dans page.tsx, un Server Component). Ce
// composant ne parle QU'aux quatre routes HTTP déjà construites
// (app/api/event-orders/{add,update-quantity,remove,[eventId]}/route.ts) —
// jamais aux fonctions de lib/server/eventOrders.ts directement, qui restent
// un détail d'implémentation serveur invisible d'ici. Les types ci-dessous
// sont donc des copies volontaires (pas des imports) des formes JSON exactes
// renvoyées par ces routes, pas de la vue serveur interne.

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

const STATUS_META: Record<OrderItemStatus, { label: string; color: string; bg: string }> = {
  sent: { label: 'En cours', color: 'var(--gold)', bg: 'var(--primary-a14)' },
  served: { label: 'Servi', color: 'var(--teal)', bg: 'var(--primary-a16)' },
  cancelled: { label: 'Annulé', color: 'var(--pink)', bg: 'rgba(224,90,170,0.2)' },
}
let toastSeq = 0

export default function CommanderClient({ eventId, ticketCode, eventName, currency, menu, initialItems, currentUserId }: CommanderClientProps) {
  const [items, setItems] = useState<OrderItem[]>(initialItems)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([])
  const [confirmRemoveItem, setConfirmRemoveItem] = useState<OrderItem | null>(null)
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
    if (next <= 0) {
      setConfirmRemoveItem(editable)
      return
    }
    else void handleSetQuantity(editable, next)
  }

  const hasOwnItems = items.some((i) => i.status !== 'cancelled')
  const total = items.reduce((sum, i) => {
    if (i.kind === 'preorder' || i.status === 'cancelled' || i.paidAt) return sum
    return sum + i.unitPriceMinor * i.quantity
  }, 0)
  const groups = groupByCategory(menu)

  return (
    <main className="lb-operational-shell">
      <div className="lb-operational-workspace">
        <div>
          <Link href="/profile" style={{ minHeight: 'var(--control-height-md)', display: 'inline-flex', alignItems: 'center', fontSize: 14, color: 'var(--text-faint)', textDecoration: 'none' }}>
            ← Retour
          </Link>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '14px 0 4px' }}>
            Service sur place
          </p>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 6px', letterSpacing: '-0.3px' }}>Commander</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            {eventName} · Billet {ticketCode}
          </p>
        </div>

        {notice && (
          <div role="status" aria-live="polite" style={{ background: 'var(--primary-a12)', border: '1px solid var(--primary-a35)', borderRadius: 12, padding: '10px 14px' }}>
            <p style={{ fontSize: 13, color: 'var(--gold)', margin: 0 }}>{notice}</p>
          </div>
        )}

        <div className="lb-operational-grid">
          <div className="lb-operational-primary">
        {hasOwnItems && (
          <Card style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.35)', padding: 18 }}>
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
                      {item.showLabel && <small style={{ display: 'block', color: 'var(--teal)', marginTop: 2 }}>Show : {item.showLabel}{item.showInfo ? ` · ${item.showInfo}` : ''}</small>}
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
          </Card>
        )}
          </div>

        <section className="lb-operational-side">
          <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-faint)', margin: '0 0 12px' }}>
            Le menu
          </h2>
          {menu.length === 0 ? (
            <Card style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.35)', padding: '40px 20px', textAlign: 'center' }}>
              <p style={{ fontSize: 15, fontWeight: 700, margin: '0 0 6px' }}>Aucune carte disponible</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                L&apos;organisateur n&apos;a pas encore publié de menu pour la commande sur place.
              </p>
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
                      const editable = findEditableLine(items, menuItem.name, currentUserId)
                      const lockedLine = !editable ? findLockedOwnLine(items, menuItem.name, currentUserId) : undefined
                      const busy = busyKey === menuItem.name
                      return (
                        <Card
                          key={menuItem.name}
                          style={{
                            padding: '12px 14px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 12,
                            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                          }}
                        >
                          {(menuItem.imageUrl || menuItem.emoji) && <div style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 10, overflow: 'hidden', display: 'grid', placeItems: 'center', background: 'var(--surface-2)', fontSize: 18 }}>{menuItem.imageUrl ? <Image src={menuItem.imageUrl} alt="" width={38} height={38} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span aria-hidden="true">{menuItem.emoji}</span>}</div>}
                          <div style={{ minWidth: 0, flex: 1 }}>
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
                              <Button
                                type="button"
                                variant="primary"
                                disabled={busy}
                                loading={busy}
                                loadingText="…"
                                onClick={() => handleStep(menuItem, undefined, 1)}
                                style={{
                                  padding: '8px 16px',
                                  borderRadius: 999,
                                  border: 'none',
                                  fontSize: 13,
                                  fontWeight: 700,
                                  color: '#fff',
                                  background: 'var(--violet)',
                                }}
                              >
                                Ajouter
                              </Button>
                            )}
                          </div>
                        </Card>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        </div>
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
            padding: '12px 14px',
          }}
        >
          <div className="lb-operational-paybar">
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>À régler au bar</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--gold)' }}>{fmtMoney(total, currency)}</span>
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

      <ConfirmDialog
        open={Boolean(confirmRemoveItem)}
        title="Retirer cette ligne ?"
        body={confirmRemoveItem ? `« ${confirmRemoveItem.name} » sera retiré de cette commande.` : ''}
        confirmLabel="Retirer"
        onCancel={() => setConfirmRemoveItem(null)}
        onConfirm={() => {
          const item = confirmRemoveItem
          setConfirmRemoveItem(null)
          if (item) void handleRemoveLine(item)
        }}
      />
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
        borderRadius: 'var(--radius-control)',
        border: '1px solid var(--border-strong)',
        background: disabled ? 'rgba(255,255,255,0.03)' : 'var(--surface-2)',
        color: 'var(--text)',
        fontSize: 16,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {label}
    </Button>
  )
}
