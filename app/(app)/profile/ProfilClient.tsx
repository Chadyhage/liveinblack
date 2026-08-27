'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { ArrowLeft, Heart, KeyRound, LifeBuoy, Search, Settings, ShieldCheck, Ticket, UserRound } from 'lucide-react'
import PreferencesModal, { summarizePreferences, type Preferences } from './PreferencesWizard'
import { getPasswordStrength } from '@/lib/shared/ticketExtras'
import { regions } from '@/lib/shared/regions'
import { getPasswordPolicyErrors } from '@/lib/shared/passwordPolicy'
import { Eye, EyeOff } from 'lucide-react'
import { Button, Input, Select, Switch, Badge, Label, Slider, Card, Accordion, ConfirmDialog, Modal } from '@/app/components/ui'
import overviewStyles from './ProfileOverview.module.css'
import helpStyles from './HelpPanel.module.css'
import { filterSettingEntries, normalizeSettingsQuery, splitPhone } from './profileSettingsUtils'

// Port de src/pages/ProfilePage.jsx (#6 phase profil) — portée CLIENT
// uniquement : les panneaux "Interface Prestataire/Organisateur",
// "Facturation", "Encaissement" et "Mes documents d'identification" restent
// délibérément absents ici (phases 7/8, qui les construisent de toute façon),
// exactement comme documenté dans lib/server/profile.ts.

export interface ProfilUser {
  id: string
  firstName: string
  lastName: string
  email: string
  pendingEmail: string | null
  avatarUrl: string | null
  phone: string
  birthYear: number | null
  gender: string | null
  nameChangedAt: string | null
  points: number
  role: string
  privacy: { showOnline: boolean; showAvatar: boolean; readReceipts: boolean; personalizedRecommendations: boolean }
  preferences: Partial<Preferences> | null
}

const NAME_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000
const SUPPORT_EMAIL = 'hagechady@liveinblack.com'

const ERROR_MESSAGES: Record<string, string> = {
  name_required: 'Le prénom / nom est obligatoire',
  name_too_long: 'Ce nom est trop long',
  // Fallback générique si jamais nextChangeAllowedAt manque dans la réponse —
  // errorMessage() ci-dessous construit un message daté à partir de ce champ
  // quand il est présent (voir updateName dans lib/server/profile.ts).
  name_cooldown_active: 'Tu as déjà renommé ton compte récemment, réessaie plus tard.',
  invalid_birth_year: 'Année de naissance invalide.',
  invalid_gender: 'Genre invalide.',
  phone_required: 'Le numéro de téléphone est obligatoire',
  invalid_phone: 'Numéro de téléphone invalide pour ce pays',
  phone_taken: 'Ce numéro de téléphone est déjà utilisé par un compte actif',
  invalid_password: 'Mot de passe actuel incorrect',
  invalid_email: 'Adresse e-mail invalide',
  same_email: "C'est déjà ton adresse e-mail actuelle",
  email_taken: 'Cette adresse e-mail est déjà utilisée',
  password_too_short: 'Utilise au moins 8 caractères, une majuscule et un chiffre',
  user_not_found: 'Compte introuvable',
  invalid_data_uri: 'Image invalide',
  file_too_large: 'Image trop volumineuse',
  upload_failed: 'Envoi impossible, réessaie',
}

