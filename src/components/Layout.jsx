import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import SideMenu from './SideMenu'
import { getUserId } from '../utils/messaging'
import { getBalance } from '../utils/wallet'
import { getPendingValidations } from '../utils/accounts'

export default function Layout({ children }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const [balance, setBalance] = useState(0)
  const isAgent = user?.role === 'agent'
  const pendingCount = isAgent ? getPendingValidations().length : 0

  useEffect(() => {
    const uid = getUserId(user)
    if (uid) setBalance(getBalance(uid))
  }, [user, location.pathname])

  const navItems = [
    { path: '/accueil', icon: '⬜', label: 'Accueil' },
    { path: '/evenements', icon: '🎟', label: 'Événements' },
    { path: '/messagerie', icon: '💬', label: 'Messages' },
    { path: '/mes-evenements', icon: '✦', label: 'Mes Events' },
    { path: '/proposer', icon: '◈', label: 'Services' },
  ]

  return (
    <div className="min-h-screen bg-[#080808] flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 bg-[#080808]/90 backdrop-blur-md border-b border-[#1a1a1a]">
        <div className="flex items-center justify-between px-4 py-3">
          {/* Hamburger */}
          <button
            onClick={() => setMenuOpen(true)}
            className="w-9 h-9 flex flex-col justify-center gap-1.5 group"
          >
            <span className="w-6 h-0.5 bg-white group-hover:bg-[#d4af37] transition-colors" />
            <span className="w-4 h-0.5 bg-white group-hover:bg-[#d4af37] transition-colors" />
            <span className="w-6 h-0.5 bg-white group-hover:bg-[#d4af37] transition-colors" />
          </button>

          {/* Logo */}
          <button
            onClick={() => navigate('/accueil')}
            className="text-xl font-black tracking-[0.2em] uppercase"
            style={{ fontFamily: 'Bebas Neue, sans-serif' }}
          >
            LIVE<span className="text-[#d4af37]">IN</span>BLACK
          </button>

          {/* Right: wallet + profile */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/portefeuille')}
              className="flex items-center gap-1 bg-[#1a1a1a] border border-[#333] rounded-full px-2.5 py-1 hover:border-[#d4af37] transition-colors"
            >
              <span className="text-xs">💰</span>
              <span className="text-[#d4af37] text-xs font-bold">{balance.toFixed(0)}€</span>
            </button>
            <button
              onClick={() => navigate('/profil')}
              className="w-9 h-9 rounded-full bg-[#1a1a1a] border border-[#333] overflow-hidden flex items-center justify-center hover:border-[#d4af37] transition-colors text-sm"
            >
              {user?.avatar ? (
                <img src={user.avatar} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                user?.name?.[0]?.toUpperCase() || '?'
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Agent banner */}
      {isAgent && (
        <button onClick={() => navigate('/agent')}
          className="w-full flex items-center justify-center gap-2 py-1.5 bg-[#d4af37]/10 border-b border-[#d4af37]/20 hover:bg-[#d4af37]/20 transition-colors">
          <span className="text-[#d4af37] text-xs font-bold tracking-wider">🔑 INTERFACE AGENT</span>
          {pendingCount > 0 && (
            <span className="bg-[#d4af37] text-black text-[10px] font-black px-1.5 py-0.5 rounded-full">{pendingCount}</span>
          )}
        </button>
      )}

      {/* Side Menu */}
      <SideMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      {/* Content */}
      <main className="flex-1">{children}</main>

      {/* Bottom Nav */}
      <nav className="sticky bottom-0 z-40 bg-[#080808]/90 backdrop-blur-md border-t border-[#1a1a1a]">
        <div className="flex">
          {navItems.map((item) => {
            const active = location.pathname === item.path
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`flex-1 py-3 flex flex-col items-center gap-1 transition-all ${
                  active ? 'text-[#d4af37]' : 'text-gray-600 hover:text-gray-400'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span className="text-[10px] tracking-wider uppercase">{item.label}</span>
                {active && <span className="w-1 h-1 rounded-full bg-[#d4af37]" />}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
