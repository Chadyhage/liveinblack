import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getUserId } from '../utils/messaging'
import {
  listenOrders, getOrders, addOnsiteItem, updateOnsiteItem, removeOnsiteItem,
  ORDER_SOURCE, ONSITE_STATUS, PREORDER_STATUS,
  ONSITE_STATUS_LABEL, ONSITE_STATUS_COLOR,
} from '../utils/eventOrders'

// ─── Commander sur place (côté CLIENT) ───────────────────────────────────────
// Le client, muni de son billet, commande des consommations pendant la soirée.
// Chaque ligne est rattachée à son billet (ticketId = ticketCode) et écrite dans
// event_orders/{eventId} → elle apparaît EN TEMPS RÉEL côté serveur (POS scanner)
// et inversement (quand le serveur sert/encaisse, le client le voit ici).

const C = { obsidian: '#04040b', teal: '#4ee8c8', gold: '#c8a96e', pink: '#e05aaa' }
const FONT = 'Inter, sans-serif'
const euro = n => `${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString('fr-FR')}€`

async function loadEvent(eventId) {
  // Firestore public d'abord (frais), puis cache local en secours hors-ligne.
  try {
    const { db, USE_REAL_FIREBASE } = await import('../firebase')
    if (USE_REAL_FIREBASE) {
      const { doc, getDoc } = await import('firebase/firestore')
      const snap = await getDoc(doc(db, 'events', String(eventId)))
      if (snap.exists()) return { id: String(eventId), ...snap.data() }
    }
  } catch {}
  try {
    for (const key of ['lib_created_events', 'lib_events_cache']) {
      const arr = JSON.parse(localStorage.getItem(key) || '[]')
      const found = (Array.isArray(arr) ? arr : []).find(e => String(e.id) === String(eventId))
      if (found) return found
    }
  } catch {}
  return null
}