function errorMessage(code: string, data?: { nextChangeAllowedAt?: string }): string {
  if (code === 'name_cooldown_active' && data?.nextChangeAllowedAt) {
    const formatted = new Date(data.nextChangeAllowedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    return `Tu pourras renommer ton compte à partir du ${formatted}.`
  }
  return ERROR_MESSAGES[code] || 'Une erreur est survenue, réessaie'
}

// Style visuel "CTA or" partagé par tous les boutons primaires de ce panneau
// (auparavant généré par l'helper `primaryBtn`) — passé via la prop `style`
// de <Button variant="primary">, qui gère déjà elle-même l'opacité/curseur
// disabled et le spinner de chargement.
// Ne PAS fixer `background`/`color` ici : un dégradé toujours plein posé
// au-dessus du fond "désactivé" de <Button> (géré par variantStyle) rendait
// les boutons "Enregistrer" ternes/olive tant qu'aucun champ n'était modifié,
// au lieu du gris-vert clair et propre déjà prévu pour l'état disabled.
const goldButtonStyle: React.CSSProperties = {
  borderRadius: 3,
  textTransform: 'none',
  letterSpacing: 'normal',
  fontWeight: 500,
}

const ROLE_LABELS: Record<string, { label: string; badgeTone: 'teal' | 'violet' | 'gold' }> = {
  client: { label: 'Client', badgeTone: 'teal' },
  prestataire: { label: 'Prestataire', badgeTone: 'violet' },
  organisateur: { label: 'Organisateur', badgeTone: 'teal' },
  agent: { label: 'Agent', badgeTone: 'gold' },
}

// Racine du dashboard "Mon profil" — identité/avatar/points uniquement.
// Les anciens panneaux internes (Mes billets, Paramètres, Support) et la
// navigation "Événements intéressés"/"Organisateurs suivis" sont maintenant
// de vraies routes listées dans le sous-menu de la sidebar (voir
// dashboardNav.ts, COMMON_NAV) plutôt que dans un menu rendu ici.
export default function ProfilClient({ initialUser }: { initialUser: ProfilUser }) {
  const [user, setUser] = useState<ProfilUser>(initialUser)
  return <MainView user={user} setUser={setUser} />
}

function MainView({ user, setUser }: { user: ProfilUser; setUser: (u: ProfilUser) => void }) {
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const roleInfo = ROLE_LABELS[user.role]
  const isOrganizer = user.role === 'organisateur'

  async function confirmLogout() {
    setLoggingOut(true)
    await signOut({ redirectTo: '/home' })
  }

  return (
    <main className={`profile-main lb-dashboard-page ${overviewStyles.root}`}>
      <style>{`
        .profile-quick-grid-density { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }
        .profile-settings { padding-bottom: 96px; }
        @media (max-width: 780px) { .profile-quick-grid-density { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; } }
        @media (max-width: 480px) { .profile-quick-grid-density { grid-template-columns: minmax(0, 1fr) !important; } .profile-settings { padding-bottom: 72px; } }
      `}</style>
      <div className={overviewStyles.grid}>
        <Card className={overviewStyles.identity}>
          <AvatarUpload user={user} setUser={setUser} />
          <h1>{[user.firstName, user.lastName].filter(Boolean).join(' ') || 'Toi'}</h1>
          <p className={overviewStyles.email}>{user.email}</p>
          <div className={overviewStyles.badges}>
            {roleInfo && <Badge tone={roleInfo.badgeTone}>{roleInfo.label}</Badge>}
            {!isOrganizer && <Badge tone="gold">{user.points || 0} pts</Badge>}
          </div>
          {/* Le nom/téléphone/année de naissance s'éditent sur Paramètres du
              compte (formulaires plus lourds) — lien direct ici pour ne pas
              faire deviner où se trouve "modifier mes infos". */}
          <Link href="/profile/parametres" className={overviewStyles.editLink}>
            Modifier mes informations →
          </Link>
          <Button
            onClick={() => setShowLogoutConfirm(true)}
            variant="secondary"
            fullWidth
            className={overviewStyles.logout}
          >
            Se déconnecter
          </Button>
        </Card>

        <div className={overviewStyles.content}>
          {!isOrganizer && (
            <Card className={overviewStyles.points}>
              <p className={overviewStyles.pointsLabel}>Tes points fidélité</p>
              <strong className={overviewStyles.pointsValue}>{user.points || 0} point{user.points === 1 ? '' : 's'}</strong>
              <p className={overviewStyles.pointsText}>Tu gagnes un point pour chaque ticket ou carré acheté. Ils seront bientôt échangeables contre des avantages exclusifs.</p>
            </Card>
          )}

          <div className={`${overviewStyles.quickGrid} profile-quick-grid-density`}>
            <QuickAccessCard href="/profile/parametres" icon={<Settings size={18} />} label="Paramètres du compte" />
            <QuickAccessCard href="/profile/billets" icon={<Ticket size={18} />} label="Mes billets" />
            <QuickAccessCard href="/profile/interested-events" icon={<Heart size={18} />} label="Mes favoris" />
            <QuickAccessCard href="/help" icon={<LifeBuoy size={18} />} label="Aide & FAQ" />
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={showLogoutConfirm}
        title="Se déconnecter ?"
        body="Tu devras te reconnecter pour accéder à ton compte."
        confirmLabel={loggingOut ? 'Déconnexion…' : 'Déconnecter'}
        confirmDisabled={loggingOut}
        confirmLoading={loggingOut}
        confirmLoadingText="Déconnexion…"
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={() => { void confirmLogout() }}
      />
    </main>
  )
}

// Cartes de raccourci vers les 4 sous-destinations du sous-menu "Mon profil"
// (voir dashboardNav.ts) — rend /profile utile en lui-même plutôt qu'un
// écran quasi vide qui force à repérer le sous-menu de la sidebar.
function QuickAccessCard({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className={overviewStyles.quickLink}
    >
      <span className={overviewStyles.quickIcon}>{icon}</span>
      <span className={overviewStyles.quickLabel}>{label}</span>
    </Link>
  )
}

// ────────────────────────────────── AvatarUpload ─────────────────────────────

const PREVIEW = 192
const OUTPUT = 300

function AvatarUpload({ user, setUser }: { user: ProfilUser; setUser: (u: ProfilUser) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [saving, setSaving] = useState(false)
  const dragStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setCropSrc(String(reader.result))
      setZoom(1)
      setOffset({ x: 0, y: 0 })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function onPointerDown(e: React.PointerEvent) {
    setDragging(true)
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging || !dragStart.current) return
    setOffset({ x: dragStart.current.ox + (e.clientX - dragStart.current.x), y: dragStart.current.oy + (e.clientY - dragStart.current.y) })
  }
  function onPointerUp() {
    setDragging(false)
    dragStart.current = null
  }

  async function saveAvatar() {
    const img = imgRef.current
    if (!img) return
    setSaving(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = OUTPUT
      canvas.height = OUTPUT
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.save()
      ctx.beginPath()
      ctx.arc(OUTPUT / 2, OUTPUT / 2, OUTPUT / 2, 0, Math.PI * 2)
      ctx.clip()

      const coverScale = Math.max(OUTPUT / img.naturalWidth, OUTPUT / img.naturalHeight) * zoom
      const dw = img.naturalWidth * coverScale
      const dh = img.naturalHeight * coverScale
      const scaleRatio = OUTPUT / PREVIEW
      const dx = (OUTPUT - dw) / 2 + offset.x * scaleRatio
      const dy = (OUTPUT - dh) / 2 + offset.y * scaleRatio
      ctx.drawImage(img, dx, dy, dw, dh)
      ctx.restore()

      const dataUri = canvas.toDataURL('image/jpeg', 0.88)
      setUser({ ...user, avatarUrl: dataUri })
      setCropSrc(null)

      const res = await fetch('/api/profil/avatar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUri }) })
      const data = await res.json()
      if (res.ok && data.ok) setUser({ ...user, avatarUrl: data.avatarUrl })
    } finally {
      setSaving(false)
    }
  }

  const initial = (user.firstName || user.email || '?').charAt(0).toUpperCase()

  return (
    <>
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFileChange} />
      <Button
        type="button"
        variant="ghost"
        aria-label="Changer la photo de profil"
        onClick={() => fileInputRef.current?.click()}
        style={{
          width: 60,
          height: 60,
          borderRadius: '50%',
          background: user.avatarUrl ? `url(${user.avatarUrl}) center/cover` : 'var(--border)',
          fontSize: 18,
          fontWeight: 800,
          color: 'var(--gold)',
          position: 'relative',
          padding: 0,
        }}
      >
        {!user.avatarUrl && initial}
      </Button>

      {cropSrc && (
        <Modal
          onClose={() => setCropSrc(null)}
          hideClose
          ariaLabel="Recadrer la photo de profil"
          contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 18, padding: 20, textAlign: 'center', maxHeight: 'none', overflowY: 'visible' }}
        >
            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#fff', margin: '0 0 4px' }}>Recadrer la photo</h2>
            <p style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', margin: '0 0 16px' }}>Glisse pour repositionner</p>
            <div
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
              style={{ width: PREVIEW, height: PREVIEW, borderRadius: '50%', overflow: 'hidden', margin: '0 auto 16px', position: 'relative', background: '#000', cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' }}
            >
              {/* Image locale temporaire : le canvas de recadrage lit naturalWidth/naturalHeight. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={cropSrc}
                alt=""
                draggable={false}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: `${zoom * 100}%`,
                  height: 'auto',
                  minWidth: '100%',
                  minHeight: '100%',
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                  objectFit: 'cover',
                  userSelect: 'none',
                }}
              />
            </div>
            <div role="group" aria-label="Repositionner la photo" style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 14 }}>
              {[
                { label: 'Déplacer la photo vers la gauche', glyph: '←', dx: -6, dy: 0 },
                { label: 'Déplacer la photo vers le haut', glyph: '↑', dx: 0, dy: -6 },
                { label: 'Déplacer la photo vers le bas', glyph: '↓', dx: 0, dy: 6 },
                { label: 'Déplacer la photo vers la droite', glyph: '→', dx: 6, dy: 0 },
              ].map((control) => (
                <Button
                  key={control.label}
                  type="button"
                  variant="secondary"
                  aria-label={control.label}
                  onClick={() => setOffset((current) => ({ x: current.x + control.dx, y: current.y + control.dy }))}
                  style={{ width: 38, height: 38, minHeight: 38, minWidth: 38, padding: 0, borderRadius: 11, fontSize: 16 }}
                >
                  {control.glyph}
                </Button>
              ))}
            </div>
            {/* Curseur de zoom natif conservé : Input/Select ne couvrent pas
                type="range" (rendu/accentColor spécifique), donc laissé natif
                comme indiqué dans la consigne de swap. */}
            <Slider accent="gold" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} style={{ marginBottom: 18 }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <Button onClick={() => setCropSrc(null)} variant="secondary" style={{ flex: 1, padding: '9px 0', borderRadius: 10 }}>
                Annuler
              </Button>
              <Button onClick={saveAvatar} disabled={saving} loading={saving} loadingText="Enregistrement…" variant="primary" style={{ flex: 1, padding: '9px 0', ...goldButtonStyle }}>
                Valider
              </Button>
            </div>
        </Modal>
      )}
    </>
  )
}

// ────────────────────────────────── SettingsPanel ────────────────────────────

interface SettingEntry {
  id: string
  keywords: string[]
  render: (ctx: { user: ProfilUser; setUser: (u: ProfilUser) => void }) => React.ReactNode
}

export function SettingsPanel({ user, setUser, onBack }: { user: ProfilUser; setUser: (u: ProfilUser) => void; onBack: () => void }) {
  const [query, setQuery] = useState('')
  const [activeGroup, setActiveGroup] = useState('profil')

  const entries: SettingEntry[] = useMemo(
    () => [
      { id: 'identite', keywords: ['nom', 'prenom', 'identite', 'demographie', 'age', 'genre', 'telephone', 'numero', 'phone'], render: (ctx) => <IdentityCard {...ctx} /> },
      { id: 'goûts', keywords: ['gouts', 'preferences', 'recommandations', 'musique', 'artiste'], render: (ctx) => <PreferencesCard {...ctx} /> },
      { id: 'visibilite', keywords: ['qui voit quoi', 'visibilite', 'confidentialite'], render: (ctx) => <VisibilityCard {...ctx} /> },
      { id: 'confidentialite', keywords: ['confidentialite', 'prive', 'en ligne', 'lecture', 'photo'], render: (ctx) => <PrivacyCard {...ctx} /> },
      { id: 'mes donnees', keywords: ['exporter', 'telecharger', 'donnees', 'rgpd', 'export', 'portabilite', 'acces'], render: () => <DataExportCard /> },
      { id: 'email', keywords: ['email', 'e-mail', 'mail', 'adresse'], render: (ctx) => <EmailCard {...ctx} /> },
      { id: 'mot de passe', keywords: ['mot de passe', 'password', 'securite'], render: (ctx) => <PasswordCard email={ctx.user.email} /> },
      { id: 'danger', keywords: ['supprimer', 'suppression', 'compte', 'danger'], render: () => <DangerZoneCard /> },
    ],
    []
  )

  const q = normalizeSettingsQuery(query)
  const tokens = q.split(/\s+/).filter(Boolean)
  const filtered = filterSettingEntries(entries, query)
  const settingGroups = [
    { id: 'profil', title: 'Profil et préférences', shortTitle: 'Profil', description: 'Identité, téléphone et goûts', ids: ['identite', 'goûts'], icon: UserRound, color: '#70b7ff' },
    { id: 'privacy', title: 'Confidentialité et données', shortTitle: 'Confidentialité', description: 'Visibilité, recommandations et export', ids: ['visibilite', 'confidentialite', 'mes donnees'], icon: ShieldCheck, color: '#70dac4' },
    { id: 'security', title: 'Connexion et sécurité', shortTitle: 'Sécurité', description: 'E-mail, mot de passe et compte', ids: ['email', 'mot de passe', 'danger'], icon: KeyRound, color: '#c4a7ff' },
  ]
  const visibleGroups = tokens.length > 0 ? settingGroups : settingGroups.filter((group) => group.id === activeGroup)

  return (
    <main className="profile-settings lb-dashboard-page">
      <style>{`
        @media (max-width: 480px) {
          .profile-settings { padding-bottom: 120px; }
          .profile-demo-row { flex-direction: column; }
        }
      `}</style>
      <div className="settings-page-stack">
        <div className="settings-toolbar">
          <Button onClick={onBack} variant="ghost" className="settings-back" icon={<ArrowLeft size={17} aria-hidden="true" />}>
            Profil
          </Button>
          <div className="settings-search">
            <Search size={18} aria-hidden="true" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher dans les paramètres" aria-label="Rechercher dans les paramètres" />
            {query && <Button onClick={() => setQuery('')} variant="ghost" aria-label="Effacer la recherche">Effacer</Button>}
          </div>
        </div>

        <nav className="settings-tabs" aria-label="Catégories de paramètres">
            {settingGroups.map((group) => {
              const Icon = group.icon
              const active = group.id === activeGroup && tokens.length === 0
              return <Button key={group.id} variant="ghost" onClick={() => { setActiveGroup(group.id); setQuery('') }} className={active ? 'settings-nav-item settings-nav-item--active' : 'settings-nav-item'} aria-current={active ? 'page' : undefined} style={{ '--setting-color': group.color } as React.CSSProperties}>
                <span className="settings-nav-icon"><Icon size={18} aria-hidden="true" /></span>
                <span><strong>{group.shortTitle}</strong><small>{group.description}</small></span>
              </Button>
            })}
        </nav>

        <section className="settings-content" aria-live="polite">
            {filtered.length === 0 ? (
              <div className="settings-empty">
                <Search size={25} aria-hidden="true" />
                <h2>Aucun résultat</h2>
                <p>Aucun réglage ne correspond à « {query} ». Essaie « e-mail », « téléphone » ou « confidentialité ».</p>
                <Button onClick={() => setQuery('')} variant="secondary">Effacer la recherche</Button>
              </div>
            ) : (
              <div className="settings-groups">
                {tokens.length > 0 && <div className="settings-results-heading"><p>Résultats de recherche</p><h2>{filtered.length} réglage{filtered.length > 1 ? 's' : ''} trouvé{filtered.length > 1 ? 's' : ''}</h2></div>}
                {visibleGroups.map((group) => {
                  const groupEntries = filtered.filter((entry) => group.ids.includes(entry.id))
                  if (groupEntries.length === 0) return null
                  return <section key={group.id} className="settings-group" aria-labelledby={`settings-group-${group.id}`}>
                    {tokens.length > 0 && <h3 id={`settings-group-${group.id}`}>{group.title}</h3>}
                    <div className="settings-card-grid">{groupEntries.map((entry) => <div key={entry.id} id={`setting-${entry.id}`}>{entry.render({ user, setUser })}</div>)}</div>
                  </section>
                })}
              </div>
            )}
        </section>
      </div>
    </main>
  )
}

function EyebrowLabel({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 14, fontWeight: 400, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '3.2px', fontFamily: 'var(--font-display), sans-serif', margin: '0 0 12px' }}>{children}</p>
}

