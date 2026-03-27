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
import { AuthContext } from './context/AuthContext'

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

export default function App() {
  const { user, setUser } = usePersistedUser()

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      <BrowserRouter>
        <div className="min-h-screen bg-[#04040b] relative">
          {/* Ambient metallic orbs */}
          <div className="pointer-events-none fixed top-0 right-0 w-[600px] h-[600px] rounded-full opacity-[0.06] blur-[120px] z-0" style={{ background: 'radial-gradient(circle, #d4af37 0%, #b8902a 40%, transparent 70%)' }} />
          <div className="pointer-events-none fixed bottom-0 left-0 w-[500px] h-[500px] rounded-full opacity-[0.05] blur-[100px] z-0" style={{ background: 'radial-gradient(circle, #c0c0d0 0%, #8090a0 40%, transparent 70%)' }} />
          <Routes>
            <Route path="/" element={user ? <Navigate to="/accueil" /> : <LoginPage />} />
            <Route path="/accueil" element={user ? <HomePage /> : <Navigate to="/" />} />
            <Route path="/evenements" element={user ? <EventsPage /> : <Navigate to="/" />} />
            <Route path="/evenements/:id" element={user ? <EventDetailPage /> : <Navigate to="/" />} />
            <Route path="/proposer" element={user ? <ProposerServicesPage /> : <Navigate to="/" />} />
            <Route path="/boite" element={user ? <JeSuisUneBoitePage /> : <Navigate to="/" />} />
            <Route path="/mes-evenements" element={user ? <MesEvenementsPage /> : <Navigate to="/" />} />
            <Route path="/profil" element={user ? <ProfilePage /> : <Navigate to="/" />} />
            <Route path="/messagerie" element={user ? <MessagingPage /> : <Navigate to="/" />} />
            <Route path="/portefeuille" element={user ? <WalletPage /> : <Navigate to="/" />} />
            <Route path="/scanner" element={user ? <ScannerPage /> : <Navigate to="/" />} />
            <Route path="/agent" element={user?.role === 'agent' ? <AgentPage /> : <Navigate to={user ? '/accueil' : '/'} />} />
            <Route path="/cgu" element={<CGUPage />} />
            <Route path="/ticket/:token" element={<TicketPage />} />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthContext.Provider>
  )
}
