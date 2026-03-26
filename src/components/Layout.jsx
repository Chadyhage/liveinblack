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
    <div className="min-h-screen bg-[#080808] flex">

      {/* ── DESKTOP: Left Sidebar ── */}
      <aside className="hidden md:flex flex-col w-60 min-h-screen sticky top-0 h-screen border-r border-[#1a1a1a] py-6 px-3 shrink-0">
        {/* Logo */}
        <button
          onClick={() => navigate('/accueil')}
          className="text-xl font-black tracking-[0.2em] uppercase px-3 mb-8"
          style={{ fontFamily: 'Bebas Neue, sans-serif' }}
        >
          LIVE<span className="text-[#d4af37]">IN</span>BLACK
        </button>

        {/* Nav items */}
        <nav className="flex flex-col gap-1 flex-1">
          {navItems.map((item) => {
            const active = location.pathname === item.path
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all ${
                  active
                    ? 'text-[#d4af37] bg-[#d4af37]/10'
                    : 'text-gray-400 hover:text-white hover:bg-[#1a1a1a]'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span className="text-sm font-medium tracking-wide">{item.label}</span>
                {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#d4af37]" />}
              </button>
            )
          })}

          {/* Agent link */}
          {isAgent && (
            <button
              onClick={() => navigate('/agent')}
              className="flex items-center gap-3 px-3 py-3 rounded-xl text-[#d4af37] hover:bg-[#d4af37]/10 transition-all"
            >
              <span className="text-lg">🔑</span>
              <span className="text-sm font-medium tracking-wide">Agent</span>
              {pendingCount > 0 && (
                <span className="ml-auto bg-[#d4af37] text-black text-[10px] font-black px-1.5 py-0.5 rounded-full">
                  {pendingCount}
                </span>
              )}
            </button>
          )}
        </nav>

        {/* Bottom section */}
        <div className="flex flex-col gap-1">
          <button
            onClick={() => navigate('/portefeuille')}
            className="flex items-center gap-3 px-3 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-[#1a1a1a] transition-all"
          >
            <span className="text-lg">💰</span>
            <span className="text-sm font-medium">{balance.toFixed(0)} €</span>
          </button>

          <button
            onClick={() => navigate('/profil')}
            className="flex items-center gap-3 px-3 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-[#1a1a1a] transition-all"
          >
            <span className="w-8 h-8 rounded-full bg-[#1a1a1a] border border-[#333] flex items-center justify-center text-sm shrink-0 overflow-hidden">
              {user?.avatar
                ? <img src={user.avatar} alt="avatar" className="w-full h-full object-cover" />
                : user?.name?.[0]?.toUpperCase() || '?'}
            </span>
            <span className="text-sm font-medium truncate">{user?.name || 'Profil'}</span>
          </button>

          <button
            onClick={() => setMenuOpen(true)}
            className="flex items-center gap-3 px-3 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-[#1a1a1a] transition-all"
          >
            <span className="flex flex-col gap-1 w-5">
              <span className="w-5 h-0.5 bg-current" />
              <span className="w-3 h-0.5 bg-current" />
              <span className="w-5 h-0.5 bg-current" />
            </span>
            <span className="text-sm font-medium">Plus</span>
          </button>
        </div>
      </aside>

      {/* ── Main area (mobile full, desktop flex-1) ── */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0">

        {/* MOBILE: Top Bar */}
        <header className="md:hidden sticky top-0 z-40 bg-[#080808]/90 backdrop-blur-md border-b border-[#1a1a1a]">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={() => setMenuOpen(true)}
              className="w-9 h-9 flex flex-col justify-center gap-1.5 group"
            >
              <span className="w-6 h-0.5 bg-white group-hover:bg-[#d4af37] transition-colors" />
              <span className="w-4 h-0.5 bg-white group-hover:bg-[#d4af37] transition-colors" />
              <span className="w-6 h-0.5 bg-white group-hover:bg-[#d4af37] transition-colors" />
            </button>

            <button
              onClick={() => navigate('/accueil')}
              className="text-xl font-black tracking-[0.2em] uppercase"
              style={{ fontFamily: 'Bebas Neue, sans-serif' }}
            >
              LIVE<span className="text-[#d4af37]">IN</span>BLACK
            </button>

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
                {user?.avatar
                  ? <img src={user.avatar} alt="avatar" className="w-full h-full object-cover" />
                  : user?.name?.[0]?.toUpperCase() || '?'}
              </button>
            </div>
          </div>
        </header>

        {/* Agent banner - mobile only */}
        {isAgent && (
          <button
            onClick={() => navigate('/agent')}
            className="md:hidden w-full flex items-center justify-center gap-2 py-1.5 bg-[#d4af37]/10 border-b border-[#d4af37]/20 hover:bg-[#d4af37]/20 transition-colors"
          >
            <span className="text-[#d4af37] text-xs font-bold tracking-wider">🔑 INTERFACE AGENT</span>
            {pendingCount > 0 && (
              <span className="bg-[#d4af37] text-black text-[10px] font-black px-1.5 py-0.5 rounded-full">
                {pendingCount}
              </span>
            )}
          </button>
        )}

        {/* Side Menu */}
        <SideMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

        {/* Content */}
        <main className="flex-1">
          <div className="md:max-w-3xl md:mx-auto md:px-6">
            {children}
          </div>
        </main>

        {/* MOBILE: Bottom Nav */}
        <nav className="md:hidden sticky bottom-0 z-40 bg-[#080808]/90 backdrop-blur-md border-t border-[#1a1a1a]">
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
    </div>
  )
}