function Toast({ text, kind }: { text: string; kind: 'ok' | 'err' }) {
  return <p style={{ fontSize: 12.5, color: kind === 'ok' ? 'var(--teal)' : '#ff7b7b', margin: '10px 0 0' }}>{text}</p>
}

// Champ mot de passe avec bouton "Voir"/"Cacher" — même pattern que
// /login (AuthForm.tsx), pour que les champs mot de passe de /profile aient
// la même affordance que ceux de la connexion/inscription.
function PasswordField({
  value,
  onChange,
  placeholder,
  style,
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  style?: React.CSSProperties
  autoFocus?: boolean
}) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <Input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={show ? 'text' : 'password'}
        placeholder={placeholder}
        style={{ ...style, paddingRight: 56 }}
      />
      <Button
        type="button"
        variant="link"
        onClick={() => setShow((v) => !v)}
        icon={show ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', gap: 5, fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textDecoration: 'none' }}
      >
        {show ? 'Cacher' : 'Voir'}
      </Button>
    </div>
  )
}

function IdentityCard({ user, setUser }: { user: ProfilUser; setUser: (u: ProfilUser) => void }) {
  const [firstName, setFirstName] = useState(user.firstName)
  const [lastName, setLastName] = useState(user.lastName)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null)

  const initialPhone = splitPhone(user.phone)
  const [dialCode, setDialCode] = useState(initialPhone.dialCode)
  const [phoneNumber, setPhoneNumber] = useState(initialPhone.number)
  const [phoneSaving, setPhoneSaving] = useState(false)
  const [phoneMsg, setPhoneMsg] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null)
  const phoneChanged = dialCode !== initialPhone.dialCode || phoneNumber.trim() !== initialPhone.number

  const [birthYear, setBirthYear] = useState(user.birthYear ? String(user.birthYear) : '')
  const [gender, setGender] = useState(user.gender ?? '')
  const [demoSaving, setDemoSaving] = useState(false)
  const [demoMsg, setDemoMsg] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null)

  // L'horloge murale (Date.now()) ne doit jamais être lue pendant le rendu
  // (impur) — lecture unique via l'initialiseur paresseux de useState (même
  // pattern que la lecture localStorage de newFriendIds dans
  // MessagesClient.tsx), mise à jour explicite après un changement de nom
  // réussi plutôt que recalculée à chaque rendu.
  const [onCooldown, setOnCooldown] = useState(() => Boolean(user.nameChangedAt && Date.now() - new Date(user.nameChangedAt).getTime() < NAME_COOLDOWN_MS))
  const nextChangeDate = user.nameChangedAt ? new Date(new Date(user.nameChangedAt).getTime() + NAME_COOLDOWN_MS) : null
  const nameChanged = firstName.trim() !== user.firstName || lastName.trim() !== user.lastName

  const currentYear = new Date().getFullYear()
  const yearOptions: number[] = []
  for (let y = currentYear - 13; y >= currentYear - 80; y--) yearOptions.push(y)

  async function saveName() {
    if (onCooldown) return
    const cleanFirst = firstName.trim()
    const cleanLast = lastName.trim()
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/profil/nom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firstName: cleanFirst, lastName: cleanLast }) })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setMsg({ text: errorMessage(data.error, data), kind: 'err' })
        if (data.error === 'name_cooldown_active') setOnCooldown(true)
      } else {
        setUser({ ...user, firstName: data.firstName, lastName: data.lastName, nameChangedAt: new Date().toISOString() })
        setOnCooldown(true)
        setMsg({ text: 'Nom mis à jour', kind: 'ok' })
        setTimeout(() => setMsg(null), 3000)
      }
    } catch {
      setMsg({ text: 'Une erreur est survenue, réessaie', kind: 'err' })
    } finally {
      setSaving(false)
    }
  }

  async function savePhone() {
    setPhoneSaving(true)
    setPhoneMsg(null)
    try {
      const res = await fetch('/api/profil/telephone', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dialCode, phone: phoneNumber }) })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setPhoneMsg({ text: errorMessage(data.error), kind: 'err' })
      } else {
        setUser({ ...user, phone: data.phone })
        // Le serveur normalise le numéro (retire le 0 initial, voir
        // lib/server/profile.ts:updatePhone) — sans réaligner les champs
        // locaux dessus, phoneChanged resterait vrai après un enregistrement
        // réussi (le champ garderait le 0 tapé par l'utilisateur) et le
        // bouton resterait actif à tort.
        const saved = splitPhone(data.phone)
        setDialCode(saved.dialCode)
        setPhoneNumber(saved.number)
        setPhoneMsg({ text: 'Numéro mis à jour', kind: 'ok' })
        setTimeout(() => setPhoneMsg(null), 3000)
      }
    } catch {
      setPhoneMsg({ text: 'Une erreur est survenue, réessaie', kind: 'err' })
    } finally {
      setPhoneSaving(false)
    }
  }

  const demoUnchanged = (birthYear ? Number(birthYear) : null) === user.birthYear && (gender || null) === user.gender

  async function saveDemographics() {
    setDemoSaving(true)
    setDemoMsg(null)
    try {
      const res = await fetch('/api/profil/demographie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ birthYear: birthYear ? Number(birthYear) : null, gender: gender || null }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setDemoMsg({ text: errorMessage(data.error), kind: 'err' })
      } else {
        setUser({ ...user, birthYear: data.birthYear, gender: data.gender })
        setDemoMsg({ text: 'Infos enregistrées', kind: 'ok' })
        setTimeout(() => setDemoMsg(null), 3000)
      }
    } catch {
      setDemoMsg({ text: 'Enregistrement impossible, réessaie.', kind: 'err' })
    } finally {
      setDemoSaving(false)
    }
  }

  return (
    <Card>
      <EyebrowLabel>Informations personnelles</EyebrowLabel>
      <Label>Prénom / Nom</Label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, opacity: onCooldown ? 0.5 : 1 }}>
        <Input aria-label="Prénom" value={firstName} onChange={(e) => !onCooldown && setFirstName(e.target.value)} placeholder="Ton prénom" disabled={onCooldown} />
        <Input aria-label="Nom" value={lastName} onChange={(e) => !onCooldown && setLastName(e.target.value)} placeholder="Ton nom" disabled={onCooldown} />
      </div>
      {onCooldown && nextChangeDate && (
        <p style={{ fontSize: 12, color: 'var(--gold)', margin: '0 0 10px' }}>
          Prochain changement possible le {nextChangeDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      )}
      <Button onClick={saveName} disabled={saving || !nameChanged || onCooldown} loading={saving} loadingText="Enregistrement…" variant="primary" style={goldButtonStyle}>
        Enregistrer le nom
      </Button>
      {msg && <Toast text={msg.text} kind={msg.kind} />}

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }} />

      <Label>Téléphone</Label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <Select
          aria-label="Indicatif téléphonique"
          value={dialCode}
          onChange={setDialCode}
          options={regions.map((r) => ({ value: r.dial, label: `${r.flag} ${r.dial}` }))}
          size="sm"
        />
        <Input aria-label="Numéro de téléphone" type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="Numéro sans l'indicatif" style={{ flex: 1 }} />
      </div>
      <p style={{ fontSize: 13.5, color: 'var(--text-faint)', lineHeight: 1.5, margin: '0 0 12px' }}>
        Utilisé pour te contacter et partagé avec les organisateurs/prestataires avec qui tu échanges en messagerie.
      </p>
      <Button onClick={savePhone} disabled={phoneSaving || !phoneChanged} loading={phoneSaving} loadingText="Enregistrement…" variant="primary" style={goldButtonStyle}>
        Enregistrer le téléphone
      </Button>
      {phoneMsg && <Toast text={phoneMsg.text} kind={phoneMsg.kind} />}

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }} />

      <div className="profile-demo-row" style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <Select
          aria-label="Année de naissance"
          value={birthYear}
          onChange={setBirthYear}
          placeholder="Année de naissance —"
          options={yearOptions.map((y) => ({ value: String(y), label: String(y) }))}
        />
        <Select
          aria-label="Genre"
          value={gender}
          onChange={setGender}
          placeholder="Genre —"
          options={[
            { value: 'femme', label: 'Femme' },
            { value: 'homme', label: 'Homme' },
            { value: 'autre', label: 'Autre' },
          ]}
        />
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--text-faint)', lineHeight: 1.5, margin: '0 0 12px' }}>
        Optionnel — sert uniquement aux statistiques anonymes des organisateurs. Jamais affiché sur ton profil, jamais utilisé comme contrôle d&apos;âge.
      </p>
      <Button onClick={saveDemographics} disabled={demoSaving || demoUnchanged} loading={demoSaving} loadingText="Enregistrement…" variant="primary" style={goldButtonStyle}>
        Enregistrer ces infos
      </Button>
      {demoMsg && <Toast text={demoMsg.text} kind={demoMsg.kind} />}
    </Card>
  )
}

