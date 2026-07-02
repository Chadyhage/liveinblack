// Panneau « Reversements » vendeur (organisateur / prestataire).
// - Connecter son compte bancaire via Stripe Connect (zone Stripe) ;
// - ou, hors zone Stripe (Afrique), voir son « solde à reverser » et demander
//   un virement / mobile money (traité manuellement par l'équipe).
// Réutilisable : <PayoutPanel uid={user.uid} returnPath="/mes-evenements" />

import { useState, useEffect } from 'react'

const DM = "'DM Mono', monospace"
const CG = "Inter, sans-serif"

const card = {
  background: 'rgba(8,10,20,0.55)', backdropFilter: 'blur(18px)',
  border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12, padding: 18,
}
const label = { fontFamily: DM, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', margin: 0 }
const btn = (color) => ({
  width: '100%', padding: '12px', marginTop: 12, borderRadius: 6, cursor: 'pointer',
  fontFamily: DM, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase',
  background: `${color}22`, border: `1px solid ${color}66`, color,
})

function eur(cents, cur = 'eur') {
  return (Number(cents || 0) / 100).toLocaleString('fr-FR', { style: 'currency', currency: (cur || 'eur').toUpperCase() })
}

export default function PayoutPanel({ uid, returnPath = '/mon-dossier' }) {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  async function load() {
    try {
      const { db } = await import('../firebase')
      const { doc, getDoc } = await import('firebase/firestore')
      const [uSnap, bSnap] = await Promise.all([
        getDoc(doc(db, 'users', uid)),
        getDoc(doc(db, 'seller_balances', uid)),
      ])
      const u = uSnap.exists() ? uSnap.data() : {}
      const b = bSnap.exists() ? bSnap.data() : {}
      setStatus({
        payoutMode: u.payoutMode || 'none',
        chargesEnabled: u.stripeChargesEnabled === true,
        stripeAccountId: u.stripeAccountId || null,
        amountDueCents: Number(b.amountDueCents || 0),
        currency: b.currency || 'eur',
      })
    } catch {
      setStatus({ payoutMode: 'none', chargesEnabled: false, amountDueCents: 0, currency: 'eur' })
    }
    setLoading(false)
  }

  useEffect(() => {
    if (!uid) return
    load()
    const params = new URLSearchParams(window.location.search)
    if (params.get('connect') === 'done') {
      // Au retour de l'onboarding Stripe : forcer un refresh serveur du statut.
      import('../utils/apiAuth').then(({ authHeaders }) => authHeaders())
        .then(h => fetch(`/api/connect-status?uid=${encodeURIComponent(uid)}`, { headers: h }))
        .then(() => load()).catch(() => {})
    }
  }, [uid]) // eslint-disable-line react-hooks/exhaustive-deps

  async function connect() {
    setBusy(true); setMsg(null)
    try {
      const { authHeaders } = await import('../utils/apiAuth')
      const r = await fetch('/api/connect-onboard', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ uid, returnPath }),
      })
      const j = await r.json()
      if (j.url) { window.location.href = j.url; return }
      if (j.manual) {
        setMsg("Ton pays n'est pas pris en charge pour les reversements automatiques. Pas de souci : la plateforme te reversera manuellement (virement / mobile money) — tu verras ton solde ici.")
        await load()
      } else {
        setMsg(j.error || 'Le service de paiement n\'est pas encore activé. Réessaie bientôt.')
      }
    } catch {
      setMsg('Erreur réseau — réessaie.')
    }
    setBusy(false)
  }

  async function requestPayout() {
    setBusy(true); setMsg(null)
    try {
      const { db } = await import('../firebase')
      const { doc, setDoc } = await import('firebase/firestore')
      const id = `pr_${uid}_${Date.now()}`
      await setDoc(doc(db, 'payout_requests', id), {
        id, sellerId: uid,
        amountDueCents: status.amountDueCents,
        currency: status.currency,
        status: 'pending',
        createdAt: Date.now(),
      })
      setMsg("Demande de reversement envoyée ✅ — l'équipe LIVEINBLACK va la traiter.")
    } catch {
      setMsg('Erreur — réessaie.')
    }
    setBusy(false)
  }

  if (!uid) return null
  if (loading) {
    return <div style={card}><p style={{ ...label, color: 'rgba(255,255,255,0.3)' }}>Reversements — chargement…</p></div>
  }

  const due = status.amountDueCents > 0
  const manual = status.payoutMode === 'manual'
  const connected = status.chargesEnabled

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <p style={label}>💸 Mes reversements</p>
        {connected && <span style={{ fontFamily: DM, fontSize: 9, color: '#4ee8c8', letterSpacing: '0.1em' }}>✓ COMPTE CONNECTÉ</span>}
      </div>

      {/* Solde à reverser */}
      {due && (
        <div style={{ marginTop: 12 }}>
          <p style={{ ...label, color: 'rgba(255,255,255,0.3)' }}>Solde à reverser</p>
          <p style={{ fontFamily: CG, fontSize: 32, fontWeight: 300, color: '#c8a96e', margin: '2px 0 0', lineHeight: 1 }}>
            {eur(status.amountDueCents, status.currency)}
          </p>
        </div>
      )}

      {/* Cas 1 : pays hors zone Stripe → reversement manuel */}
      {manual && (
        <>
          <p style={{ fontFamily: DM, fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, marginTop: 12 }}>
            Ton pays est réglé par <strong style={{ color: '#c8a96e' }}>virement / mobile money</strong> (Wave, Orange Money…). Demande un reversement de ton solde quand tu veux.
          </p>
          {due
            ? <button disabled={busy} onClick={requestPayout} style={btn('#c8a96e')}>{busy ? '…' : 'Demander un reversement'}</button>
            : <p style={{ fontFamily: DM, fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 10 }}>Aucun solde à reverser pour l'instant.</p>}
        </>
      )}

      {/* Cas 2 : compte Connect actif → reversements automatiques */}
      {!manual && connected && (
        <p style={{ fontFamily: DM, fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, marginTop: 12 }}>
          Tes ventes te sont reversées <strong style={{ color: '#4ee8c8' }}>automatiquement</strong> sur ton compte bancaire (sous 2–7 jours ouvrés), après commission LIVEINBLACK.
        </p>
      )}

      {/* Cas 3 : pas encore connecté → bouton de connexion */}
      {!manual && !connected && (
        <>
          <p style={{ fontFamily: DM, fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, marginTop: 12 }}>
            Connecte ton compte bancaire pour recevoir tes paiements automatiquement. Stripe gère la vérification d'identité et ton IBAN de façon sécurisée — nous ne le voyons jamais.
          </p>
          <button disabled={busy} onClick={connect} style={btn('#4ee8c8')}>{busy ? 'Ouverture…' : 'Connecter mon compte bancaire'}</button>
        </>
      )}

      {msg && (
        <p style={{ fontFamily: DM, fontSize: 10, color: 'rgba(78,232,200,0.85)', lineHeight: 1.6, marginTop: 12, background: 'rgba(78,232,200,0.06)', border: '1px solid rgba(78,232,200,0.15)', borderRadius: 6, padding: '8px 10px' }}>
          {msg}
        </p>
      )}
    </div>
  )
}
