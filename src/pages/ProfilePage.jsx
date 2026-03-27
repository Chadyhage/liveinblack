import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import { getUserId } from '../utils/messaging'
import { getWallet } from '../utils/wallet'
import { ROLES, updateAccount } from '../utils/accounts'
import { getOrdersForBuyer, ORDER_STATUS_LABELS } from '../utils/services'

function getBookings() {
  try { return JSON.parse(localStorage.getItem('lib_bookings') || '[]') } catch { return [] }
}
function getBids() {
  try { return JSON.parse(localStorage.getItem('lib_bids') || '[]') } catch { return [] }
}

const FAQ = [
  { q: "Comment réserver un billet ?", a: "Va sur l'onglet Événements, sélectionne la soirée de ton choix et clique sur Réservation. Choisis ton type de place et confirme." },
  { q: "Comment fonctionne le système d'enchères ?", a: "Les places VIP sont mises aux enchères. Tu soumets une offre supérieure à l'offre actuelle. Le système anti-sniping prolonge automatiquement le temps si une enchère arrive dans les dernières minutes." },
  { q: "Puis-je annuler ma réservation ?", a: "Les réservations sont fermes et définitives. En cas d'annulation d'événement par l'organisateur, un remboursement sera traité sous 5 jours ouvrés." },
  { q: "Comment utiliser mes points ?", a: "Tu gagnes 1 point par ticket ou carré acheté. Les points seront bientôt échangeables contre des avantages exclusifs (accès prioritaire, réductions, cadeaux)." },
  { q: "Comment créer un événement ?", a: "Rends-toi dans 'Mes Événements & Créations' via le menu. Tu peux créer et publier ton événement en 5 étapes simples." },
]

function getProfileError(code) {
  switch (code) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential': return 'Mot de passe actuel incorrect'
    case 'auth/requires-recent-login': return 'Session expirée — déconnecte-toi et reconnecte-toi'
    case 'auth/email-already-in-use': return 'Cet e-mail est déjà utilisé par un autre compte'
    case 'auth/invalid-email': return 'Adresse e-mail invalide'
    case 'auth/weak-password': return 'Mot de passe trop faible (minimum 6 caractères)'
    case 'auth/too-many-requests': return 'Trop de tentatives, réessaie dans quelques minutes'
    default: return 'Une erreur est survenue, réessaie'
  }
}