function VisibilityCard({ user }: { user: ProfilUser }) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Toi'
  return (
    <Card>
      <EyebrowLabel>Qui voit quoi ?</EyebrowLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <p style={{ fontSize: 13, color: '#fff', margin: 0, fontWeight: 600 }}>{name}</p>
            <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '2px 0 0' }}>Nom du compte</p>
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', textAlign: 'right', maxWidth: 190, margin: 0 }}>Conversations, demandes d&apos;amis, guestlists, équipes de soirée, billets.</p>
        </div>
      </div>
    </Card>
  )
}

function PreferencesCard({ user, setUser }: { user: ProfilUser; setUser: (u: ProfilUser) => void }) {
  const [open, setOpen] = useState(false)
  const tags = summarizePreferences(user.preferences)
  const shown = tags.slice(0, 10)
  const overflow = tags.length - shown.length

  return (
    <Card>
      <EyebrowLabel>Mes goûts — recommandations</EyebrowLabel>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, margin: '0 0 14px' }}>
        Optionnel. Sert uniquement à te proposer les bonnes soirées sur l&apos;accueil (« Nos recommandations pour toi »). Jamais partagé avec les organisateurs.
      </p>
      {tags.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {shown.map((t, i) => (
            <Badge key={i} tone="violet">
              {t}
            </Badge>
          ))}
          {overflow > 0 && <Badge tone="neutral">+{overflow}</Badge>}
        </div>
      ) : (
        <p style={{ fontSize: 12.5, color: 'var(--text-faint)', margin: '0 0 14px' }}>Tu n&apos;as pas encore renseigné tes goûts.</p>
      )}
      <Button onClick={() => setOpen(true)} variant="primary" style={goldButtonStyle}>
        {tags.length > 0 ? 'Modifier mes goûts' : 'Renseigner mes goûts'}
      </Button>
      {open && (
        <PreferencesModal
          open={open}
          onClose={() => setOpen(false)}
          initialPreferences={user.preferences}
          onSaved={(next) => setUser({ ...user, preferences: next })}
        />
      )}
    </Card>
  )
}

