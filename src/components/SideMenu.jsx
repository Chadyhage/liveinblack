import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getUserId } from '../utils/messaging'
import { getBalance } from '../utils/wallet'
import { ROLES, getPendingValidations } from '../utils/accounts'

export default function SideMenu({ open, onClose }) {
  const navigate = useNavigate()
  const { user, setUser } = useAuth()
  const balance = getBalance(getUserId(user))
  const isAgent = user?.role === 'agent'
  const isPrestataire = user?.role === 'prestataire' || user?.role === 'organisateur'
  const pendingCount = isAgent ? getPendingValidations().length : 0
  const [confirmLogout, setConfirmLogout] = useState(false)

  const links = [
    { path: '/accueil', label: 'Accueil', icon: '⬜' },
    { path: '/evenements', label: 'Événements', icon: '🎟' },
    { path: '/messagerie', label: 'Messages', icon: '💬' },
    ...(!isPrestataire ? [{ path: '/mes-evenements', label: 'Mes Événements & Créations', icon: '✦' }] : []),
    { path: '/proposer', label: isPrestataire ? 'Mon Espace Prestataire' : 'Services & Prestataires', icon: '◈' },
    ...(!isPrestataire && !isAgent ? [{ path: '/boite', label: 'Je suis une boîte', icon: '🏢' }] : []),
    { path: '/portefeuille', label: 'Mon Portefeuille', icon: '💰' },
    { path: '/profil', label: 'Mon profil', icon: '👤' },
    ...(isAgent ? [{ path: '/agent', label: `Interface Agent${pendingCount > 0 ? ` (${pendingCount})` : ''}`, icon: '🔑', gold: true }] : []),
  ]

  function go(path) {
    navigate(path)
    onClose()
  }

  function logout() {
    setUser(null)
    navigate('/')
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black/70 backdrop-blur-sm transition-opacity duration-300 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed top-0 left-0 bottom-0 z-50 w-72 bg-[#08080f] border-r border-white/[0.07] flex flex-col transition-transform duration-300 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="p-6 border-b border-white/[0.07]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-[#d4af37] flex items-center justify-center text-black font-bold text-lg">
              {user?.name?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white truncate">{user?.name || 'Utilisateur'}</p>
              <p className="text-xs text-gray-500 truncate">{user?.email || ''}</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {user?.role && ROLES[user.role] && (
              <span className="text-xs px-2 py-1 rounded-full border font-semibold"
                style={{ color: ROLES[user.role].color, borderColor: ROLES[user.role].color + '44', background: ROLES[user.role].color + '11' }}>
                {ROLES[user.role].icon} {ROLES[user.role].label}
              </span>
            )}
            <span className="text-xs bg-[#d4af37]/10 text-[#d4af37] px-2 py-1 rounded-full border border-[#d4af37]/20">
              {user?.points || 0} pts
            </span>
            <button onClick={() => go('/portefeuille')}
              className="text-xs bg-green-500/10 text-green-400 px-2 py-1 rounded-full border border-green-500/20 hover:bg-green-500/20 transition-colors">
              💰 {balance.toFixed(0)}€
            </button>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 p-4 space-y-1">
          {links.map((link) => (
            <button
              key={link.path}
              onClick={() => go(link.path)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all group ${
                link.gold
                  ? 'text-[#d4af37] bg-[#d4af37]/5 border border-[#d4af37]/20 hover:bg-[#d4af37]/15'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="text-lg">{link.icon}</span>
              <span className="text-sm font-medium">{link.label}</span>
              <span className={`ml-auto opacity-0 group-hover:opacity-100 transition-opacity ${link.gold ? 'text-[#d4af37] opacity-100' : 'text-[#d4af37]'}`}>›</span>
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-white/[0.07]">
          <button
            onClick={() => setConfirmLogout(true)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-gray-600 hover:text-red-400 hover:bg-red-400/5 transition-all"
          >
            <span>→</span>
            <span className="text-sm">Déconnexion</span>
          </button>
        </div>
      </div>

      {/* Confirm logout modal */}
      {confirmLogout && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setConfirmLogout(false)} />
          <div className="relative glass rounded-2xl p-6 w-full max-w-xs space-y-4 text-center">
            <div className="text-3xl">👋</div>
            <h3 className="text-white font-bold">Se déconnecter ?</h3>
            <p className="text-gray-400 text-sm">Tu devras te reconnecter pour accéder à ton compte.</p>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setConfirmLogout(false)}
                className="flex-1 py-2.5 rounded-xl border border-white/[0.08] text-gray-400 text-sm hover:border-white/20 hover:text-white transition-all"
              >
                Annuler
              </button>
              <button
                onClick={logout}
                className="flex-1 py-2.5 rounded-xl bg-red-500/20 border border-red-500/40 text-red-400 text-sm font-semibold hover:bg-red-500/30 transition-all"
              >
                Se déconnecter
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
