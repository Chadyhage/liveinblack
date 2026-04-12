import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import LoginPage from './pages/LoginPage'
import HomePage from './pages/HomePage'
import EventsPage from './pages/EventsPage'
import EventDetailPage from './pages/EventDetailPage'
import ProposerServicesPage from './pages/ProposerServicesPage'
import JeSuisUneBoitePage from './pages/JeSuisUneBoitePage'
import MesEvenementsPage from './pages/MesEvenementsPage'
import ProfilePage from './pages/ProfilePage'
import MessagingPage from './pages/MessagingPage'
import WalletPage from './pages/WalletPage'
import ScannerPage from './pages/ScannerPage'
import CGUPage from './pages/CGUPage'
import TicketPage from './pages/TicketPage'
import AgentPage from './pages/AgentPage'
import OnboardingOrganisateur from './pages/OnboardingOrganisateur'
import OnboardingPrestataire from './pages/OnboardingPrestataire'
import MonDossierPage from './pages/MonDossierPage'
import { AuthContext } from './context/AuthContext'
import AuthModal from './components/AuthModal'

// Normalize user: Firebase users have uid but no id — getUserId() needs user.id to match Firestore paths
function normalizeUser(val) {
  if (!val) return null
  if (val.uid && !val.id) return { ...val, id: val.uid }
  return val
}