function PrivacyToggle({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 0' }}>
      <div style={{ maxWidth: 260 }}>
        <p style={{ fontSize: 13, color: '#fff', margin: '0 0 2px', fontWeight: 600 }}>{label}</p>
        <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: 0, lineHeight: 1.4 }}>{hint}</p>
      </div>
      <Switch checked={value} onChange={(e) => onChange(e.target.checked)} />
    </div>
  )
}

function PrivacyCard({ user, setUser }: { user: ProfilUser; setUser: (u: ProfilUser) => void }) {
  async function toggle(key: keyof ProfilUser['privacy'], value: boolean) {
    setUser({ ...user, privacy: { ...user.privacy, [key]: value } })
    try {
      await fetch('/api/profil/confidentialite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [key]: value }) })
    } catch {
      // Optimiste — cohérent avec le legacy (aucun rollback UI sur échec
      // réseau ponctuel d'un simple toggle).
    }
    if (key === 'personalizedRecommendations' && !value) {
      try {
        localStorage.removeItem(`lib_reco_views_${user.id}`)
      } catch {
        // Navigation privée / storage indisponible — sans conséquence, il
        // n'y avait probablement rien à effacer.
      }
    }
  }

  return (
    <Card>
      <EyebrowLabel>Confidentialité</EyebrowLabel>
      <PrivacyToggle label="Statut en ligne" hint="Les autres voient quand tu es connecté·e." value={user.privacy.showOnline} onChange={(v) => toggle('showOnline', v)} />
      <PrivacyToggle label="Photo de profil" hint="Les autres voient ta photo (sinon : initiales)." value={user.privacy.showAvatar} onChange={(v) => toggle('showAvatar', v)} />
      <PrivacyToggle
        label="Confirmations de lecture"
        hint="Si désactivé, tu ne sais pas si on a lu tes messages — et personne ne sait si tu as lu les leurs."
        value={user.privacy.readReceipts}
        onChange={(v) => toggle('readReceipts', v)}
      />
      <PrivacyToggle
        label="Recommandations personnalisées"
        hint="Utilise tes goûts et ton activité pour te proposer des soirées. Rien n'est partagé avec les organisateurs. Désactive pour un accueil neutre."
        value={user.privacy.personalizedRecommendations}
        onChange={(v) => toggle('personalizedRecommendations', v)}
      />
    </Card>
  )
}

// ────────────────────────────────── DataExportCard ───────────────────────────
// Art. 15 (droit d'accès) + Art. 20 (droit à la portabilité) RGPD —
// "Télécharger mes données" self-service, voir app/api/profil/export/route.ts
// + lib/server/dataExport.ts pour la portée exacte de l'export.

function DataExportCard() {
  const [downloading, setDownloading] = useState(false)
  const [msg, setMsg] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null)

  async function download() {
    setDownloading(true)
    setMsg(null)
    try {
      const res = await fetch('/api/profil/export')
      if (!res.ok) {
        setMsg({ text: 'Téléchargement impossible, réessaie.', kind: 'err' })
        return
      }
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') || ''
      const match = disposition.match(/filename="([^"]+)"/)
      const filename = match?.[1] || 'liveinblack-mes-donnees.json'

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setMsg({ text: 'Téléchargement lancé.', kind: 'ok' })
      setTimeout(() => setMsg(null), 3000)
    } catch {
      setMsg({ text: 'Téléchargement impossible, réessaie.', kind: 'err' })
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Card>
      <EyebrowLabel>Mes données</EyebrowLabel>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, margin: '0 0 14px' }}>
        Télécharge une copie de toutes les données personnelles associées à ton compte (profil, billets, commandes,
        messages que tu as envoyés, amis, avis, événements suivis…) au format JSON — droit d&apos;accès et droit à la
        portabilité (articles 15 et 20 du RGPD).
      </p>
      <Button onClick={download} disabled={downloading} loading={downloading} loadingText="Préparation…" variant="primary" style={goldButtonStyle}>
        Télécharger mes données
      </Button>
      {msg && <Toast text={msg.text} kind={msg.kind} />}
    </Card>
  )
}

