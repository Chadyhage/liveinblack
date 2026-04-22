import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import { getUserId } from '../utils/messaging'
import { getWallet, addFunds } from '../utils/wallet'

const QUICK_AMOUNTS = [5, 10, 20, 50, 100]

const styles = {
  page: {
    position: 'relative',
    zIndex: 1,
    padding: '24px 16px',
    maxWidth: '480px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  card: {
    background: 'rgba(8,10,20,0.55)',
    backdropFilter: 'blur(22px) saturate(1.6)',
    WebkitBackdropFilter: 'blur(22px) saturate(1.6)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: '12px',
    padding: '24px',
  },
  label: {
    fontFamily: '"DM Mono", monospace',
    fontSize: '9px',
    letterSpacing: '0.35em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.28)',
  },
  balanceAmount: {
    fontFamily: '"Cormorant Garamond", serif',
    fontWeight: 300,
    fontSize: 'clamp(2rem, 12vw, 4rem)',
    lineHeight: 1,
    color: '#c8a96e',
    letterSpacing: '-0.02em',
  },
  flashMsg: {
    fontFamily: '"DM Mono", monospace',
    fontSize: '10px',
    letterSpacing: '0.2em',
    textTransform: 'uppercase',
    color: '#4ee8c8',
  },
  subText: {
    fontFamily: '"DM Mono", monospace',
    fontSize: '10px',
    color: 'rgba(255,255,255,0.22)',
  },
  quickChip: {
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.13)',
    borderRadius: '4px',
    padding: '12px 0',
    width: '100%',
    fontFamily: '"DM Mono", monospace',
    fontSize: '13px',
    color: 'rgba(255,255,255,0.8)',
    cursor: 'pointer',
    transition: 'border-color 0.18s, color 0.18s',
  },
  quickChipHover: {
    borderColor: '#4ee8c8',
    color: '#4ee8c8',
  },
  customBtn: {
    width: '100%',
    padding: '12px',
    borderRadius: '4px',
    border: '1px dashed rgba(255,255,255,0.12)',
    background: 'transparent',
    fontFamily: '"DM Mono", monospace',
    fontSize: '11px',
    letterSpacing: '0.15em',
    color: 'rgba(255,255,255,0.28)',
    cursor: 'pointer',
    transition: 'border-color 0.18s, color 0.18s',
  },
  input: {
    background: 'rgba(6,8,16,0.6)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: '4px',
    fontFamily: '"DM Mono", monospace',
    fontSize: '13px',
    color: 'rgba(255,255,255,0.9)',
    padding: '11px 14px',
    flex: 1,
    outline: 'none',
    transition: 'border-color 0.18s',
  },
  btnGold: {
    padding: '11px 20px',
    background: 'linear-gradient(135deg, rgba(200,169,110,0.22), rgba(200,169,110,0.06))',
    border: '1px solid rgba(200,169,110,0.45)',
    borderRadius: '4px',
    fontFamily: '"DM Mono", monospace',
    fontSize: '11px',
    letterSpacing: '0.25em',
    textTransform: 'uppercase',
    color: '#c8a96e',
    cursor: 'pointer',
    transition: 'opacity 0.18s',
    flexShrink: 0,
  },
  btnGhost: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: '4px',
    fontFamily: '"DM Mono", monospace',
    fontSize: '11px',
    letterSpacing: '0.15em',
    color: 'rgba(255,255,255,0.5)',
    padding: '11px 14px',
    cursor: 'pointer',
    flexShrink: 0,
  },
  infoCard: {
    background: 'rgba(78,232,200,0.04)',
    border: '1px solid rgba(78,232,200,0.15)',
    borderRadius: '12px',
    padding: '16px',
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-start',
  },
  infoTitle: {
    fontFamily: '"DM Mono", monospace',
    fontSize: '10px',
    letterSpacing: '0.2em',
    textTransform: 'uppercase',
    color: '#4ee8c8',
    marginBottom: '6px',
  },
  infoText: {
    fontFamily: '"DM Mono", monospace',
    fontSize: '10px',
    color: 'rgba(255,255,255,0.32)',
    lineHeight: 1.7,
  },
  historyItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    background: 'rgba(8,10,20,0.55)',
    backdropFilter: 'blur(22px) saturate(1.6)',
    WebkitBackdropFilter: 'blur(22px) saturate(1.6)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '8px',
  },
  txIcon: (isCredit) => ({
    width: '34px',
    height: '34px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    background: isCredit ? 'rgba(78,232,200,0.08)' : 'rgba(224,90,170,0.08)',
    border: `1px solid ${isCredit ? 'rgba(78,232,200,0.2)' : 'rgba(224,90,170,0.2)'}`,
    color: isCredit ? '#4ee8c8' : '#e05aaa',
    fontFamily: '"DM Mono", monospace',
    fontSize: '14px',
  }),
  txLabel: {
    fontFamily: '"Cormorant Garamond", serif',
    fontWeight: 400,
    fontSize: '15px',
    color: 'rgba(255,255,255,0.85)',
    display: 'block',
  },
  txDate: {
    fontFamily: '"DM Mono", monospace',
    fontSize: '10px',
    color: 'rgba(255,255,255,0.25)',
    display: 'block',
    marginTop: '2px',
  },
  txAmount: (isCredit) => ({
    fontFamily: '"DM Mono", monospace',
    fontSize: '13px',
    fontWeight: 500,
    flexShrink: 0,
    color: isCredit ? '#4ee8c8' : '#e05aaa',
  }),
  emptyState: {
    textAlign: 'center',
    padding: '40px 0',
  },
  emptyText: {
    fontFamily: '"DM Mono", monospace',
    fontSize: '11px',
    letterSpacing: '0.1em',
    color: 'rgba(255,255,255,0.22)',
    marginTop: '12px',
  },
  divider: {
    height: '1px',
    background: 'rgba(255,255,255,0.06)',
    margin: '0',
  },
  backBtn: {
    background: 'transparent',
    border: 'none',
    color: 'rgba(255,255,255,0.38)',
    fontSize: '26px',
    lineHeight: 1,
    cursor: 'pointer',
    padding: '0 4px',
    transition: 'color 0.18s',
    flexShrink: 0,
  },
  pageTitle: {
    fontFamily: '"Cormorant Garamond", serif',
    fontWeight: 300,
    fontSize: '28px',
    letterSpacing: '0.08em',
    color: 'rgba(255,255,255,0.92)',
  },
}