export default function OnSiteOrderPage() {
  const { eventId, ticketCode } = useParams()
  const navigate = useNavigate()
  const { user, openAuthModal } = useAuth()
  const myId = getUserId(user)

  const [event, setEvent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState(() => { try { return getOrders(eventId) } catch { return [] } }) // lecture optimiste locale
  const [busy, setBusy] = useState('')      // menuItemId en cours d'écriture
  const [toast, setToast] = useState('')
  const refreshLocal = () => { try { setItems(getOrders(eventId)) } catch {} }

  // Charge l'événement (menu + méta)
  useEffect(() => {
    let alive = true
    loadEvent(eventId).then(ev => { if (alive) { setEvent(ev); setLoading(false) } })
    return () => { alive = false }
  }, [eventId])

  // Écoute temps réel des commandes de l'événement
  useEffect(() => {
    if (!eventId) return
    setItems(getOrders(eventId)) // reset immédiat sur le BON event (évite un flash des commandes de l'event précédent)
    const unsub = listenOrders(eventId, next => setItems(Array.isArray(next) ? next : []))
    return () => unsub()
  }, [eventId])

  const flash = msg => { setToast(msg); setTimeout(() => setToast(''), 2200) }

  // Mes lignes (ce billet), hors annulées
  const myItems = useMemo(
    () => items.filter(i => String(i.ticketId) === String(ticketCode) && i.status !== ONSITE_STATUS.CANCELLED),
    [items, ticketCode]
  )
  // Ligne « panier » modifiable pour un article du menu (client, envoyée, non payée)
  const editableLine = menuItem => myItems.find(i =>
    i.source === ORDER_SOURCE.ONSITE_CLIENT &&
    i.status === ONSITE_STATUS.SENT && !i.paid_at &&
    String(i.menuItemId) === String(menuItem.id || menuItem.name)
  )

  // Total à régler au bar (consos sur place non payées)
  const dueTotal = useMemo(() =>
    myItems.filter(i => i.source !== ORDER_SOURCE.PREORDER && !i.paid_at)
      .reduce((s, i) => s + i.unitPrice * i.quantity, 0), [myItems])

  const actor = { uid: myId, id: myId, name: user?.name || user?.displayName || 'Client' }

  async function inc(menuItem) {
    if (!user) { openAuthModal?.(); return }
    setBusy(String(menuItem.id || menuItem.name))
    const line = editableLine(menuItem)
    if (line) await updateOnsiteItem(eventId, line.id, { quantity: line.quantity + 1 }, actor)
    else { await addOnsiteItem(eventId, { ticketId: ticketCode, menuItem, qty: 1 }, actor, true); flash(`${menuItem.name} ajouté`) }
    refreshLocal(); setBusy('')
  }
  async function dec(menuItem) {
    const line = editableLine(menuItem)
    if (!line) return
    setBusy(String(menuItem.id || menuItem.name))
    if (line.quantity > 1) await updateOnsiteItem(eventId, line.id, { quantity: line.quantity - 1 }, actor)
    else await removeOnsiteItem(eventId, line.id, actor)
    refreshLocal(); setBusy('')
  }

  // Menu dispo (on ne filtre pas par catégorie de place : sur place = tout le menu)
  const menu = useMemo(() => (event?.menu || []).filter(m => m && m.name && m.available !== false), [event])
  const byCategory = useMemo(() => {
    const map = new Map()
    for (const m of menu) { const c = m.category || 'Autres'; if (!map.has(c)) map.set(c, []); map.get(c).push(m) }
    return [...map.entries()]
  }, [menu])

  const eventOver = event && (event.cancelled === true)

  if (loading) return <Shell><div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,.5)', fontFamily: FONT }}>Chargement…</div></Shell>
  if (!event) return (
    <Shell>
      <Center title="Événement introuvable" sub="Ce lien de commande n'est plus valide.">
        <BackBtn onClick={() => navigate(-1)} />
      </Center>
    </Shell>
  )
  if (eventOver) return (
    <Shell>
      <Center title="Commande indisponible" sub="Cet événement est terminé ou annulé — les commandes sur place sont closes.">
        <BackBtn onClick={() => navigate(-1)} />
      </Center>
    </Shell>
  )

  return (
    <Shell>
      {/* Header */}
      <div style={{ padding: '16px 16px 10px', borderBottom: '1px solid rgba(255,255,255,.07)', position: 'sticky', top: 0, zIndex: 5, background: 'rgba(4,4,11,.92)', backdropFilter: 'blur(18px)' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 0, color: C.teal, fontFamily: FONT, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0, letterSpacing: '.02em' }}>← Retour</button>
        <h1 style={{ fontFamily: FONT, fontWeight: 800, fontSize: 22, color: '#fff', margin: '10px 0 2px', letterSpacing: '-.4px' }}>Commander sur place</h1>
        <p style={{ fontFamily: FONT, fontSize: 12.5, color: 'rgba(255,255,255,.5)', margin: 0 }}>{event.name} · billet <span style={{ color: C.gold, fontWeight: 600 }}>{ticketCode}</span></p>
      </div>

      <div style={{ padding: '14px 16px 120px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Ma commande en direct */}
        {myItems.length > 0 && (
          <section>
            <p style={sectionLabel}>Ma commande</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
              {myItems.map(i => <MyLine key={i.id} item={i} />)}
            </div>
          </section>
        )}

        {/* Menu */}
        <section>
          <p style={sectionLabel}>Le menu</p>
          {menu.length === 0 ? (
            <div style={{ ...cardStyle, padding: 22, textAlign: 'center', marginTop: 10 }}>
              <p style={{ fontFamily: FONT, fontSize: 14, color: 'rgba(255,255,255,.6)', margin: 0 }}>Aucune carte disponible</p>
              <p style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(255,255,255,.35)', margin: '4px 0 0' }}>L'organisateur n'a pas encore publié de menu pour la commande sur place.</p>
            </div>
          ) : byCategory.map(([cat, list]) => (
            <div key={cat} style={{ marginTop: 12 }}>
              <p style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,.35)', margin: '0 0 8px' }}>{cat}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {list.map(m => {
                  const line = editableLine(m)
                  const qty = line?.quantity || 0
                  const id = String(m.id || m.name)
                  return (
                    <div key={id} style={{ ...cardStyle, padding: '11px 13px', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 22, width: 26, textAlign: 'center' }}>{m.emoji || '🍸'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontFamily: FONT, fontSize: 14, fontWeight: 600, color: '#fff', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</p>
                        {m.description && <p style={{ fontFamily: FONT, fontSize: 11, color: 'rgba(255,255,255,.4)', margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.description}</p>}
                      </div>
                      <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: C.gold, flexShrink: 0 }}>{euro(m.price)}</span>
                      {qty > 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          <Stepper label="−" onClick={() => dec(m)} disabled={busy === id} tone="dim" />
                          <span style={{ fontFamily: FONT, fontSize: 15, fontWeight: 800, color: C.teal, minWidth: 16, textAlign: 'center' }}>{qty}</span>
                          <Stepper label="+" onClick={() => inc(m)} disabled={busy === id} tone="teal" />
                        </div>
                      ) : (
                        <button onClick={() => inc(m)} disabled={busy === id} style={{ flexShrink: 0, padding: '8px 14px', borderRadius: 999, cursor: 'pointer', fontFamily: FONT, fontSize: 12, fontWeight: 700, background: 'rgba(78,232,200,.14)', border: '1px solid rgba(78,232,200,.5)', color: C.teal }}>Ajouter</button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </section>
      </div>

      {/* Barre total fixe */}
      {dueTotal > 0 && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 10, maxWidth: 480, margin: '0 auto', padding: '14px 16px calc(14px + env(safe-area-inset-bottom))', background: 'rgba(6,8,15,.95)', backdropFilter: 'blur(18px)', borderTop: '1px solid rgba(255,255,255,.09)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)', margin: 0 }}>À régler au bar</p>
              <p style={{ fontFamily: FONT, fontSize: 24, fontWeight: 800, color: '#fff', margin: '2px 0 0', letterSpacing: '-.5px' }}>{euro(dueTotal)}</p>
            </div>
            <p style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(255,255,255,.45)', margin: 0, maxWidth: 180, textAlign: 'right', lineHeight: 1.4 }}>Un serveur validera et encaissera ta commande.</p>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', left: '50%', bottom: dueTotal > 0 ? 96 : 24, transform: 'translateX(-50%)', zIndex: 20, background: 'rgba(78,232,200,.14)', border: '1px solid rgba(78,232,200,.4)', color: C.teal, fontFamily: FONT, fontSize: 12.5, fontWeight: 600, padding: '9px 16px', borderRadius: 999, backdropFilter: 'blur(12px)' }}>{toast}</div>
      )}
    </Shell>
  )
}

// ── Une ligne de MA commande (avec statut live) ──
function MyLine({ item }) {
  const isPre = item.source === ORDER_SOURCE.PREORDER
  const served = item.status === ONSITE_STATUS.SERVED || item.status === PREORDER_STATUS.SERVED
  const statusLabel = isPre
    ? (served ? 'Servie ✓' : 'Précommande · payée')
    : (item.paid_at ? 'Payée ✓' : (ONSITE_STATUS_LABEL[item.status] || 'Envoyée'))
  const statusColor = served ? '#22c55e' : isPre ? C.gold : (ONSITE_STATUS_COLOR[item.status] || C.teal)
  return (
    <div style={{ ...cardStyle, padding: '11px 13px', display: 'flex', alignItems: 'center', gap: 12, opacity: served ? 0.72 : 1 }}>
      <span style={{ fontSize: 20, width: 24, textAlign: 'center' }}>{item.emoji || (isPre ? '🎟️' : '🍸')}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: FONT, fontSize: 13.5, fontWeight: 600, color: '#fff', margin: 0 }}>{item.name} <span style={{ color: 'rgba(255,255,255,.45)', fontWeight: 500 }}>×{item.quantity}</span></p>
        <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: statusColor }}>{statusLabel}</span>
      </div>
      <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: isPre ? 'rgba(255,255,255,.5)' : C.gold, flexShrink: 0 }}>{isPre ? 'incluse' : euro(item.unitPrice * item.quantity)}</span>
    </div>
  )
}