function EmailCard({ user, setUser }: { user: ProfilUser; setUser: (u: ProfilUser) => void }) {
  const [newEmail, setNewEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [confirmCancelRequest, setConfirmCancelRequest] = useState(false)

  async function submit() {
    setMsg(null)
    const email = newEmail.trim().toLowerCase()
    if (!email || !email.includes('@')) return setMsg({ text: 'Adresse e-mail invalide', kind: 'err' })
    if (email === user.email) return setMsg({ text: "C'est déjà ton adresse e-mail actuelle", kind: 'err' })
    if (!currentPassword) return setMsg({ text: 'Saisis ton mot de passe actuel pour confirmer', kind: 'err' })

    setSaving(true)
    try {
      const res = await fetch('/api/profil/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newEmail: email, currentPassword }) })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setMsg({ text: errorMessage(data.error), kind: 'err' })
      } else {
        setUser({ ...user, pendingEmail: data.pendingEmail })
        setNewEmail('')
        setCurrentPassword('')
        setMsg({ text: `Un lien de vérification a été envoyé à ${data.pendingEmail}. Clique dessus pour confirmer le changement.`, kind: 'ok' })
      }
    } catch {
      setMsg({ text: 'Une erreur est survenue, réessaie', kind: 'err' })
    } finally {
      setSaving(false)
    }
  }

  async function cancelRequest() {
    setCancelling(true)
    try {
      await fetch('/api/profil/email', { method: 'DELETE' })
      setUser({ ...user, pendingEmail: null })
    } finally {
      setCancelling(false)
    }
  }

  return (
    <Card>
      <EyebrowLabel>Adresse e-mail</EyebrowLabel>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'var(--surface-2)', marginBottom: 14 }}>
        <span style={{ fontSize: 13, color: '#fff', flex: 1 }}>{user.email}</span>
        <Badge tone="teal">Actuel</Badge>
      </div>

      {user.pendingEmail ? (
        <div style={{ padding: 14, borderRadius: 10, background: 'var(--primary-a08)', border: '1px solid var(--primary-a24)' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', margin: '0 0 4px' }}>Vérification en attente</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 10px', lineHeight: 1.5 }}>
            Un lien a été envoyé à {user.pendingEmail}. Ouvre-le pour confirmer le changement.
          </p>
          <Button onClick={() => setConfirmCancelRequest(true)} disabled={cancelling} variant="link" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            Annuler la demande
          </Button>
        </div>
      ) : (
        <>
          <Label>Nouvelle adresse e-mail</Label>
          <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} type="email" style={{ marginBottom: 10 }} />
          <Label>Mot de passe actuel (requis)</Label>
          <PasswordField value={currentPassword} onChange={setCurrentPassword} placeholder="Mot de passe actuel" style={{ marginBottom: 12 }} />
          <Button onClick={submit} disabled={saving || !newEmail || !currentPassword} loading={saving} loadingText="Envoi…" variant="primary" style={goldButtonStyle}>
            Envoyer le lien de vérification
          </Button>
        </>
      )}
      <ConfirmDialog
        open={confirmCancelRequest}
        title="Annuler la demande ?"
        body="Le changement d’adresse e-mail en attente sera abandonné."
        confirmLabel={cancelling ? 'Annulation…' : 'Annuler la demande'}
        confirmVariant="primary"
        confirmDisabled={cancelling}
        confirmLoading={cancelling}
        confirmLoadingText="Annulation…"
        onCancel={() => setConfirmCancelRequest(false)}
        onConfirm={() => {
          setConfirmCancelRequest(false)
          void cancelRequest()
        }}
      />
      {msg && <Toast text={msg.text} kind={msg.kind} />}
    </Card>
  )
}

