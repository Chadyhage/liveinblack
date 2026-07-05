import { useState } from 'react'
import { createPortal } from 'react-dom'
import { getConversations, getUserId, sendMessage } from '../utils/messaging'

// Modal réutilisable « partager dans une conversation ». Reproduit le partage
// d'événement (type de message dédié + payload JSON), mais générique : on lui
// passe messageType ('catalog_item', 'event'…) et payload. Rendu via portal
// pour échapper aux stacking contexts (bottom nav, cartes en position:relative).
export default function ShareToChatModal({ open, onClose, user, title = 'Partager', messageType, payload }) {
  const [sentTo, setSentTo] = useState(null)
  if (!open) return null
  const myId = getUserId(user)
  const myName = user?.name || 'Moi'
  const convs = myId ? getConversations(myId) : []

  function shareTo(conv) {
    if (!myId) return
    sendMessage(conv.id, myId, myName, messageType, JSON.stringify(payload))
    setSentTo(conv.id)
    setTimeout(() => { setSentTo(null); onClose() }, 750)
  }

  const T = { dmMono: "'DM Mono', monospace", teal: '#4ee8c8' }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 448, background: 'rgba(4,5,12,0.97)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '16px 16px 0 0', maxHeight: '62vh', display: 'flex', flexDirection: 'column', paddingBottom: 24 }}>
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ width: 40, height: 3, background: 'rgba(255,255,255,0.15)', borderRadius: 2, margin: '0 auto 12px' }} />
          <p style={{ fontFamily: T.dmMono, fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.42)', textAlign: 'center', margin: 0 }}>{title}</p>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {convs.length === 0 ? (
            <p style={{ textAlign: 'center', fontFamily: T.dmMono, fontSize: 11, color: 'rgba(255,255,255,0.28)', padding: '40px 20px', lineHeight: 1.7 }}>
              Aucune conversation pour l’instant.<br />Écris d’abord à quelqu’un, puis reviens partager.
            </p>
          ) : convs.map(conv => {
            const isGroup = conv.type === 'group'
            const otherName = isGroup
              ? conv.name
              : (() => { const otherId = conv.participants?.find(id => id !== myId); return conv.names?.[otherId] || 'Utilisateur' })()
            const initial = (otherName || '?').charAt(0).toUpperCase()
            const done = sentTo === conv.id
            return (
              <button key={conv.id} onClick={() => shareTo(conv)} disabled={done}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: done ? 'rgba(78,232,200,0.08)' : 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: done ? 'default' : 'pointer', textAlign: 'left' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isGroup ? 'rgba(200,169,110,0.15)' : 'rgba(78,232,200,0.12)', color: isGroup ? '#c8a96e' : T.teal, fontFamily: T.dmMono, fontSize: 14, fontWeight: 700 }}>
                  {isGroup ? '#' : initial}
                </div>
                <span style={{ flex: 1, fontFamily: 'Inter, sans-serif', fontSize: 14, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{otherName}</span>
                {done
                  ? <span style={{ fontFamily: T.dmMono, fontSize: 10, letterSpacing: '0.1em', color: T.teal }}>ENVOYÉ ✓</span>
                  : <span style={{ fontFamily: T.dmMono, fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>Envoyer</span>}
              </button>
            )
          })}
        </div>
      </div>
    </div>,
    document.body,
  )
}