export default function ProfilePage() {
  const { user, setUser } = useAuth()
  const navigate = useNavigate()
  const [panel, setPanel] = useState(null) // null | 'settings' | 'billets' | 'encheres' | 'commandes' | 'service-orders' | 'support'
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  // Settings form state
  const [settingsForm, setSettingsForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [settingsMsg, setSettingsMsg] = useState(null)
  const [saving, setSaving] = useState(false)

  // Support state
  const [openFaq, setOpenFaq] = useState(null)

  const emailChanged = settingsForm.email.trim() !== (user?.email || '')
  const passwordChanged = !!settingsForm.newPassword
  const needsCurrentPassword = emailChanged || passwordChanged

  async function saveSettings() {
    if (!settingsForm.name.trim()) {
      setSettingsMsg({ type: 'error', text: 'Le prénom / nom est obligatoire' })
      return
    }
    if (!settingsForm.email.trim() || !settingsForm.email.includes('@')) {
      setSettingsMsg({ type: 'error', text: 'Adresse e-mail invalide' })
      return
    }
    if (passwordChanged) {
      if (settingsForm.newPassword.length < 8) {
        setSettingsMsg({ type: 'error', text: 'Le mot de passe doit contenir au moins 8 caractères' })
        return
      }
      if (settingsForm.newPassword !== settingsForm.confirmPassword) {
        setSettingsMsg({ type: 'error', text: 'Les mots de passe ne correspondent pas' })
        return
      }
    }
    if (needsCurrentPassword && !settingsForm.currentPassword) {
      setSettingsMsg({ type: 'error', text: 'Saisis ton mot de passe actuel pour modifier l\'e-mail ou le mot de passe' })
      return
    }

    setSaving(true)
    setSettingsMsg(null)

    try {
      const { USE_REAL_FIREBASE } = await import('../firebase')
      if (USE_REAL_FIREBASE) {
        const { auth } = await import('../firebase')
        const { updateProfile, updateEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider } = await import('firebase/auth')
        const currentUser = auth.currentUser

        if (currentUser) {
          // Update display name
          if (settingsForm.name.trim() !== user.name) {
            await updateProfile(currentUser, { displayName: settingsForm.name.trim() })
          }

          // Email or password change requires re-authentication
          if (needsCurrentPassword) {
            const isEmailPassword = currentUser.providerData.some(p => p.providerId === 'password')
            if (!isEmailPassword) {
              setSettingsMsg({ type: 'error', text: 'Connexion via Google/Apple — e-mail et mot de passe gérés par ce service' })
              setSaving(false)
              return
            }
            const credential = EmailAuthProvider.credential(user.email, settingsForm.currentPassword)
            await reauthenticateWithCredential(currentUser, credential)

            if (emailChanged) {
              await updateEmail(currentUser, settingsForm.email.trim())
            }
            if (passwordChanged) {
              await updatePassword(currentUser, settingsForm.newPassword)
            }
          }
        }
      }

      // Update local state
      const uid = getUserId(user)
      const updatedUser = { ...user, name: settingsForm.name.trim(), email: settingsForm.email.trim() }
      setUser(updatedUser)
      updateAccount(uid, { name: settingsForm.name.trim(), email: settingsForm.email.trim() })
      setSettingsForm(f => ({ ...f, currentPassword: '', newPassword: '', confirmPassword: '' }))
      setSettingsMsg({ type: 'success', text: 'Modifications enregistrées ✓' })
      setTimeout(() => setSettingsMsg(null), 3000)
    } catch (err) {
      setSettingsMsg({ type: 'error', text: getProfileError(err.code) })
    } finally {
      setSaving(false)
    }
  }

  function BackButton() {
    return (
      <button
        onClick={() => { setPanel(null); setSettingsMsg(null) }}
        className="w-8 h-8 rounded-full bg-[#0e0e18] flex items-center justify-center text-gray-400 text-lg"
      >
        ‹
      </button>
    )
  }

  // ── Settings Panel ─────────────────────────────────────────────────────────
  if (panel === 'settings') {
    return (
      <Layout>
        <div className="px-4 py-6 space-y-5">
          <div className="flex items-center gap-3">
            <BackButton />
            <h2 className="text-white font-bold">Paramètres du compte</h2>
          </div>
          <div className="space-y-4">
            <div className="space-y-3">
              <h3 className="text-[#d4af37] text-xs uppercase tracking-widest">Informations personnelles</h3>
              <div>
                <label className="text-gray-500 text-xs mb-1.5 block">Prénom / Nom</label>
                <input
                  className="input-dark"
                  placeholder="Ton nom"
                  value={settingsForm.name}
                  onChange={e => setSettingsForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-gray-500 text-xs mb-1.5 block">Adresse e-mail</label>
                <input
                  className="input-dark"
                  type="email"
                  placeholder="ton@email.com"
                  value={settingsForm.email}
                  onChange={e => setSettingsForm(f => ({ ...f, email: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-3 pt-2">
              <h3 className="text-[#d4af37] text-xs uppercase tracking-widest">Changer le mot de passe</h3>
              <div>
                <label className="text-gray-500 text-xs mb-1.5 block">Nouveau mot de passe</label>
                <input
                  className="input-dark"
                  type="password"
                  placeholder="Minimum 8 caractères"
                  value={settingsForm.newPassword}
                  onChange={e => setSettingsForm(f => ({ ...f, newPassword: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-gray-500 text-xs mb-1.5 block">Confirmer le mot de passe</label>
                <input
                  className={`input-dark ${settingsForm.newPassword && settingsForm.confirmPassword && settingsForm.newPassword !== settingsForm.confirmPassword ? 'border-red-500/60' : ''}`}
                  type="password"
                  placeholder="Répète le mot de passe"
                  value={settingsForm.confirmPassword}
                  onChange={e => setSettingsForm(f => ({ ...f, confirmPassword: e.target.value }))}
                />
              </div>
            </div>

            {needsCurrentPassword && (
              <div className="space-y-3 pt-2 border-t border-white/[0.05]">
                <h3 className="text-orange-400 text-xs uppercase tracking-widest">Confirmation requise</h3>
                <div>
                  <label className="text-gray-500 text-xs mb-1.5 block">Mot de passe actuel</label>
                  <input
                    className="input-dark"
                    type="password"
                    placeholder="Ton mot de passe actuel"
                    value={settingsForm.currentPassword}
                    onChange={e => setSettingsForm(f => ({ ...f, currentPassword: e.target.value }))}
                  />
                </div>
                <p className="text-gray-600 text-[10px]">Requis pour modifier ton e-mail ou mot de passe.</p>
              </div>
            )}

            {settingsMsg && (
              <div className={`p-3 rounded-xl text-xs ${settingsMsg.type === 'success' ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
                {settingsMsg.text}
              </div>
            )}
            <button onClick={saveSettings} disabled={saving} className="btn-gold w-full disabled:opacity-50 disabled:cursor-not-allowed">
              {saving ? 'Enregistrement...' : 'Enregistrer les modifications'}
            </button>
          </div>
        </div>
      </Layout>
    )
  }

  // ── Mes billets ─────────────────────────────────────────────────────────────
  if (panel === 'billets') {
    const bookings = getBookings()
    // Group by event
    const grouped = bookings.reduce((acc, b) => {
      const key = String(b.eventId)
      if (!acc[key]) acc[key] = { eventName: b.eventName, eventDate: b.eventDate, eventId: b.eventId, tickets: [] }
      acc[key].tickets.push(b)
      return acc
    }, {})
    const groups = Object.values(grouped)

    return (
      <Layout>
        <div className="px-4 py-6 space-y-5">
          <div className="flex items-center gap-3">
            <BackButton />
            <h2 className="text-white font-bold">Mes billets</h2>
          </div>
          {groups.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <p className="text-4xl">🎟</p>
              <p className="text-gray-500 text-sm">Aucun billet pour l'instant.</p>
              <button onClick={() => navigate('/evenements')} className="btn-gold text-sm">
                Découvrir les événements
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {groups.map((g) => (
                <EventTicketGroup key={g.eventId} group={g} />
              ))}
            </div>
          )}
        </div>
      </Layout>
    )
  }

  // ── Mes enchères ────────────────────────────────────────────────────────────
  if (panel === 'encheres') {
    const bids = getBids()
    return (
      <Layout>
        <div className="px-4 py-6 space-y-5">
          <div className="flex items-center gap-3">
            <BackButton />
            <h2 className="text-white font-bold">Mes enchères</h2>
          </div>
          {bids.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <p className="text-4xl">🔨</p>
              <p className="text-gray-500 text-sm">Tu n'as pas encore participé à une enchère.</p>
              <button onClick={() => navigate('/evenements')} className="btn-gold text-sm">
                Voir les événements
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {bids.map((b, i) => (
                <button
                  key={i}
                  onClick={() => navigate(`/evenements/${b.eventId}?tab=Enchères`)}
                  className="w-full text-left glass p-4 rounded-2xl hover:border-[#d4af37]/30 transition-all group"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-white font-semibold text-sm group-hover:text-[#d4af37] transition-colors">{b.eventName}</p>
                      <p className="text-gray-500 text-xs">{b.placeType} · {b.date} à {b.time}</p>
                      <p className="text-purple-400 text-[10px] mt-1">🔨 Voir l'enchère →</p>
                    </div>
                    <span className="text-[#d4af37] font-bold text-lg">{b.amount}€</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </Layout>
    )
  }

  // ── Mes commandes ───────────────────────────────────────────────────────────
  if (panel === 'commandes') {
    const bookings = getBookings().filter(b => b.preorderSummary?.length > 0)
    return (
      <Layout>
        <div className="px-4 py-6 space-y-5">
          <div className="flex items-center gap-3">
            <BackButton />
            <h2 className="text-white font-bold">Mes commandes</h2>
          </div>
          {bookings.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <p className="text-4xl">🛒</p>
              <p className="text-gray-500 text-sm">Aucune précommande pour l'instant.</p>
              <p className="text-gray-600 text-xs">Tu peux précommander des consommations lors d'une réservation.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {bookings.map((b) => (
                <div key={b.id} className="glass p-4 rounded-2xl space-y-3">
                  <div>
                    <p className="text-white font-semibold text-sm">{b.eventName}</p>
                    <p className="text-gray-500 text-xs">{b.eventDate}</p>
                  </div>
                  <div className="space-y-1">
                    {b.preorderSummary.map(item => (
                      <div key={item.name} className="flex justify-between text-xs">
                        <span className="text-gray-300">{item.emoji} {item.name}</span>
                        <span className="text-gray-500">×{b.preorderItems[item.name]} · {item.price * b.preorderItems[item.name]}€</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-sm border-t border-white/[0.07] pt-2">
                    <span className="text-gray-400">Total commande</span>
                    <span className="text-[#d4af37] font-bold">{b.preorderSummary.reduce((s, i) => s + i.price * b.preorderItems[i.name], 0)}€</span>
                  </div>
                  <p className="text-gray-700 text-[10px] font-mono">{b.ticketCode}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </Layout>
    )
  }

  // ── Commandes prestataires ──────────────────────────────────────────────────
  if (panel === 'service-orders') {
    const uid = getUserId(user)
    const serviceOrders = getOrdersForBuyer(uid)
    return (
      <Layout>
        <div className="px-4 py-6 space-y-5">
          <div className="flex items-center gap-3">
            <BackButton />
            <h2 className="text-white font-bold">Mes commandes prestataires</h2>
          </div>
          {serviceOrders.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <p className="text-4xl">📦</p>
              <p className="text-gray-500 text-sm">Aucune commande pour l'instant.</p>
              <button onClick={() => navigate('/proposer')} className="btn-gold text-sm">Parcourir les prestataires</button>
            </div>
          ) : (
            <div className="space-y-4">
              {serviceOrders.map(order => {
                const st = ORDER_STATUS_LABELS[order.status] || { label: order.status, color: '#6b7280' }
                return (
                  <div key={order.id} className="glass p-4 rounded-2xl space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-white font-semibold text-sm">{order.sellerName}</p>
                        <p className="text-gray-600 text-xs">{new Date(order.createdAt).toLocaleDateString('fr-FR')}</p>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full border font-semibold"
                        style={{ color: st.color, borderColor: st.color + '44', background: st.color + '11' }}>
                        {st.label}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {order.items.map((it, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-gray-400">{it.name} × {it.qty}</span>
                          <span className="text-white">{(it.price * it.qty).toFixed(2)}€</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between text-sm border-t border-white/[0.07] pt-2">
                      <span className="text-gray-400">Total payé</span>
                      <span className="text-[#d4af37] font-bold">{order.subtotal.toFixed(2)}€</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Layout>
    )
  }

  // ── Support ─────────────────────────────────────────────────────────────────
  if (panel === 'support') {
    return (
      <Layout>
        <div className="px-4 py-6 space-y-5">
          <div className="flex items-center gap-3">
            <BackButton />
            <h2 className="text-white font-bold">Support / Aide</h2>
          </div>

          <div>
            <h3 className="text-[#d4af37] text-xs uppercase tracking-widest mb-3">Questions fréquentes</h3>
            <div className="space-y-2">
              {FAQ.map((item, i) => (
                <div key={i} className="glass rounded-xl overflow-hidden">
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full flex items-center justify-between p-4 text-left"
                  >
                    <p className="text-white text-sm font-semibold pr-4">{item.q}</p>
                    <span className={`text-gray-500 text-lg transition-transform flex-shrink-0 ${openFaq === i ? 'rotate-180' : ''}`}>
                      ˅
                    </span>
                  </button>
                  {openFaq === i && (
                    <div className="px-4 pb-4">
                      <p className="text-gray-400 text-sm leading-relaxed">{item.a}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="glass p-5 rounded-2xl border border-[#d4af37]/20 space-y-3">
            <h3 className="text-[#d4af37] text-xs uppercase tracking-widest">Contacter le support</h3>
            <p className="text-gray-400 text-sm">Tu n'as pas trouvé de réponse ? Notre équipe te répond sous 24h.</p>
            <a
              href="mailto:support@liveinblack.com"
              className="btn-gold w-full flex items-center justify-center gap-2 text-sm"
            >
              📧 Envoyer un message
            </a>
            <p className="text-gray-600 text-[10px] text-center">support@liveinblack.com</p>
          </div>
        </div>
      </Layout>
    )
  }

  // ── Main Profile ─────────────────────────────────────────────────────────────
  const bookingsCount = getBookings().length
  const createdCount = (() => { try { return JSON.parse(localStorage.getItem('lib_created_events') || '[]').length } catch { return 0 } })()
  const wallet = getWallet(getUserId(user))

  return (
    <Layout>
      <div className="px-4 py-6 space-y-6">
        {/* Avatar & name */}
        <div className="text-center py-4">
          <AvatarUpload user={user} setUser={setUser} />
          <h2 className="text-white text-xl font-bold mt-3">{user?.name}</h2>
          <p className="text-gray-500 text-sm">{user?.email}</p>
          {user?.phone && <p className="text-gray-600 text-xs mt-0.5">📞 {user.phone}</p>}
          <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
            {user?.role && ROLES[user.role] && (
              <span className="text-xs px-3 py-1 rounded-full border font-semibold"
                style={{ color: ROLES[user.role].color, borderColor: ROLES[user.role].color + '44', background: ROLES[user.role].color + '11' }}>
                {ROLES[user.role].icon} {ROLES[user.role].label}
              </span>
            )}
            <span className="text-xs bg-[#d4af37]/10 text-[#d4af37] px-3 py-1 rounded-full border border-[#d4af37]/20">
              ✦ {user?.points || 0} points
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Tickets achetés', val: bookingsCount },
            { label: 'Événements créés', val: createdCount },
            { label: 'Points', val: user?.points || 0 },
          ].map((s) => (
            <div key={s.label} className="glass p-3 rounded-xl text-center">
              <p className="text-white text-xl font-bold">{s.val}</p>
              <p className="text-gray-600 text-[10px] mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Wallet quick-access */}
        <button
          onClick={() => navigate('/portefeuille')}
          className="w-full glass p-4 rounded-2xl border border-[#d4af37]/20 flex items-center justify-between hover:border-[#d4af37]/50 transition-all"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">💰</span>
            <div className="text-left">
              <p className="text-[#d4af37] text-xs uppercase tracking-widest">Mon Portefeuille</p>
              <p className="text-white font-black text-xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>{wallet.balance.toFixed(2)}€</p>
            </div>
          </div>
          <span className="text-[#d4af37] text-lg">›</span>
        </button>

        {/* Points info */}
        <div className="glass p-4 rounded-2xl border border-[#d4af37]/10">
          <p className="text-[#d4af37] text-xs uppercase tracking-widest mb-2">Système de points</p>
          <p className="text-gray-400 text-sm">
            Tu gagnes <strong className="text-white">1 point</strong> pour chaque ticket ou carré acheté. Les points seront bientôt échangeables contre des avantages exclusifs.
          </p>
        </div>

        {/* Menu */}
        <div className="space-y-2">
          {[
            { label: 'Mes billets', icon: '🎟', action: () => setPanel('billets') },
            { label: 'Mes enchères', icon: '🔨', action: () => setPanel('encheres') },
            { label: 'Mes commandes événements', icon: '🛒', action: () => setPanel('commandes') },
            { label: 'Mes commandes prestataires', icon: '📦', action: () => setPanel('service-orders') },
            { label: 'Paramètres du compte', icon: '⚙', action: () => setPanel('settings') },
            { label: 'Support / Aide', icon: '💬', action: () => setPanel('support') },
          ].map((item) => (
            <button
              key={item.label}
              onClick={item.action}
              className="w-full flex items-center gap-3 p-3 glass rounded-xl text-left hover:border-white/10 transition-all group"
            >
              <span className="text-lg">{item.icon}</span>
              <span className="text-gray-300 text-sm flex-1">{item.label}</span>
              <span className="text-gray-700 group-hover:text-gray-500 transition-colors">›</span>
            </button>
          ))}
        </div>

        {/* Logout */}
        <button
          onClick={() => setShowLogoutConfirm(true)}
          className="w-full py-3 border border-red-500/20 text-red-400 rounded-xl text-sm font-semibold hover:bg-red-500/10 transition-all"
        >
          Se déconnecter
        </button>
      </div>

      {/* Logout confirmation modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center px-6">
          <div className="glass rounded-2xl p-6 w-full max-w-xs space-y-4 border border-red-500/20">
            <h3 className="text-white font-bold text-center">Se déconnecter ?</h3>
            <p className="text-gray-400 text-sm text-center">Tu devras te reconnecter pour accéder à ton compte.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-gray-300 text-sm font-semibold hover:bg-white/5 transition-all"
              >
                Annuler
              </button>
              <button
                onClick={async () => {
                  const { USE_REAL_FIREBASE } = await import('../firebase')
                  if (USE_REAL_FIREBASE) {
                    const { auth } = await import('../firebase')
                    const { signOut } = await import('firebase/auth')
                    await signOut(auth).catch(() => {})
                  }
                  setUser(null)
                  navigate('/')
                }}
                className="flex-1 py-2.5 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 text-sm font-semibold hover:bg-red-500/30 transition-all"
              >
                Déconnecter
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}

function EventTicketGroup({ group }) {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="glass rounded-2xl overflow-hidden">
      {/* Event header — click to go to event page */}
      <div
        className="p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => navigate(`/evenements/${group.eventId}`)}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white font-semibold text-sm">{group.eventName}</p>
            <p className="text-gray-500 text-xs">{group.eventDate}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-green-400 bg-green-400/10 border border-green-400/20 px-2 py-0.5 rounded-full">
              {group.tickets.length} billet{group.tickets.length > 1 ? 's' : ''}
            </span>
            <span className="text-gray-600 text-lg">›</span>
          </div>
        </div>
      </div>

      {/* Expand / collapse tickets */}
      <div className="border-t border-white/[0.05]">
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full px-4 py-2.5 flex items-center justify-between text-[#d4af37] text-xs font-semibold hover:bg-white/[0.02] transition-colors"
        >
          <span>{expanded ? 'Masquer mes places' : 'Voir mes places'}</span>
          <span className={`text-sm transition-transform ${expanded ? 'rotate-90' : ''}`}>›</span>
        </button>

        {expanded && (
          <div className="px-3 pb-3 space-y-2">
            {group.tickets.map((b, i) => (
              <SingleTicketCard key={b.id} booking={b} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SingleTicketCard({ booking: b, index }) {
  const [showQr, setShowQr] = useState(false)
  const canvasRef = useRef(null)
  const qrUrl = b.token ? `${window.location.origin}/ticket/${b.token}` : ''

  function downloadQr() {
    const canvas = document.getElementById(`qr-canvas-${b.id}`)
    if (!canvas) return
    const link = document.createElement('a')
    link.download = `billet-${b.ticketCode}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  return (
    <div className="bg-[#08080f] border border-white/[0.05] rounded-xl overflow-hidden">
      <div className="p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-[#d4af37]/20 flex items-center justify-center text-[#d4af37] text-[10px] font-bold flex-shrink-0">
            {index + 1}
          </span>
          <div>
            <p className="text-white text-sm font-semibold">{b.place}</p>
            <p className="text-gray-600 text-[10px] font-mono">{b.ticketCode}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {qrUrl && (
            <button
              onClick={() => setShowQr(v => !v)}
              className="px-2 py-1 rounded-lg text-[10px] text-[#d4af37] bg-[#d4af37]/10 border border-[#d4af37]/20 font-semibold"
            >
              {showQr ? '✕ QR' : '📱 QR'}
            </button>
          )}
        </div>
      </div>

      {b.preorderSummary?.length > 0 && (
        <div className="px-3 pb-2">
          <p className="text-purple-400 text-[10px]">
            🛒 {b.preorderSummary.map(i => i.name).join(', ')}
          </p>
        </div>
      )}

      {showQr && qrUrl && (
        <div className="border-t border-white/[0.05] p-4 flex flex-col items-center gap-3">
          <div className="p-3 bg-white rounded-xl inline-block">
            <QRCodeSVG value={qrUrl} size={150} level="H" />
          </div>
          {/* Hidden canvas for download */}
          <div className="hidden">
            <QRCodeCanvas id={`qr-canvas-${b.id}`} value={qrUrl} size={400} level="H" />
          </div>
          <button
            onClick={downloadQr}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#d4af37]/10 border border-[#d4af37]/30 text-[#d4af37] text-xs font-semibold hover:bg-[#d4af37]/20 transition-all"
          >
            ⬇ Télécharger le QR code
          </button>
          <p className="text-gray-800 text-[9px]">🔐 Signature anti-fraude · LIVEINBLACK</p>
        </div>
      )}
    </div>
  )
}

function AvatarUpload({ user, setUser }) {
  const inputRef = useRef(null)

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const avatar = ev.target.result
      setUser({ ...user, avatar })
      try {
        const users = JSON.parse(localStorage.getItem('lib_users') || '[]')
        const idx = users.findIndex(u => u.id === user.id || u.email === user.email)
        if (idx >= 0) {
          users[idx] = { ...users[idx], avatar }
          localStorage.setItem('lib_users', JSON.stringify(users))
        }
      } catch {}
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="inline-block mx-auto">
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <button
        onClick={() => inputRef.current?.click()}
        className="relative w-20 h-20 rounded-full overflow-hidden border-4 border-white/[0.05] hover:border-[#d4af37]/50 transition-colors group"
      >
        {user?.avatar ? (
          <img src={user.avatar} alt="avatar" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-[#d4af37] flex items-center justify-center text-black text-3xl font-bold">
            {user?.name?.[0]?.toUpperCase() || '?'}
          </div>
        )}
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-white text-xl">📷</span>
        </div>
      </button>
    </div>
  )
}