function PasswordCard({ email }: { email: string }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null)
  const [resetSending, setResetSending] = useState(false)

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword
  const strength = newPassword.length > 0 ? getPasswordStrength(newPassword) : null

  async function submit() {
    setMsg(null)
    if (!currentPassword) return setMsg({ text: 'Saisis ton mot de passe actuel', kind: 'err' })
    const policyErrors = getPasswordPolicyErrors(newPassword)
    if (policyErrors.length > 0) return setMsg({ text: policyErrors[0], kind: 'err' })
    if (newPassword !== confirmPassword) return setMsg({ text: 'Les mots de passe ne correspondent pas', kind: 'err' })
    if (newPassword === currentPassword) return setMsg({ text: "Le nouveau mot de passe doit être différent de l'actuel", kind: 'err' })

    setSaving(true)
    try {
      const res = await fetch('/api/profil/mot-de-passe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword, newPassword }) })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setMsg({ text: errorMessage(data.error), kind: 'err' })
      } else {
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        setMsg({ text: 'Mot de passe mis à jour avec succès', kind: 'ok' })
        setTimeout(() => setMsg(null), 4000)
      }
    } catch {
      setMsg({ text: 'Une erreur est survenue, réessaie', kind: 'err' })
    } finally {
      setSaving(false)
    }
  }

  async function sendReset() {
    setResetSending(true)
    try {
      const res = await fetch('/api/auth/request-password-reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
      if (res.ok) {
        setMsg({ text: `E-mail de réinitialisation envoyé à ${email}`, kind: 'ok' })
        setTimeout(() => setMsg(null), 6000)
      }
    } finally {
      setResetSending(false)
    }
  }

  return (
    <Card>
      <EyebrowLabel>Sécurité — Mot de passe</EyebrowLabel>
      <PasswordField value={currentPassword} onChange={setCurrentPassword} placeholder="Mot de passe actuel" style={{ marginBottom: 10 }} />
      <PasswordField value={newPassword} onChange={setNewPassword} placeholder="8 caractères, 1 majuscule, 1 chiffre" style={{ marginBottom: strength ? 6 : 10 }} />
      {strength && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ height: 3, borderRadius: 999, background: 'rgba(255,255,255,0.1)', overflow: 'hidden', marginBottom: 4 }}>
            <div style={{ height: '100%', width: `${strength.pct}%`, background: strength.color }} />
          </div>
          <span style={{ fontSize: 10.5, color: strength.color, fontWeight: 700 }}>FORCE : {strength.label}</span>
        </div>
      )}
      <PasswordField
        value={confirmPassword}
        onChange={setConfirmPassword}
        placeholder="Confirmer le nouveau mot de passe"
        style={{ marginBottom: 12, border: mismatch ? '1px solid #ff7b7b' : undefined }}
      />
      <Button onClick={submit} disabled={saving || !currentPassword || !newPassword || !confirmPassword} loading={saving} loadingText="Mise à jour…" variant="primary" style={goldButtonStyle}>
        Mettre à jour le mot de passe
      </Button>
      {msg && <Toast text={msg.text} kind={msg.kind} />}
      <div style={{ marginTop: 14 }}>
        <Button onClick={sendReset} disabled={resetSending} variant="link" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          Mot de passe oublié ? Recevoir un lien de réinitialisation
        </Button>
      </div>
    </Card>
  )
}

