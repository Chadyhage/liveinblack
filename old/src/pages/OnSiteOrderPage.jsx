import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getUserId } from '../utils/messaging'
import { eventCurrency } from '../utils/money'
import { isEventEnded, eventStartMs } from '../utils/event-time'
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
// Multi-devise : « euro » historique, désormais paramétrable (XOF = FCFA entiers).
const euro = (n, cur = 'EUR') => String(cur).toUpperCase() === 'XOF'
  ? `${Math.round(Number(n) || 0).toLocaleString('fr-FR')} FCFA`
  : `${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString('fr-FR')}€`

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
  const [access, setAccess] = useState('checking') // 'checking' | 'ok' | 'denied'
  const cur = eventCurrency(event)
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
    // Sync INTER-ONGLETS (même appareil) : quand le serveur/un autre onglet écrit,
    // localStorage change → on relit. (Le cross-device passe, lui, par Firestore.)
    const onStorage = e => { if (!e || e.key === 'lib_event_orders') setItems(getOrders(eventId)) }
    window.addEventListener('storage', onStorage)
    return () => { unsub(); window.removeEventListener('storage', onStorage) }
  }, [eventId])

  // GARDE APPARTENANCE — un ticketCode dans l'URL ne suffit pas : on vérifie que
  // ce billet appartient bien au compte connecté (local d'abord, puis registre
  // tickets/{code} cross-device). Sinon n'importe qui devinant un code pourrait
  // passer des consos sur la note d'un autre.
  useEffect(() => {
    let alive = true
    if (!ticketCode) { setAccess('denied'); return }
    if (!myId) { setAccess('checking'); return } // on attend l'auth
    try {
      const mine = JSON.parse(localStorage.getItem('lib_bookings') || '[]')
      if (mine.some(b => String(b.userId) === String(myId) && String(b.ticketCode) === String(ticketCode))) {
        setAccess('ok'); return
      }
    } catch {}
    ;(async () => {
      try {
        const { db, USE_REAL_FIREBASE } = await import('../firebase')
        if (USE_REAL_FIREBASE) {
          const { doc, getDoc } = await import('firebase/firestore')
          const snap = await getDoc(doc(db, 'tickets', String(ticketCode)))
          if (snap.exists() && String(snap.data().userId) === String(myId)) {
            if (alive) setAccess('ok')
            return
          }
        }
      } catch {}
      if (alive) setAccess('denied')
    })()
    return () => { alive = false }
  }, [myId, ticketCode])

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
    if (line) { await updateOnsiteItem(eventId, line.id, { quantity: line.quantity + 1 }, actor) }
    else {
      const res = await addOnsiteItem(eventId, { ticketId: ticketCode, menuItem, qty: 1 }, actor, true)
      flash(res && res._synced === false ? `${menuItem.name} ajouté · mode hors ligne` : `${menuItem.name} ajouté`)
    }
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

  const eventOver = event && isEventEnded(event)
  // Ouverture des commandes 3 h avant le début (arrivée / ouverture des portes) —
  // avant ça, pas de commande sur place possible (sinon spam du bar à J-10).
  const startMs = event ? eventStartMs(event) : 0
  const notStarted = !!startMs && Date.now() < startMs - 3 * 3600 * 1000

  if (loading) return <Shell><div style={{ padding: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'rgba(255,255,255,.55)', fontFamily: FONT, fontSize: 13, fontWeight: 600 }}><span className="lib-spin" style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,.25)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />Chargement…</div></Shell>
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
  if (notStarted) return (
    <Shell>
      <Center title="Pas encore ouvert" sub="Les commandes sur place ouvrent le soir de l'événement, peu avant le début.">
        <BackBtn onClick={() => navigate(-1)} />
      </Center>
    </Shell>
  )
  if (access === 'checking') return <Shell><div style={{ padding: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'rgba(255,255,255,.55)', fontFamily: FONT, fontSize: 13, fontWeight: 600 }}><span className="lib-spin" style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,.25)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />Vérification du billet…</div></Shell>
  if (access === 'denied') return (
    <Shell>
      <Center title="Billet non reconnu" sub="Ce billet n'est pas rattaché à ton compte. Ouvre-le depuis « Mes billets » pour commander.">
        <BackBtn onClick={() => navigate('/profil')} />
      </Center>
    </Shell>
  )

  return (
    <Shell>
      {/* Header */}
      <div className="order-header">
        <button onClick={() => navigate(-1)} className="order-back"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>Retour au billet</button>
        <span className="order-kicker">Service sur place</span>
        <h1>Commander</h1>
        <p>{event.name}<span>{ticketCode}</span></p>
      </div>

      <div className="order-content">
        {/* Ma commande en direct */}
        {myItems.length > 0 && (
          <section>
            <p style={sectionLabel}>Ma commande</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
              {myItems.map(i => <MyLine key={i.id} item={i} cur={cur} />)}
            </div>
          </section>
        )}

        {/* Menu */}
        <section>
          <p style={sectionLabel}>Le menu</p>
          {menu.length === 0 ? (
            <div style={{ ...cardStyle, padding: 22, textAlign: 'center', marginTop: 10 }}>
              <p style={{ fontFamily: FONT, fontSize: 14, color: 'rgba(255,255,255,.6)', margin: 0 }}>Aucune carte disponible</p>
              <p style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(255,255,255,.5)', margin: '4px 0 0' }}>L'organisateur n'a pas encore publié de menu pour la commande sur place.</p>
            </div>
          ) : byCategory.map(([cat, list]) => (
            <div key={cat} style={{ marginTop: 12 }}>
              <p style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,.45)', margin: '0 0 8px' }}>{cat}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {list.map(m => {
                  const line = editableLine(m)
                  const qty = line?.quantity || 0
                  const id = String(m.id || m.name)
                  return (
                    <div key={id} className="order-product-card">
                      <OrderItemVisual item={m}/>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontFamily: FONT, fontSize: 15, fontWeight: 600, color: '#fff', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</p>
                        {m.description && <p style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(255,255,255,.45)', margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.description}</p>}
                      </div>
                      <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: C.gold, flexShrink: 0 }}>{euro(m.price, cur)}</span>
                      {qty > 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          <Stepper label="−" onClick={() => dec(m)} disabled={busy === id} tone="dim" />
                          <span style={{ fontFamily: FONT, fontSize: 17, fontWeight: 800, color: C.teal, minWidth: 20, textAlign: 'center' }}>{qty}</span>
                          <Stepper label="+" onClick={() => inc(m)} disabled={busy === id} tone="teal" />
                        </div>
                      ) : (
                        <button onClick={() => inc(m)} disabled={busy === id} style={{
                          flexShrink: 0, padding: '12px 20px', minHeight: 44, borderRadius: 12, fontFamily: FONT, fontSize: 14, fontWeight: 700,
                          cursor: busy === id ? 'not-allowed' : 'pointer',
                          background: busy === id ? 'rgba(255,255,255,.07)' : '#3ed6b5',
                          border: `1px solid ${busy === id ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.14)'}`,
                          color: busy === id ? 'rgba(255,255,255,.35)' : '#04120e',
                        }}>Ajouter</button>
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
        <div className="order-total-bar">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)', margin: 0 }}>À régler au bar</p>
              <p style={{ fontFamily: FONT, fontSize: 24, fontWeight: 800, color: '#fff', margin: '2px 0 0', letterSpacing: '-.5px' }}>{euro(dueTotal, cur)}</p>
            </div>
            <p style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(255,255,255,.45)', margin: 0, maxWidth: 180, textAlign: 'right', lineHeight: 1.4 }}>Un serveur validera et encaissera ta commande.</p>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', left: '50%', bottom: dueTotal > 0 ? 96 : 24, transform: 'translateX(-50%)', zIndex: 20, background: 'rgba(12,12,22,.96)', border: '1px solid rgba(78,232,200,.5)', color: '#fff', fontFamily: FONT, fontSize: 13, fontWeight: 600, padding: '10px 16px', borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,.45)', whiteSpace: 'nowrap' }}>{toast}</div>
      )}
    </Shell>
  )
}

