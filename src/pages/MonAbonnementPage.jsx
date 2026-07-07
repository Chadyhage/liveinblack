import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import { getUserId } from '../utils/messaging'
import { getProviderProfile } from '../utils/services'
import { subPresentation, subPriceLabel, PROVIDER_SUB, daysUntil } from '../utils/providerSub'
import { regionToCurrency, fmtMoney } from '../utils/money'
import { regions } from '../data/regions'
import { normalizeRegionId, inferRegionIdFromCity } from '../utils/locations'

const FONT = 'Inter, system-ui, sans-serif'
const C = { obsidian: '#04040b', teal: '#4ee8c8', gold: '#c8a96e', pink: '#e05aaa' }
const card = { background: 'rgba(8,10,20,.62)', border: '1px solid rgba(255,255,255,.09)', borderRadius: 16, backdropFilter: 'blur(20px)' }
const primaryButton = { minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 20px', border: 'none', borderRadius: 11, cursor: 'pointer', background: `linear-gradient(135deg,${C.gold},#e0c48a)`, color: C.obsidian, fontFamily: FONT, fontSize: 13, fontWeight: 800 }

function fmtDate(ms) {
  if (!ms) return '—'
  try { return new Date(Number(ms)).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) } catch { return '—' }
}

export default function MonAbonnementPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const uid = getUserId(user)
  const [profile, setProfile] = useState(() => getProviderProfile(uid))
  const [payments, setPayments] = useState([])
  const [loadingPayments, setLoadingPayments] = useState(true)
  const [renewing, setRenewing] = useState(false)
  const [msg, setMsg] = useState('')

  // Statut/dates en temps réel (providers/{uid}, maintenu par le webhook).
  useEffect(() => {
    if (!uid) return undefined
    let unsub = () => {}
    import('../utils/firestore-sync').then(({ listenDoc }) => {
      unsub = listenDoc(`providers/${uid}`, remote => { if (remote) setProfile(remote) })
    }).catch(() => {})
    return () => { try { unsub() } catch {} }
  }, [uid])

  // Historique des paiements d'abonnement (subscription_payments, lecture owner).
  useEffect(() => {
    if (!uid) return
    let alive = true
    ;(async () => {
      try {
        const [{ loadCollection }, { where }] = await Promise.all([
          import('../utils/firestore-sync'),
          import('firebase/firestore'),
        ])
        const rows = await loadCollection('subscription_payments', [where('providerUid', '==', uid)])
        if (!alive) return
        rows.sort((a, b) => (Number(b.paidAt) || 0) - (Number(a.paidAt) || 0))
        setPayments(rows)
      } catch { /* règle Firestore ou hors-ligne — on affiche « aucun » */ }
      finally { if (alive) setLoadingPayments(false) }
    })()
    return () => { alive = false }
  }, [uid])

  if (user?.role !== 'prestataire') return <Navigate to="/prestataires" replace />

  const p = subPresentation(profile)
  const exp = Number(profile?.subscriptionExpiresAt) || 0
  const daysLeft = exp ? Math.max(0, daysUntil(exp, Date.now())) : 0

  // Zone → méthode de paiement (1 prestataire = 1 zone).
  const regionId = normalizeRegionId(profile?.regionId || profile?.country || profile?.zonesIntervention?.[0])
    || inferRegionIdFromCity(profile?.city || profile?.location)
    || normalizeRegionId(user?.country) || 'france'
  const zone = regions.find(r => r.id === regionId) || null
  const currency = regionToCurrency(regionId)

  async function handleRenew() {
    if (renewing) return
    setRenewing(true)
    try {
      const { authHeaders } = await import('../utils/apiAuth')
      if (currency === 'XOF') {
        const res = await fetch('/api/fedapay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
          body: JSON.stringify({ action: 'subscribe', email: user?.email || undefined, returnTo: '/mon-abonnement' }),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok && data.url) { window.location.href = data.url; return }
        setRenewing(false); setMsg(data.error || 'Impossible de démarrer le paiement. Réessaie.')
        return
      }
      const res = await fetch('/api/create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({}),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.alreadyActive) { setRenewing(false); setMsg('Ton abonnement est déjà actif.'); return }
      if (res.ok && data.url) { window.location.href = data.url; return }
      setRenewing(false); setMsg(data.error || 'Impossible de démarrer le paiement. Réessaie.')
    } catch { setRenewing(false); setMsg('Erreur réseau. Réessaie dans un instant.') }
  }

  const info = (label, value, accent) => (
    <div style={{ flex: '1 1 140px', minWidth: 140, padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)' }}>
      <p style={{ fontFamily: FONT, fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)', margin: 0 }}>{label}</p>
      <p style={{ fontFamily: FONT, fontSize: 16, fontWeight: 800, color: accent || '#fff', margin: '5px 0 0' }}>{value}</p>
    </div>
  )

  return (
    <Layout>
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '22px 16px 110px' }}>
        <button onClick={() => navigate('/proposer')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'rgba(255,255,255,.5)', fontFamily: FONT, fontSize: 12.5, cursor: 'pointer', padding: 0, marginBottom: 14 }}>← Mon espace</button>
        <h1 style={{ fontFamily: FONT, fontSize: 26, letterSpacing: '-.5px', margin: '0 0 4px' }}>Mon abonnement</h1>
        <p style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,.45)', margin: 0 }}>Ce qui rend ton profil visible sur LIVEINBLACK.</p>

        {/* Statut */}
        <section style={{ ...card, padding: 18, marginTop: 20, borderColor: `${p.color}44` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.color }} />
            <h2 style={{ fontFamily: FONT, fontSize: 17, fontWeight: 800, margin: 0, color: p.color }}>{p.title}</h2>
            <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: p.color, background: `${p.color}1e`, border: `1px solid ${p.color}55`, borderRadius: 999, padding: '2px 8px' }}>
              {p.status === 'active' ? 'Actif' : p.status === 'expiring_soon' ? 'Expire bientôt' : p.status === 'grace' ? 'Grâce' : p.status === 'expired' ? 'Expiré' : 'Inactif'}
            </span>
          </div>
          <p style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,.6)', margin: '10px 0 0', lineHeight: 1.5 }}>{p.message}</p>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
            {info('Jours restants', exp ? `${daysLeft} j` : '—', daysLeft > 0 ? C.teal : C.pink)}
            {info('Expire le', fmtDate(exp))}
            {info('Zone', zone ? `${zone.flag} ${zone.name}` : '—')}
            {info('Tarif', currency === 'XOF' ? subPriceLabel() : '9,99 € / mois')}
          </div>

          <p style={{ fontFamily: FONT, fontSize: 11.5, color: 'rgba(255,255,255,.4)', margin: '12px 0 0' }}>
            {currency === 'XOF'
              ? 'Paiement Mobile Money / carte (FedaPay) · renouvellement manuel · aucun prélèvement automatique'
              : 'Carte bancaire (Stripe) · renouvellement automatique chaque mois'}
          </p>

          {msg && <p style={{ fontFamily: FONT, fontSize: 12, color: C.pink, margin: '12px 0 0' }}>{msg}</p>}

          {/* En EUR actif : renouvellement auto, pas de bouton. Sinon CTA. */}
          {!(currency === 'EUR' && p.status === 'active') && (
            <button onClick={handleRenew} disabled={renewing} style={{ ...primaryButton, marginTop: 16, opacity: renewing ? 0.6 : 1, cursor: renewing ? 'wait' : 'pointer' }}>
              {renewing ? 'Redirection…' : p.cta}
            </button>
          )}
        </section>

        {/* Historique des paiements */}
        <section style={{ ...card, padding: 18, marginTop: 16 }}>
          <h2 style={{ fontFamily: FONT, fontSize: 15, fontWeight: 800, margin: '0 0 4px' }}>Historique des paiements</h2>
          <p style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(255,255,255,.4)', margin: '0 0 14px' }}>Tes reçus d'abonnement.</p>

          {loadingPayments ? (
            <p style={{ fontFamily: FONT, fontSize: 12.5, color: 'rgba(255,255,255,.35)' }}>Chargement…</p>
          ) : payments.length === 0 ? (
            <p style={{ fontFamily: FONT, fontSize: 12.5, color: 'rgba(255,255,255,.35)' }}>Aucun paiement pour le moment.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {payments.map(pay => (
                <div key={pay._docId || pay.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '11px 14px', borderRadius: 11, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)' }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: '#fff', margin: 0 }}>{fmtMoney(pay.amount, (pay.currency || 'XOF').toUpperCase())}</p>
                    <p style={{ fontFamily: FONT, fontSize: 11, color: 'rgba(255,255,255,.4)', margin: '3px 0 0' }}>
                      {fmtDate(pay.periodStart)} → {fmtDate(pay.periodEnd)}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: C.teal, background: 'rgba(78,232,200,.1)', border: '1px solid rgba(78,232,200,.3)', borderRadius: 999, padding: '2px 8px' }}>Payé</span>
                    <p style={{ fontFamily: FONT, fontSize: 10.5, color: 'rgba(255,255,255,.35)', margin: '5px 0 0' }}>{fmtDate(pay.paidAt)} · {pay.paymentMethod || 'fedapay'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </Layout>
  )
}