function DangerZoneCard() {
  const router = useRouter()
  const [showConfirm, setShowConfirm] = useState(false)
  const [password, setPassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingSubmitted, setPendingSubmitted] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch('/api/profil/supprimer-compte', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: password }) })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(errorMessage(data.error))
        setDeleting(false)
        return
      }
      if (data.pending) {
        // Organisateur/prestataire avec un dossier approuvé : la demande part
        // en revue agent (app/api/profil/supprimer-compte/route.ts), le
        // compte reste actif et connecté en attendant la réponse.
        setDeleting(false)
        setShowConfirm(false)
        setPassword('')
        setPendingSubmitted(true)
        return
      }
      await signOut({ redirect: false })
      router.push('/home')
    } catch {
      setError('Une erreur est survenue, réessaie')
      setDeleting(false)
    }
  }

  return (
    <Card>
      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '0 0 16px' }} />
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>Zone de danger</p>

      {pendingSubmitted ? (
        <div style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(224,90,170,0.35)', background: 'rgba(224,90,170,0.08)' }}>
          <p style={{ fontSize: 13, color: '#fff', fontWeight: 700, margin: '0 0 4px' }}>Demande de suppression envoyée</p>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
            Ta demande de suppression a été transmise à l&apos;équipe LIVEINBLACK. Ton compte reste actif en attendant sa validation.
          </p>
        </div>
      ) : (
        <Button
          onClick={() => setShowConfirm(true)}
          variant="secondary"
          style={{ padding: '11px 18px', borderRadius: 7, border: '1px solid rgba(255,107,0,0.4)', background: 'transparent', color: 'var(--pink)', fontSize: 13 }}
        >
          Supprimer mon compte
        </Button>
      )}

      <ConfirmDialog
        open={showConfirm}
        title="Supprimer mon compte"
        body={
          <>
            Cette action est <strong style={{ color: 'var(--pink)' }}>irréversible</strong>. Ton compte, tes billets et ton solde ne seront plus accessibles. Si tu es organisateur ou prestataire avec un dossier validé, ta demande sera d&apos;abord transmise à l&apos;équipe pour revue.
          </>
        }
        confirmLabel={deleting ? 'Suppression…' : 'Supprimer'}
        confirmDisabled={deleting || !password}
        confirmLoading={deleting}
        confirmLoadingText="Suppression…"
        onCancel={() => setShowConfirm(false)}
        onConfirm={() => { void handleDelete() }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Label>Confirme avec ton mot de passe</Label>
          <PasswordField value={password} onChange={setPassword} placeholder="Mot de passe" autoFocus />
          {error ? <p style={{ fontSize: 12, color: '#ff7b7b', margin: 0 }}>{error}</p> : null}
        </div>
      </ConfirmDialog>
    </Card>
  )
}

// ────────────────────────────────── SupportPanel ─────────────────────────────

const FAQ = [
  { q: 'Comment réserver un billet ?', a: 'Va sur l’onglet Événements, sélectionne la soirée de ton choix et clique sur Réservation. Choisis ton type de place et confirme.' },
  { q: 'Puis-je annuler ma réservation ?', a: 'Les réservations sont fermes et définitives. En cas d’annulation d’événement par l’organisateur, un remboursement sera traité sous 5 jours ouvrés.' },
  { q: 'Comment utiliser mes points ?', a: 'Tu gagnes 1 point par ticket ou carré acheté. Les points seront bientôt échangeables contre des avantages exclusifs (accès prioritaire, réductions, cadeaux).' },
  { q: 'Comment créer un événement ?', a: "Rends-toi dans 'Mes Événements' via le menu. Tu peux créer et publier ton événement en 5 étapes simples." },
]

export function SupportPanel() {
  const [copied, setCopied] = useState(false)

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL)
    } catch {
      try {
        const el = document.createElement('textarea')
        el.value = SUPPORT_EMAIL
        document.body.appendChild(el)
        el.select()
        document.execCommand('copy')
        el.remove()
      } catch {
        // Presse-papiers totalement indisponible — l'adresse reste affichée
        // en clair juste en dessous du bouton, donc copiable manuellement.
      }
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2200)
  }

  return (
    <main className="lb-dashboard-page lb-dashboard-page--medium">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Link href="/profile" style={{ minHeight: 40, display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textDecoration: 'none' }}>
          <ArrowLeft size={17} aria-hidden="true" />
          Profil
        </Link>

        <header style={{ marginBottom: 10 }}>
          <h1 style={{ margin: 0, color: '#f5f5f7', fontSize: 'clamp(24px,3vw,32px)', fontWeight: 720, letterSpacing: '-.045em' }}>Aide & FAQ</h1>
          <p style={{ maxWidth: 620, margin: '7px 0 0', color: 'rgba(245,245,247,.62)', fontSize: 12.5, lineHeight: 1.4 }}>Trouve rapidement une réponse ou contacte directement l’équipe LIVEINBLACK.</p>
        </header>

        <div className={helpStyles.grid}>
          <Card className={helpStyles.faq}>
            <h2 className={helpStyles.faqTitle}>Questions fréquentes</h2>
            <Accordion items={FAQ.map((f) => ({ question: f.q, answer: f.a }))} />
          </Card>

          <Card className={helpStyles.contact}>
            <h2>Besoin d’une réponse humaine ?</h2>
            <p>Écris-nous et notre équipe te répondra généralement sous 24 heures.</p>
            <Button onClick={copyEmail} variant="primary" fullWidth>
              {copied ? 'Adresse copiée' : "Copier l'adresse e-mail"}
            </Button>
            <span className={helpStyles.email}>{SUPPORT_EMAIL}</span>
            <a href={`mailto:${SUPPORT_EMAIL}?subject=Support%20LIVEINBLACK`} className={helpStyles.mailLink}>
              Ouvrir mon application mail →
            </a>
          </Card>
        </div>
      </div>
    </main>
  )
}