function usePersistedUser() {
  const [user, setUserState] = useState(() => {
    try {
      const saved = localStorage.getItem('lib_user')
      return normalizeUser(saved ? JSON.parse(saved) : null)
    } catch {
      return null
    }
  })

  function setUser(val) {
    const normalized = normalizeUser(val)
    if (normalized) {
      localStorage.setItem('lib_user', JSON.stringify(normalized))
    } else {
      localStorage.removeItem('lib_user')
    }
    setUserState(normalized)
  }

  // Sync Firestore → localStorage on login
  useEffect(() => {
    const uid = user?.uid
    if (!uid) return
    import('./utils/firestore-sync').then(({ syncOnLogin }) => {
      syncOnLogin(uid).catch(() => {})
    }).catch(() => {})

    // Register service worker + FCM token for background push notifications
    if ('serviceWorker' in navigator && typeof Notification !== 'undefined') {
      navigator.serviceWorker.register('/firebase-messaging-sw.js').then(async reg => {
        try {
          if (Notification.permission !== 'granted') return
          const { getMessaging, getToken } = await import('firebase/messaging')
          const { app } = await import('./firebase')
          const messaging = getMessaging(app)
          // VAPID key — à remplacer par ta vraie clé VAPID Firebase Cloud Messaging
          const token = await getToken(messaging, {
            vapidKey: 'BEl62iUYgUivxIkv69yViEuiBIa40HI80NM1x6CrHOg3FfvbOgbNHwX0HFmIxAT6Gz0LI0E3sEX9RVjIHaH',
            serviceWorkerRegistration: reg,
          })
          if (token) {
            import('./utils/firestore-sync').then(({ syncDoc }) => {
              syncDoc(`users/${uid}`, { fcmToken: token })
            }).catch(() => {})
          }
        } catch {} // FCM setup fails silently if not configured
      }).catch(() => {})
    }
  }, [user?.uid]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-sync when tab regains focus — picks up changes made on other devices
  useEffect(() => {
    const uid = user?.uid
    if (!uid) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        import('./utils/firestore-sync').then(({ syncOnLogin }) => {
          syncOnLogin(uid).catch(() => {})
        }).catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [user?.uid]) // eslint-disable-line react-hooks/exhaustive-deps

  return { user, setUser }
}

// Wrapper: redirects to /connexion if user not logged in, preserving intended destination
function RequireAuth({ user, children, to }) {
  if (!user) return <Navigate to={`/connexion${to ? `?next=${encodeURIComponent(to)}` : ''}`} replace />
  return children
}

// Wrapper: only accessible for a specific role
function RequireRole({ user, role, children }) {
  if (!user) return <Navigate to="/connexion" replace />
  if (user.role !== role) return <Navigate to="/accueil" replace />
  return children
}

// Wrapper: accessible to organisateur or agent only
function RequireOrganisateur({ user, children }) {
  if (!user) return <Navigate to="/connexion" replace />
  if (user.role !== 'organisateur' && user.role !== 'agent') return <Navigate to="/accueil" replace />
  return children
}

// Guard: org/prest pending without submitted onboarding → force onboarding page
function OnboardingGuard({ user, children }) {
  const location = useLocation()
  const onboardingPaths = ['/onboarding-organisateur', '/onboarding-prestataire', '/connexion', '/cgu']
  const isOnboarding = onboardingPaths.some(p => location.pathname.startsWith(p))
  if (isOnboarding) return children

  const isDedicated = user?.role === 'organisateur' || user?.role === 'prestataire'
  if (isDedicated && user?.status === 'pending') {
    try {
      const apps = JSON.parse(localStorage.getItem('lib_applications') || '[]')
      const app = apps.find(a => a.uid === user.uid)
      if (!app || !app.submittedAt) {
        const target = user.role === 'organisateur' ? '/onboarding-organisateur' : '/onboarding-prestataire'
        return <Navigate to={target} replace />
      }
    } catch {}
  }
  return children
}

// Wrapper: /connexion — allow logged-in users when ?mode= is present (creating a 2nd account)
function ConnexionRoute({ user }) {
  const location = useLocation()
  const mode = new URLSearchParams(location.search).get('mode')
  if (user && !mode) return <Navigate to="/accueil" replace />
  return <LoginPage />
}

// Wrapper: Services — prestataire, organisateur, agent uniquement (pas client)
function RequireServiceAccess({ user, children }) {
  if (!user) return <Navigate to={`/connexion?next=${encodeURIComponent('/proposer')}`} replace />
  const r = user.role
  if (!r || r === 'client' || r === 'user') return <Navigate to="/accueil" replace />
  return children
}

export default function App() {
  const { user, setUser } = usePersistedUser()
  const [authModal, setAuthModal] = useState({ open: false, reason: '', onSuccess: null })

  function openAuthModal(reason = '', onSuccess = null) {
    setAuthModal({ open: true, reason, onSuccess })
  }
  function closeAuthModal() {
    setAuthModal({ open: false, reason: '', onSuccess: null })
  }

  return (
    <AuthContext.Provider value={{ user, setUser, openAuthModal }}>
      <BrowserRouter>
        <div className="min-h-screen relative" style={{ background: 'linear-gradient(180deg, #0b0b12 0%, #05060a 100%)' }}>
          {/* Nebula background */}
          <div className="nebula-bg" aria-hidden="true">
            <div className="nebula-blob nb1" />
            <div className="nebula-blob nb2" />
            <div className="nebula-blob nb3" />
          </div>

          {/* Couche de contenu au-dessus du fond */}
          <div style={{ position: 'relative', zIndex: 1 }}>

          {/* Global auth modal — shown on top of any page */}
          <AuthModal
            open={authModal.open}
            reason={authModal.reason}
            onSuccess={authModal.onSuccess}
            onClose={closeAuthModal}
          />

          <OnboardingGuard user={user}>
          <Routes>
            {/* ── Root: always go to accueil ── */}
            <Route path="/" element={<Navigate to="/accueil" replace />} />

            {/* ── Auth: /connexion is the login/register page ──
                Allow access even when logged in if ?mode=register (creating a 2nd account) */}
            <Route path="/connexion" element={<ConnexionRoute user={user} />} />

            {/* ── Public routes — accessible without account ── */}
            <Route path="/accueil" element={<HomePage />} />
            <Route path="/evenements" element={<EventsPage />} />
            <Route path="/evenements/:id" element={<EventDetailPage />} />
            <Route path="/cgu" element={<CGUPage />} />
            <Route path="/ticket/:token" element={<TicketPage />} />

            {/* ── Protected: require any logged-in account ── */}
            <Route path="/profil" element={
              <RequireAuth user={user} to="/profil"><ProfilePage /></RequireAuth>
            } />
            <Route path="/messagerie" element={
              <RequireAuth user={user} to="/messagerie"><MessagingPage /></RequireAuth>
            } />
            <Route path="/portefeuille" element={
              <RequireAuth user={user} to="/portefeuille"><WalletPage /></RequireAuth>
            } />
            <Route path="/scanner" element={
              <RequireAuth user={user} to="/scanner"><ScannerPage /></RequireAuth>
            } />
            <Route path="/boite" element={
              <RequireAuth user={user} to="/boite"><JeSuisUneBoitePage /></RequireAuth>
            } />

            {/* ── Role-protected: organisateur + agent only ── */}
            <Route path="/mes-evenements" element={
              <RequireOrganisateur user={user}><MesEvenementsPage /></RequireOrganisateur>
            } />

            {/* ── Services: prestataire / organisateur / agent only ── */}
            <Route path="/proposer" element={
              <RequireServiceAccess user={user}><ProposerServicesPage /></RequireServiceAccess>
            } />

            {/* ── Onboarding candidatures ── */}
            <Route path="/onboarding-organisateur" element={
              <RequireAuth user={user} to="/onboarding-organisateur"><OnboardingOrganisateur /></RequireAuth>
            } />
            <Route path="/onboarding-prestataire" element={
              <RequireAuth user={user} to="/onboarding-prestataire"><OnboardingPrestataire /></RequireAuth>
            } />
            <Route path="/mon-dossier" element={
              <RequireAuth user={user} to="/mon-dossier"><MonDossierPage /></RequireAuth>
            } />

            {/* ── Admin only ── */}
            <Route path="/agent" element={
              <RequireRole user={user} role="agent"><AgentPage /></RequireRole>
            } />
          </Routes>
          </OnboardingGuard>
          </div>{/* fin couche z-index:1 */}
        </div>
      </BrowserRouter>
    </AuthContext.Provider>
  )
}