// ── Une ligne de MA commande (avec statut live) ──
function MyLine({ item, cur = 'EUR' }) {
  const isPre = item.source === ORDER_SOURCE.PREORDER
  const isInc = item.source === ORDER_SOURCE.INCLUDED
  const served = item.status === ONSITE_STATUS.SERVED || item.status === PREORDER_STATUS.SERVED
  const statusLabel = served
    ? `Servie${item.served_by_name ? ' par ' + item.served_by_name : ''}`
    : isPre ? 'Précommande · payée'
    : isInc ? 'Incluse dans ton billet'
    : item.paid_at ? 'Payée'
    : (ONSITE_STATUS_LABEL[item.status] || 'Envoyée')
  const statusColor = served ? '#22c55e' : isPre ? C.gold : isInc ? C.teal : (ONSITE_STATUS_COLOR[item.status] || C.teal)
  return (
    <div className="order-live-line" style={{ opacity: served ? 0.72 : 1 }}>
      <OrderItemVisual item={item} preorder={isPre || isInc}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: FONT, fontSize: 15, fontWeight: 600, color: '#fff', margin: 0 }}>{item.name} <span style={{ color: 'rgba(255,255,255,.5)', fontWeight: 500 }}>×{item.quantity}</span></p>
        <span style={{ display: 'inline-block', marginTop: 5, fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: '.04em', color: statusColor, background: `${statusColor}24`, border: `1px solid ${statusColor}59`, borderRadius: 8, padding: '3px 9px' }}>{statusLabel}</span>
      </div>
      <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: (isPre || isInc) ? 'rgba(255,255,255,.5)' : C.gold, flexShrink: 0 }}>{(isPre || isInc) ? 'incluse' : euro(item.unitPrice * item.quantity, cur)}</span>
    </div>
  )
}