// Eyebrow section label with teal accent line (matches HomePage style)
function EyebrowLabel({ text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
      <div style={{ width: '28px', height: '1px', background: '#4ee8c8', flexShrink: 0 }} />
      <span style={{
        fontFamily: '"DM Mono", monospace',
        fontSize: '9px',
        letterSpacing: '0.4em',
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.25)',
      }}>{text}</span>
    </div>
  )
}

export default function WalletPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const userId = getUserId(user)

  const [wallet, setWallet] = useState({ balance: 0, transactions: [] })
  const [customAmount, setCustomAmount] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [flash, setFlash] = useState(false)
  const [hoveredChip, setHoveredChip] = useState(null)
  const [inputFocused, setInputFocused] = useState(false)

  useEffect(() => {
    if (userId) setWallet(getWallet(userId))
  }, [userId])

  function handleAdd(amount) {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) return
    const w = addFunds(userId, amt, 'Rechargement')
    if (w) setWallet(w)
    setFlash(true)
    setTimeout(() => setFlash(false), 1200)
    setCustomAmount('')
    setShowCustom(false)
  }

  function fmtDate(iso) {
    return new Date(iso).toLocaleDateString('fr', { day: '2-digit', month: 'short', year: '2-digit' })
  }

  return (
    <Layout>
      <div style={styles.page}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => navigate(-1)}
            style={styles.backBtn}
            onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.75)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.38)'}
          >
            ‹
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* SVG wallet icon */}
            <svg viewBox="0 0 22 20" fill="none" width="20" height="20" style={{ flexShrink: 0, opacity: 0.55 }}>
              <rect x="1" y="4" width="20" height="13" rx="2" stroke="rgba(255,255,255,0.6)" strokeWidth="1.3" />
              <path d="M1 8h20" stroke="rgba(255,255,255,0.6)" strokeWidth="1.3" />
              <circle cx="16" cy="13" r="1.5" fill="rgba(200,169,110,0.8)" />
              <path d="M4 2h10a2 2 0 012 2H4V2z" stroke="rgba(255,255,255,0.35)" strokeWidth="1" fill="none" />
            </svg>
            <h1 style={styles.pageTitle}>Portefeuille</h1>
          </div>
        </div>

        {/* Balance card */}
        <div
          style={{
            ...styles.card,
            textAlign: 'center',
            transition: 'border-color 0.3s, background 0.3s',
            ...(flash ? { borderColor: 'rgba(78,232,200,0.3)', background: 'rgba(78,232,200,0.04)' } : {}),
          }}
        >
          <p style={styles.label}>Solde disponible</p>
          <p style={{ ...styles.balanceAmount, marginTop: '8px' }}>
            {wallet.balance.toFixed(2)}&thinsp;€
          </p>
          {flash && (
            <p style={{ ...styles.flashMsg, marginTop: '10px' }}>
              Fonds ajoutés
            </p>
          )}
          <p style={{ ...styles.subText, marginTop: '8px' }}>
            Tous tes paiements sont prélevés de ce solde
          </p>
        </div>

        {/* Recharge */}
        <div>
          <EyebrowLabel text="Recharger" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', marginBottom: '10px' }}>
            {QUICK_AMOUNTS.map(a => (
              <button
                key={a}
                onClick={() => handleAdd(a)}
                style={{
                  ...styles.quickChip,
                  ...(hoveredChip === a ? styles.quickChipHover : {}),
                }}
                onMouseEnter={() => setHoveredChip(a)}
                onMouseLeave={() => setHoveredChip(null)}
              >
                {a}€
              </button>
            ))}
          </div>
          {!showCustom ? (
            <button
              onClick={() => setShowCustom(true)}
              style={styles.customBtn}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.28)'
                e.currentTarget.style.color = 'rgba(255,255,255,0.5)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
                e.currentTarget.style.color = 'rgba(255,255,255,0.28)'
              }}
            >
              + Montant personnalisé
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                style={{
                  ...styles.input,
                  ...(inputFocused ? { borderColor: '#4ee8c8', boxShadow: '0 0 0 3px rgba(78,232,200,0.06)' } : {}),
                }}
                type="number"
                min="1"
                placeholder="Montant en €"
                value={customAmount}
                onChange={e => setCustomAmount(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd(customAmount)}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                autoFocus
              />
              <button
                onClick={() => handleAdd(customAmount)}
                disabled={!customAmount || parseFloat(customAmount) <= 0}
                style={{
                  ...styles.btnGold,
                  opacity: (!customAmount || parseFloat(customAmount) <= 0) ? 0.3 : 1,
                  cursor: (!customAmount || parseFloat(customAmount) <= 0) ? 'not-allowed' : 'pointer',
                }}
              >
                OK
              </button>
              <button
                onClick={() => setShowCustom(false)}
                style={styles.btnGhost}
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Security info */}
        <div style={styles.infoCard}>
          <div style={{ width: '18px', height: '18px', flexShrink: 0, marginTop: '1px' }}>
            <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18">
              <path d="M8 1L2 3.5V8C2 11.3 4.6 14.4 8 15C11.4 14.4 14 11.3 14 8V3.5L8 1Z" stroke="rgba(78,232,200,0.6)" strokeWidth="1" fill="rgba(78,232,200,0.06)" />
              <path d="M5.5 8L7 9.5L10.5 6" stroke="#4ee8c8" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <p style={styles.infoTitle}>Paiements sécurisés — sans carte</p>
            <p style={styles.infoText}>
              Réservations et réservations de groupe sont débitées de ce portefeuille.
              Aucun prélèvement direct sur ta carte bancaire.
            </p>
          </div>
        </div>

        {/* History */}
        <div>
          <EyebrowLabel text="Historique" />
          {wallet.transactions.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '4px',
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.03)',
                margin: '0 auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <svg viewBox="0 0 20 20" fill="none" width="20" height="20">
                  <rect x="3" y="5" width="14" height="10" rx="1" stroke="rgba(255,255,255,0.2)" strokeWidth="1"/>
                  <path d="M3 8H17" stroke="rgba(255,255,255,0.2)" strokeWidth="1"/>
                  <rect x="5" y="11" width="4" height="2" rx="0.5" fill="rgba(255,255,255,0.2)"/>
                </svg>
              </div>
              <p style={styles.emptyText}>Aucune transaction pour l&apos;instant</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {wallet.transactions.map(tx => {
                const isCredit = tx.type === 'credit'
                return (
                  <div key={tx.id} style={styles.historyItem}>
                    <div style={styles.txIcon(isCredit)}>
                      {isCredit ? '↓' : '↑'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={styles.txLabel}>{tx.description}</span>
                      <span style={styles.txDate}>{fmtDate(tx.date)}</span>
                    </div>
                    <span style={styles.txAmount(isCredit)}>
                      {isCredit ? '+' : '-'}{tx.amount.toFixed(2)}€
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