function Stepper({ label, onClick, disabled, tone }) {
  const teal = tone === 'teal'
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: 30, height: 30, borderRadius: 9, cursor: disabled ? 'default' : 'pointer', flexShrink: 0,
      fontFamily: FONT, fontSize: 18, fontWeight: 700, lineHeight: 1, display: 'grid', placeItems: 'center',
      background: teal ? 'rgba(78,232,200,.14)' : 'rgba(255,255,255,.05)',
      border: `1px solid ${teal ? 'rgba(78,232,200,.5)' : 'rgba(255,255,255,.14)'}`,
      color: teal ? C.teal : 'rgba(255,255,255,.6)', opacity: disabled ? 0.5 : 1,
    }}>{label}</button>
  )
}

const sectionLabel = { fontFamily: FONT, fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', margin: 0 }
const cardStyle = { background: 'rgba(9,11,20,.6)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,.09)', borderRadius: 13 }

function Shell({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: C.obsidian, color: '#fff' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', position: 'relative', minHeight: '100vh' }}>{children}</div>
    </div>
  )
}
function Center({ title, sub, children }) {
  return (
    <div style={{ minHeight: '80vh', display: 'grid', placeContent: 'center', justifyItems: 'center', textAlign: 'center', gap: 12, padding: 24 }}>
      <strong style={{ fontFamily: FONT, fontSize: 22, fontWeight: 800, color: '#fff' }}>{title}</strong>
      <p style={{ fontFamily: FONT, fontSize: 13.5, color: 'rgba(255,255,255,.5)', maxWidth: 300, margin: 0, lineHeight: 1.5 }}>{sub}</p>
      {children}
    </div>
  )
}
function BackBtn({ onClick }) {
  return <button onClick={onClick} style={{ padding: '11px 20px', borderRadius: 999, background: 'rgba(78,232,200,.12)', border: '1px solid rgba(78,232,200,.4)', color: C.teal, fontFamily: FONT, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>← Retour</button>
}
