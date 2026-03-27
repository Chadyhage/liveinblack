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
    { path: '/accueil',        icon: '⬜', label: 'Accueil' },
    { path: '/evenements',     icon: '🎟', label: 'Événements' },
    { path: '/messagerie',     icon: '💬', label: 'Messages' },
    { path: '/mes-evenements', icon: '✦',  label: 'Mes Events' },
    { path: '/proposer',       icon: '◈',  label: 'Services' },
  ]

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--obsidian)' }}>

      {/* ── DESKTOP: Left Sidebar ── */}
      <aside className="hidden md:flex flex-col w-60 min-h-screen sticky top-0 h-screen py-6 px-3 shrink-0"
        style={{
          background: 'linear-gradient(180deg, rgba(8,8,15,0.98) 0%, rgba(4,4,11,0.99) 100%)',
          borderRight: '1px solid rgba(200,200,230,0.06)',
          boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.03)',
        }}>

        {/* Logo */}
        <button
          onClick={() => navigate('/accueil')}
          className="px-3 mb-8 text-left"
          style={{ fontFamily: 'Bebas Neue, sans-serif' }}
        >
          <span className="text-xl font-black tracking-[0.2em] uppercase" style={{
            textShadow: '0 0 20px rgba(212,175,55,0.2)',
          }}>
            LIVE<span className="text-gold-gradient" style={{
              background: 'linear-gradient(135deg, #b8962e, #d4af37, #f0e080, #d4af37)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>IN</span>BLACK
          </span>
          <div className="mt-1 h-px w-full"
            style={{ background: 'linear-gradient(to right, rgba(212,175,55,0.4), rgba(212,175,55,0.05), transparent)' }} />
        </button>

        {/* Nav items */}
        <nav className="flex flex-col gap-0.5 flex-1">
          {navItems.map((item) => {
            const active = location.pathname === item.path
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all relative group"
                style={active ? {
                  background: 'linear-gradient(to right, rgba(212,175,55,0.1), rgba(212,175,55,0.04))',
                  borderLeft: '2px solid #d4af37',
                  color: '#d4af37',
                } : {
                  borderLeft: '2px solid transparent',
                  color: 'rgba(180,180,200,0.6)',
                }}
              >
                <span className="text-base">{item.icon}</span>
                <span className="text-sm font-medium tracking-wide">{item.label}</span>
                {!active && (
                  <span className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: 'rgba(255,255,255,0.03)' }} />
                )}
              </button>
            )
          })}

          {isAgent && (
            <button
              onClick={() => navigate('/agent')}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all mt-1 relative group"
              style={{
                borderLeft: '2px solid rgba(212,175,55,0.3)',
                color: '#d4af37',
              }}
            >
              <span className="text-base">🔑</span>
              <span className="text-sm font-medium tracking-wide">Agent</span>
              {pendingCount > 0 && (
                <span className="ml-auto text-[10px] font-black px-1.5 py-0.5 rounded-full"
                  style={{ background: 'linear-gradient(135deg, #d4af37, #f0e080)', color: '#000' }}>
                  {pendingCount}
                </span>
              )}
            </button>
          )}
        </nav>

        {/* Separator */}
        <div className="my-3 h-px mx-3"
          style={{ background: 'linear-gradient(to right, transparent, rgba(200,200,230,0.08), transparent)' }} />

        {/* Bottom section */}
        <div className="flex flex-col gap-0.5">
          <button
            onClick={() => navigate('/portefeuille')}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group"
            style={{ color: 'rgba(180,180,200,0.6)' }}
          >
            <span className="text-base">💰</span>
            <span className="text-sm font-medium"
              style={{ background: 'linear-gradient(135deg, #d4af37, #f0e080)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {balance.toFixed(0)} €
            </span>
            <span className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: 'rgba(255,255,255,0.03)' }} />
          </button>

          <button
            onClick={() => navigate('/profil')}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group"
            style={{ color: 'rgba(180,180,200,0.6)' }}
          >
            <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, rgba(40,40,58,0.9), rgba(20,20,32,0.9))',
                border: '1px solid rgba(200,200,230,0.1)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
              }}>
              {user?.avatar
                ? <img src={user.avatar} alt="avatar" className="w-full h-full object-cover" />
                : <span className="text-white/70">{user?.name?.[0]?.toUpperCase() || '?'}</span>}
            </span>
            <span className="text-sm font-medium truncate text-white/60">{user?.name || 'Profil'}</span>
          </button>

          <button
            onClick={() => setMenuOpen(true)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all"
            style={{ color: 'rgba(180,180,200,0.5)' }}
          >
            <span className="flex flex-col gap-1.5 w-5">
              <span className="w-5 h-px" style={{ background: 'rgba(200,200,220,0.4)' }} />
              <span className="w-3 h-px" style={{ background: 'rgba(200,200,220,0.4)' }} />
              <span className="w-5 h-px" style={{ background: 'rgba(200,200,220,0.4)' }} />
            </span>
            <span className="text-sm font-medium">Plus</span>
          </button>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0">

        {/* MOBILE: Top Bar */}
        <header className="md:hidden sticky top-0 z-40"
          style={{
            background: 'rgba(4,4,11,0.92)',
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            borderBottom: '1px solid rgba(200,200,230,0.06)',
            boxShadow: '0 2px 20px rgba(0,0,0,0.4)',
          }}>
          <div className="flex items-center justify-between px-4 py-3">
            <button onClick={() => setMenuOpen(true)} className="w-9 h-9 flex flex-col justify-center gap-1.5 group">
              <span className="w-6 h-px transition-colors" style={{ background: 'rgba(220,220,240,0.5)' }} />
              <span className="w-4 h-px transition-colors" style={{ background: 'rgba(220,220,240,0.5)' }} />
              <span className="w-6 h-px transition-colors" style={{ background: 'rgba(220,220,240,0.5)' }} />
            </button>

            <button onClick={() => navigate('/accueil')} style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              <span className="text-xl font-black tracking-[0.2em] uppercase text-white"
                style={{ textShadow: '0 0 16px rgba(212,175,55,0.2)' }}>
                LIVE<span style={{
                  background: 'linear-gradient(135deg, #b8962e, #d4af37, #f0e080)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}>IN</span>BLACK
              </span>
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate('/portefeuille')}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full transition-all"
                style={{
                  background: 'rgba(212,175,55,0.08)',
                  border: '1px solid rgba(212,175,55,0.2)',
                }}
              >
                <span className="text-xs">💰</span>
                <span className="text-xs font-bold"
                  style={{ background: 'linear-gradient(135deg, #d4af37, #f0e080)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  {balance.toFixed(0)}€
                </span>
              </button>
              <button
                onClick={() => navigate('/profil')}
                className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-sm text-white/70"
                style={{
                  background: 'linear-gradient(135deg, rgba(30,30,44,0.9), rgba(14,14,22,0.9))',
                  border: '1px solid rgba(200,200,230,0.1)',
                }}
              >
                {user?.avatar
                  ? <img src={user.avatar} alt="avatar" className="w-full h-full object-cover" />
                  : user?.name?.[0]?.toUpperCase() || '?'}
              </button>
            </div>
          </div>
        </header>

        {/* Agent banner */}
        {isAgent && (
          <button
            onClick={() => navigate('/agent')}
            className="md:hidden w-full flex items-center justify-center gap-2 py-1.5 transition-all"
            style={{
              background: 'linear-gradient(to right, rgba(212,175,55,0.07), rgba(212,175,55,0.12), rgba(212,175,55,0.07))',
              borderBottom: '1px solid rgba(212,175,55,0.15)',
            }}
          >
            <span className="text-xs font-bold tracking-wider"
              style={{ background: 'linear-gradient(135deg, #d4af37, #f0e080)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              🔑 INTERFACE AGENT
            </span>
            {pendingCount > 0 && (
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full"
                style={{ background: 'linear-gradient(135deg, #d4af37, #f0e080)', color: '#000' }}>
                {pendingCount}
              </span>
            )}
          </button>
        )}

        <SideMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

        {/* Content */}
        <main className="flex-1">
          <div className="md:max-w-3xl md:mx-auto md:px-6">
            {children}
          </div>
        </main>

        {/* MOBILE: Bottom Nav */}
        <nav className="md:hidden sticky bottom-0 z-40"
          style={{
            background: 'rgba(4,4,11,0.96)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            borderTop: '1px solid rgba(200,200,230,0.06)',
            boxShadow: '0 -4px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)',
          }}>
          <div className="flex">
            {navItems.map((item) => {
              const active = location.pathname === item.path
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className="flex-1 py-3 flex flex-col items-center gap-1 transition-all"
                  style={{ color: active ? '#d4af37' : 'rgba(120,120,150,0.7)' }}
                >
                  <span className="text-lg">{item.icon}</span>
                  <span className="text-[9px] tracking-wider uppercase font-semibold">{item.label}</span>
                  {active && (
                    <span className="w-4 h-px rounded-full"
                      style={{ background: 'linear-gradient(to right, rgba(212,175,55,0.3), #d4af37, rgba(212,175,55,0.3))' }} />
                  )}
                </button>
              )
            })}
          </div>
        </nav>
      </div>
    </div>
  )
}
