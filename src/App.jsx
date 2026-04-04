import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState } from 'react'
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
import LiquidMetalBg from './components/LiquidMetalBg'
import AuthModal from './components/AuthModal'

function usePersistedUser() {
  const [user, setUserState] = useState(() => {
    try {
      const saved = localStorage.getItem('lib_user')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })

  function setUser(val) {
    if (val) {
      localStorage.setItem('lib_user', JSON.stringify(val))
    } else {
      localStorage.removeItem('lib_user')
    }
    setUserState(val)
  }

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
        <div className="min-h-screen bg-[#04040b] relative">
          <LiquidMetalBg />

          {/* Couche de contenu au-dessus du canvas de fond */}
          <div style={{ position: 'relative', zIndex: 1 }}>

          {/* Global auth modal — shown on top of any page */}
          <AuthModal
            open={authModal.open}
            reason={authModal.reason}
            onSuccess={authModal.onSuccess}
            onClose={closeAuthModal}
          />

          <Routes>
            {/* ── Root: always go to accueil ── */}
            <Route path="/" element={<Navigate to="/accueil" replace />} />

            {/* ── Auth: /connexion is the login/register page ── */}
            <Route path="/connexion" element={user ? <Navigate to="/accueil" replace /> : <LoginPage />} />

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

            {/* ── Services: accessible when logged in ── */}
            <Route path="/proposer" element={
              <RequireAuth user={user} to="/proposer"><ProposerServicesPage /></RequireAuth>
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
          </div>{/* fin couche z-index:1 */}
        </div>
      </BrowserRouter>
    </AuthContext.Provider>
  )
}