function OrderItemVisual({ item, preorder = false }) {
  const image = item?.imageUrl || item?.mediaUrl || item?.image
  return <span className="order-item-visual">{image
    ? <img src={image} alt=""/>
    : preorder
      ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4Z"/><path d="M12 5v14" strokeDasharray="2 3"/></svg>
      : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M7 3h10l-1 18H8L7 3Z"/><path d="M8 8h8M10 3l1-2"/></svg>
  }</span>
}

function Stepper({ label, onClick, disabled, tone }) {
  const teal = tone === 'teal'
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: 44, height: 44, borderRadius: 12, cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0,
      fontFamily: FONT, fontSize: 20, fontWeight: 700, lineHeight: 1, display: 'grid', placeItems: 'center',
      background: disabled ? 'rgba(255,255,255,.07)' : teal ? '#3ed6b5' : 'rgba(255,255,255,.08)',
      border: `1px solid ${disabled ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.14)'}`,
      color: disabled ? 'rgba(255,255,255,.35)' : teal ? '#04120e' : 'rgba(255,255,255,.75)',
    }}>{label}</button>
  )
}

const sectionLabel = { fontFamily: FONT, fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', margin: 0 }
const cardStyle = { background: '#0e0f16', border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, boxShadow: '0 8px 24px rgba(0,0,0,.35)' }

function Shell({ children }) {
  return (
    <div className="onsite-order-shell" style={{ minHeight: '100vh', background: C.obsidian, color: '#fff' }}>
      <style>{`
        .onsite-order-shell{background:radial-gradient(circle at 50% -10%,rgba(132,68,255,.1),transparent 42%),#04040b!important;font-family:Inter,sans-serif}
        .onsite-order-shell>div{max-width:560px!important}
        .order-header{padding:20px 20px 22px;border-bottom:1px solid rgba(255,255,255,.08);position:sticky;top:0;z-index:5;background:rgba(4,4,11,.9);backdrop-filter:blur(22px)}
        .order-back{display:flex;align-items:center;gap:5px;background:none;border:0;color:rgba(255,255,255,.55);font:600 12px Inter,sans-serif;cursor:pointer;padding:0;margin-bottom:28px}
        .order-kicker{font:800 11px Inter,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#4ee8c8}
        .order-header h1{font:800 26px/1.05 Inter,sans-serif;letter-spacing:-.03em;color:#fff;margin:8px 0 12px}.order-header p{display:flex;justify-content:space-between;gap:16px;font:500 12px Inter,sans-serif;color:rgba(255,255,255,.48);margin:0}.order-header p span{color:#c8a96e;font-weight:700}
        .order-content{padding:22px 18px 140px;display:flex;flex-direction:column;gap:30px}
        .order-product-card,.order-live-line{display:flex;align-items:center;gap:13px;padding:13px;border-radius:16px;background:#0e0f16;border:1px solid rgba(255,255,255,.08);box-shadow:0 8px 24px rgba(0,0,0,.35)}
        .order-item-visual{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;overflow:hidden;flex:none;color:#4ee8c8;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08)}.order-item-visual img{width:100%;height:100%;object-fit:cover}.order-item-visual svg{width:21px;height:21px}
        .order-total-bar{position:fixed;left:0;right:0;bottom:0;z-index:10;max-width:560px;margin:0 auto;padding:17px 20px calc(17px + env(safe-area-inset-bottom));background:rgba(8,9,17,.96);backdrop-filter:blur(22px);border:1px solid rgba(255,255,255,.1);border-bottom:0;border-radius:20px 20px 0 0;box-shadow:0 -18px 55px rgba(0,0,0,.45)}
        @media(max-width:600px){.order-header{padding:18px 18px 20px}.order-content{padding-left:14px;padding-right:14px}.order-header h1{font-size:24px}}
      `}</style>
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
  return <button onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '12px 20px', minHeight: 44, borderRadius: 12, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.14)', color: 'rgba(255,255,255,.9)', fontFamily: FONT, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>Retour</button>
}
