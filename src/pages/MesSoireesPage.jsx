import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import { getUserId } from '../utils/messaging'
import { listenMyStaffAssignments, getMyStaffEvents } from '../utils/eventOrders'
import { isEventLive, isEventStarted } from '../utils/event-time'

// ─── « Mes soirées » — point d'entrée du MEMBRE STAFF ────────────────────────
// Un membre invité (serveur / contrôle entrée), souvent de rôle « client », n'a
// aucun accès natif au scanner. Cette page liste les événements où il figure dans
// un roster (staff_assignments) et lui ouvre le POS / le scan.

const FONT = 'Inter, sans-serif'
const C = { teal: '#4ee8c8', gold: '#c8a96e', violet: '#8b5cf6', obsidian: '#04040b' }

const ROLE_META = {
  serveur: { label: 'Serveur', color: C.teal, desc: 'Prends et sers les commandes au bar' },
  scan:    { label: 'Contrôle entrée', color: C.violet, desc: 'Scanne les billets à l\'entrée' },
  manager: { label: 'Manager', color: C.gold, desc: 'Gestion complète de la soirée' },
}

// Récupère les détails (date/lieu) d'un event — best-effort Firestore.
async function fetchEventLite(eventId) {
  try {
    const { db, USE_REAL_FIREBASE } = await import('../firebase')
    if (!USE_REAL_FIREBASE) return null
    const { doc, getDoc } = await import('firebase/firestore')
    const snap = await getDoc(doc(db, 'events', String(eventId)))
    return snap.exists() ? { ...snap.data(), id: snap.id } : null
  } catch { return null }
}

function StaffEventCard({ assignment, onOpen }) {
  const [ev, setEv] = useState(null)
  useEffect(() => {
    let cancelled = false
    fetchEventLite(assignment.eventId).then(e => { if (!cancelled) setEv(e) })
    return () => { cancelled = true }
  }, [assignment.eventId])

  const meta = ROLE_META[assignment.role] || { label: assignment.role, color: '#9ca3af', desc: '' }
  const live = ev && isEventLive(ev, Date.now(), 12 * 3600 * 1000)
  const started = ev && isEventStarted(ev)
  const dateLine = ev ? [ev.dateDisplay || ev.date, ev.city || ev.venue].filter(Boolean).join(' · ') : null

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 14, padding: 18, borderRadius: 16,
      background: '#0e0f16', border: `1px solid ${live ? meta.color + '55' : 'rgba(255,255,255,0.08)'}`,
      boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontFamily: FONT, fontSize: 18, fontWeight: 800, letterSpacing: '-0.4px', color: '#fff', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {assignment.eventName || ev?.name || 'Événement'}
          </p>
          {dateLine && <p style={{ fontFamily: FONT, fontSize: 12.5, color: 'rgba(255,255,255,0.5)', margin: '4px 0 0' }}>{dateLine}</p>}
        </div>
        <span style={{
          flexShrink: 0, fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
          color: meta.color, background: `${meta.color}1f`, border: `1px solid ${meta.color}59`, borderRadius: 8, padding: '4px 10px',
        }}>{meta.label}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {live ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FONT, fontSize: 11.5, fontWeight: 700, color: meta.color }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: meta.color }} /> En cours
          </span>
        ) : started ? (
          <span style={{ fontFamily: FONT, fontSize: 11.5, color: 'rgba(255,255,255,0.4)' }}>Soirée terminée</span>
        ) : (
          <span style={{ fontFamily: FONT, fontSize: 11.5, color: 'rgba(255,255,255,0.4)' }}>À venir</span>
        )}
        <span style={{ fontFamily: FONT, fontSize: 11.5, color: 'rgba(255,255,255,0.45)' }}>· {meta.desc}</span>
      </div>

      <button onClick={() => onOpen(assignment)} style={{
        width: '100%', padding: '14px', minHeight: 48, borderRadius: 12, border: '1px solid rgba(255,255,255,0.14)', cursor: 'pointer',
        fontFamily: FONT, fontSize: 15, fontWeight: 800, color: C.obsidian,
        background: meta.color,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}>
        {assignment.role === 'scan' ? 'Ouvrir le scan des entrées' : 'Ouvrir le POS bar'}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      </button>
    </div>
  )
}

export default function MesSoireesPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const uid = getUserId(user)
  const [assignments, setAssignments] = useState(() => getMyStaffEvents(uid))
  const [loaded, setLoaded] = useState(() => getMyStaffEvents(uid).length > 0)

  useEffect(() => {
    if (!uid) return
    const unsub = listenMyStaffAssignments(uid, (list) => { setAssignments(list); setLoaded(true) })
    return () => unsub()
  }, [uid])

  function openPos(assignment) {
    // Le scanner démarre en mode service (POS bar) pour un serveur, en mode entrée
    // pour un contrôle entrée. Il devra scanner un billet pour ouvrir un onglet.
    navigate('/scanner', { state: { mode: assignment.role === 'scan' ? 'entry' : 'service', eventId: assignment.eventId } })
  }

  const sorted = [...assignments].sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''))

  return (
    <Layout>
      <div style={{ maxWidth: 620, margin: '0 auto', padding: '24px 16px 40px' }}>
        <p style={{ fontFamily: FONT, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.gold, margin: 0 }}>Équipe</p>
        <h1 style={{ fontFamily: FONT, fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', color: '#fff', margin: '6px 0 4px' }}>Mes soirées</h1>
        <p style={{ fontFamily: FONT, fontSize: 14, color: 'rgba(255,255,255,0.5)', margin: '0 0 24px', lineHeight: 1.5 }}>
          Les événements où tu fais partie de l'équipe. Ouvre le POS le jour J pour servir ou scanner.
        </p>

        {sorted.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.6"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <p style={{ fontFamily: FONT, fontWeight: 700, fontSize: 18, color: '#fff', margin: 0 }}>
              {loaded ? 'Aucune soirée pour l\'instant' : 'Chargement…'}
            </p>
            <p style={{ fontFamily: FONT, fontSize: 13.5, color: 'rgba(255,255,255,0.5)', margin: 0, maxWidth: 340, lineHeight: 1.55 }}>
              Quand un organisateur t'ajoute à l'équipe d'une soirée (serveur ou contrôle entrée), elle apparaît ici.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {sorted.map(a => <StaffEventCard key={a.eventId} assignment={a} onOpen={openPos} />)}
          </div>
        )}
      </div>
    </Layout>
  )
}
