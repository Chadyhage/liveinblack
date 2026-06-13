// ─── Notifications in-app ────────────────────────────────────────────────────
// Stockage localStorage + sync Firestore
// Types : 'application_approved' | 'application_rejected' | 'application_needs_changes' | 'new_order'

const KEY = uid => `lib_notifications_${uid}`

export function createNotification(uid, type, title, body, data = {}) {
  if (!uid) return null
  try {
    const notif = {
      id: 'notif-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
      type,
      title,
      body,
      data,
      read: false,
      createdAt: Date.now(),
    }
    const all = getNotifications(uid)
    // Max 50 notifications gardées
    const updated = [notif, ...all].slice(0, 50)
    localStorage.setItem(KEY(uid), JSON.stringify(updated))

    // Sync Firestore — read-merge-write OBLIGATOIRE ici car createNotification
    // est souvent appelé CROSS-USER (l'admin notifie le candidat). Le cache
    // local de l'admin ne contient pas les notifs du destinataire ; un simple
    // overwrite effacerait ses notifications existantes. On lit donc Firestore
    // d'abord et on fusionne (dédup par id, cap 50, tri par date).
    import('../firebase').then(async ({ USE_REAL_FIREBASE, db }) => {
      if (!USE_REAL_FIREBASE) return
      const { doc, getDoc, setDoc } = await import('firebase/firestore')
      let remoteItems = []
      try {
        const snap = await getDoc(doc(db, 'notifications', uid))
        if (snap.exists()) remoteItems = snap.data().items || []
      } catch {}
      const byId = new Map()
      for (const n of [notif, ...updated, ...remoteItems]) {
        if (n && n.id && !byId.has(n.id)) byId.set(n.id, n)
      }
      const merged = [...byId.values()]
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, 50)
      await setDoc(doc(db, 'notifications', uid), { items: merged, updatedAt: Date.now() }, { merge: true })
    }).catch(() => {})

    return notif
  } catch { return null }
}

export function getNotifications(uid) {
  if (!uid) return []
  try { return JSON.parse(localStorage.getItem(KEY(uid)) || '[]') } catch { return [] }
}

export function getUnreadCount(uid) {
  return getNotifications(uid).filter(n => !n.read).length
}

export function markRead(uid, notifId) {
  if (!uid) return
  try {
    const all = getNotifications(uid).map(n => n.id === notifId ? { ...n, read: true } : n)
    localStorage.setItem(KEY(uid), JSON.stringify(all))
    import('./firestore-sync').then(({ syncDoc }) => {
      syncDoc(`notifications/${uid}`, { items: all, updatedAt: Date.now() })
    }).catch(() => {})
  } catch {}
}

export function markAllRead(uid) {
  if (!uid) return
  try {
    const all = getNotifications(uid).map(n => ({ ...n, read: true }))
    localStorage.setItem(KEY(uid), JSON.stringify(all))
    import('./firestore-sync').then(({ syncDoc }) => {
      syncDoc(`notifications/${uid}`, { items: all, updatedAt: Date.now() })
    }).catch(() => {})
  } catch {}
}

// Charge les notifications Firestore (cross-device)
export async function syncNotificationsFromFirestore(uid) {
  if (!uid) return
  try {
    const { USE_REAL_FIREBASE, db } = await import('../firebase')
    if (!USE_REAL_FIREBASE) return
    const { doc, getDoc } = await import('firebase/firestore')
    const snap = await getDoc(doc(db, 'notifications', uid))
    if (!snap.exists()) return
    const items = snap.data().items || []
    // Merge : garde les notifs locales non présentes dans Firestore
    const local = getNotifications(uid)
    const remoteIds = new Set(items.map(n => n.id))
    const onlyLocal = local.filter(n => !remoteIds.has(n.id))
    const merged = [...items, ...onlyLocal]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50)
    localStorage.setItem(KEY(uid), JSON.stringify(merged))
  } catch {}
}

// Icônes et couleurs par type
export const NOTIF_CONFIG = {
  application_approved:       { icon: '✅', color: '#22c55e', label: 'Dossier approuvé' },
  application_rejected:       { icon: '❌', color: '#e05aaa', label: 'Dossier refusé'   },
  application_needs_changes:  { icon: '⚠️', color: '#f59e0b', label: 'Corrections requises' },
  new_order:                  { icon: '🛒', color: '#4ee8c8', label: 'Nouvelle commande' },
  message:                    { icon: '💬', color: '#8b5cf6', label: 'Nouveau message'   },
}
