'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import TicketWalletPanel, { type TicketWalletGroupView } from './TicketWallet'
import PreferencesModal, { summarizePreferences, type Preferences } from './PreferencesWizard'
import { getPasswordStrength } from '@/lib/shared/ticketExtras'

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
  invalid_password: 'Mot de passe actuel incorrect',
  invalid_email: 'Adresse e-mail invalide',
  same_email: "C'est déjà ton adresse e-mail actuelle",
  email_taken: 'Cette adresse e-mail est déjà utilisée',
  password_too_short: 'Le nouveau mot de passe doit faire au moins 8 caractères',
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

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: '#fff', fontSize: 14, outline: 'none' }
const primaryBtn = (disabled: boolean): React.CSSProperties => ({
  padding: '11px 20px',
  borderRadius: 10,
  border: 'none',
  background: disabled ? 'rgba(200,169,110,0.3)' : 'linear-gradient(180deg,#d8bd8a,#c8a96e)',
  color: '#1a1508',
  fontWeight: 700,
  fontSize: 13.5,
  cursor: disabled ? 'default' : 'pointer',
})

type Panel = null | 'settings' | 'billets' | 'support'

const ROLE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  client: { label: 'Client', color: '#4ee8c8', bg: 'rgba(78,232,200,0.10)' },
  prestataire: { label: 'Prestataire', color: '#8b5cf6', bg: 'rgba(139,92,246,0.10)' },
  organisateur: { label: 'Organisateur', color: '#4ee8c8', bg: 'rgba(78,232,200,0.10)' },
  agent: { label: 'Agent', color: '#c8a96e', bg: 'rgba(200,169,110,0.10)' },
}

export default function ProfilClient({ initialUser, initialTicketGroups }: { initialUser: ProfilUser; initialTicketGroups: TicketWalletGroupView[] }) {
  const [panel, setPanel] = useState<Panel>(null)
  const [user, setUser] = useState<ProfilUser>(initialUser)

  if (panel === 'billets') return <TicketWalletPanel groups={initialTicketGroups} currentUserId={user.id} onBack={() => setPanel(null)} />
  if (panel === 'settings') return <SettingsPanel user={user} setUser={setUser} onBack={() => setPanel(null)} />
  if (panel === 'support') return <SupportPanel onBack={() => setPanel(null)} />

  return <MainView user={user} setUser={setUser} onOpenPanel={setPanel} />
}

function MainView({ user, setUser, onOpenPanel }: { user: ProfilUser; setUser: (u: ProfilUser) => void; onOpenPanel: (p: Panel) => void }) {
  const router = useRouter()
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const roleInfo = ROLE_LABELS[user.role]
  const isClient = user.role === 'client'
  const isOrganizer = user.role === 'organisateur'

  async function confirmLogout() {
    setLoggingOut(true)
    await signOut({ redirect: false })
    router.push('/')
  }

  return (
    <main style={{ minHeight: '100vh', padding: '28px 16px 48px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <AvatarUpload user={user} setUser={setUser} />
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#fff', margin: 0, textAlign: 'center' }}>{[user.firstName, user.lastName].filter(Boolean).join(' ') || 'Toi'}</h2>
          <p style={{ fontSize: 12, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>{user.email}</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            {roleInfo && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 11px', borderRadius: 999, color: roleInfo.color, background: roleInfo.bg }}>{roleInfo.label}</span>
            )}
            {!isOrganizer && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 11px', borderRadius: 999, color: 'var(--gold)', background: 'rgba(200,169,110,0.12)' }}>{user.points || 0} pts</span>
            )}
          </div>
        </div>

        {!isOrganizer && (
          <div style={cardStyle}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Système de points</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
              Tu gagnes <strong style={{ color: '#fff' }}>1 point</strong> pour chaque ticket ou carré acheté. Les points seront bientôt échangeables contre des avantages exclusifs.
            </p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {isClient && <MenuRow label="Mes billets" onClick={() => onOpenPanel('billets')} />}
          <MenuRow label="Événements intéressés" onClick={() => router.push('/profile/interested-events')} />
          <MenuRow label="Organisateurs suivis" onClick={() => router.push('/profile/followed-organizers')} />
          <MenuRow label="Paramètres du compte" onClick={() => onOpenPanel('settings')} />
          <MenuRow label="Support / Aide" onClick={() => onOpenPanel('support')} />
        </div>

        <button
          onClick={() => setShowLogoutConfirm(true)}
          style={{ padding: '13px 0', borderRadius: 12, border: '1px solid rgba(224,90,170,0.4)', background: 'transparent', color: '#e05aaa', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
        >
          Se déconnecter
        </button>
      </div>

      {showLogoutConfirm && (
        <ConfirmModal
          title="Se déconnecter ?"
          body="Tu devras te reconnecter pour accéder à ton compte."
          confirmLabel={loggingOut ? 'Déconnexion…' : 'Déconnecter'}
          confirmDisabled={loggingOut}
          onCancel={() => setShowLogoutConfirm(false)}
          onConfirm={confirmLogout}
        />
      )}
    </main>
  )
}

function MenuRow({ label, onClick, gold }: { label: string; onClick: () => void; gold?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '15px 16px',
        borderRadius: 12,
        border: `1px solid ${gold ? 'rgba(200,169,110,0.25)' : 'var(--border)'}`,
        background: gold ? 'rgba(200,169,110,0.06)' : 'var(--surface)',
        color: '#fff',
        fontSize: 13.5,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.02em',
        cursor: 'pointer',
        width: '100%',
      }}
    >
      {label}
      <span style={{ color: 'var(--text-faint)', fontSize: 16 }}>›</span>
    </button>
  )
}

function ConfirmModal({
  title,
  body,
  confirmLabel,
  confirmDisabled,
  danger = true,
  onCancel,
  onConfirm,
  children,
}: {
  title: string
  body: React.ReactNode
  confirmLabel: string
  confirmDisabled?: boolean
  danger?: boolean
  onCancel: () => void
  onConfirm: () => void
  children?: React.ReactNode
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(3,4,8,0.72)', backdropFilter: 'blur(8px)' }} onClick={onCancel} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 380, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 18, padding: 24 }}>
        <h3 style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>{title}</h3>
        <p style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.5, margin: '0 0 16px' }}>{body}</p>
        {children}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'transparent', color: '#fff', fontSize: 13.5, cursor: 'pointer' }}>
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={confirmDisabled}
            style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: 'none', background: danger ? '#c2347f' : 'var(--teal-solid)', color: danger ? '#fff' : '#04120e', fontSize: 13.5, fontWeight: 700, cursor: confirmDisabled ? 'default' : 'pointer', opacity: confirmDisabled ? 0.6 : 1 }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
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
      <div
        onClick={() => fileInputRef.current?.click()}
        style={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          background: user.avatarUrl ? `url(${user.avatarUrl}) center/cover` : 'rgba(200,169,110,0.18)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          fontSize: 28,
          fontWeight: 800,
          color: 'var(--gold)',
          position: 'relative',
        }}
      >
        {!user.avatarUrl && initial}
      </div>

      {cropSrc && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(3,4,8,0.85)' }} />
          <div style={{ position: 'relative', width: '100%', maxWidth: 340, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 18, padding: 20, textAlign: 'center' }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: '#fff', margin: '0 0 4px' }}>Recadrer la photo</h3>
            <p style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', margin: '0 0 16px' }}>Glisse pour repositionner</p>
            <div
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
              style={{ width: PREVIEW, height: PREVIEW, borderRadius: '50%', overflow: 'hidden', margin: '0 auto 16px', position: 'relative', background: '#000', cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' }}
            >
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
            <input type="range" min={0.8} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--gold)', marginBottom: 18 }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setCropSrc(null)} style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'transparent', color: '#fff', cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={saveAvatar} disabled={saving} style={primaryBtn(saving)}>
                {saving ? 'Enregistrement…' : 'Valider'}
              </button>
            </div>
          </div>
        </div>
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

function normalizeQuery(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

function SettingsPanel({ user, setUser, onBack }: { user: ProfilUser; setUser: (u: ProfilUser) => void; onBack: () => void }) {
  const [query, setQuery] = useState('')

  const entries: SettingEntry[] = useMemo(
    () => [
      { id: 'identite', keywords: ['nom', 'prenom', 'identite', 'demographie', 'age', 'genre'], render: (ctx) => <IdentityCard {...ctx} /> },
      { id: 'goûts', keywords: ['gouts', 'preferences', 'recommandations', 'musique', 'artiste'], render: (ctx) => <PreferencesCard {...ctx} /> },
      { id: 'visibilite', keywords: ['qui voit quoi', 'visibilite', 'confidentialite'], render: (ctx) => <VisibilityCard {...ctx} /> },
      { id: 'confidentialite', keywords: ['confidentialite', 'prive', 'en ligne', 'lecture', 'photo'], render: (ctx) => <PrivacyCard {...ctx} /> },
      { id: 'email', keywords: ['email', 'e-mail', 'mail', 'adresse'], render: (ctx) => <EmailCard {...ctx} /> },
      { id: 'mot de passe', keywords: ['mot de passe', 'password', 'securite'], render: (ctx) => <PasswordCard email={ctx.user.email} /> },
      { id: 'danger', keywords: ['supprimer', 'suppression', 'compte', 'danger'], render: () => <DangerZoneCard /> },
    ],
    []
  )

  const q = normalizeQuery(query)
  const tokens = q.split(/\s+/).filter(Boolean)
  const filtered = tokens.length === 0 ? entries : entries.filter((e) => tokens.every((t) => e.keywords.some((k) => normalizeQuery(k).includes(t)) || normalizeQuery(e.id).includes(t)))

  return (
    <main style={{ minHeight: '100vh', padding: '20px 16px 48px' }}>
      <div style={{ maxWidth: 520, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 22, cursor: 'pointer', padding: '4px 8px 4px 0' }} aria-label="Retour">
            ‹
          </button>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: '#fff' }}>Paramètres du compte</h1>
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un réglage — nom, e-mail, mot de passe…"
          style={inputStyle}
        />

        {filtered.length === 0 ? (
          <div style={{ ...cardStyle, textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: '#fff', margin: '0 0 6px' }}>Aucun réglage ne correspond à « {query} »</p>
            <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '0 0 12px' }}>Essaie « nom », « e-mail », « mot de passe », « confidentialité »…</p>
            <button onClick={() => setQuery('')} style={{ background: 'transparent', border: 'none', color: 'var(--teal)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
              Effacer la recherche
            </button>
          </div>
        ) : (
          filtered.map((entry) => <div key={entry.id}>{entry.render({ user, setUser })}</div>)
        )}
      </div>
    </main>
  )
}

function EyebrowLabel({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>{children}</p>
}

function Toast({ text, kind }: { text: string; kind: 'ok' | 'err' }) {
  return <p style={{ fontSize: 12.5, color: kind === 'ok' ? 'var(--teal)' : '#e05aaa', margin: '10px 0 0' }}>{text}</p>
}

function IdentityCard({ user, setUser }: { user: ProfilUser; setUser: (u: ProfilUser) => void }) {
  const [firstName, setFirstName] = useState(user.firstName)
  const [lastName, setLastName] = useState(user.lastName)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null)

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
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/profil/nom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firstName, lastName }) })
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
    <div style={cardStyle}>
      <EyebrowLabel>Informations personnelles</EyebrowLabel>
      <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Prénom / Nom</label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, opacity: onCooldown ? 0.5 : 1 }}>
        <input value={firstName} onChange={(e) => !onCooldown && setFirstName(e.target.value)} placeholder="Ton prénom" style={inputStyle} disabled={onCooldown} />
        <input value={lastName} onChange={(e) => !onCooldown && setLastName(e.target.value)} placeholder="Ton nom" style={inputStyle} disabled={onCooldown} />
      </div>
      {onCooldown && nextChangeDate && (
        <p style={{ fontSize: 12, color: 'var(--gold)', margin: '0 0 10px' }}>
          Prochain changement possible le {nextChangeDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      )}
      <button onClick={saveName} disabled={saving || !nameChanged || onCooldown} style={primaryBtn(saving || !nameChanged || onCooldown)}>
        {saving ? 'Enregistrement…' : 'Enregistrer le nom'}
      </button>
      {msg && <Toast text={msg.text} kind={msg.kind} />}

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }} />

      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <select value={birthYear} onChange={(e) => setBirthYear(e.target.value)} style={inputStyle}>
          <option value="">Année de naissance —</option>
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select value={gender} onChange={(e) => setGender(e.target.value)} style={inputStyle}>
          <option value="">Genre —</option>
          <option value="femme">Femme</option>
          <option value="homme">Homme</option>
          <option value="autre">Autre</option>
        </select>
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--text-faint)', lineHeight: 1.5, margin: '0 0 12px' }}>
        Optionnel — sert uniquement aux statistiques anonymes des organisateurs. Jamais affiché sur ton profil, jamais utilisé comme contrôle d&apos;âge.
      </p>
      <button onClick={saveDemographics} disabled={demoSaving || demoUnchanged} style={primaryBtn(demoSaving || demoUnchanged)}>
        {demoSaving ? 'Enregistrement…' : 'Enregistrer ces infos'}
      </button>
      {demoMsg && <Toast text={demoMsg.text} kind={demoMsg.kind} />}
    </div>
  )
}

function VisibilityCard({ user }: { user: ProfilUser }) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Toi'
  return (
    <div style={cardStyle}>
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
    </div>
  )
}

function PreferencesCard({ user, setUser }: { user: ProfilUser; setUser: (u: ProfilUser) => void }) {
  const [open, setOpen] = useState(false)
  const tags = summarizePreferences(user.preferences)
  const shown = tags.slice(0, 10)
  const overflow = tags.length - shown.length

  return (
    <div style={cardStyle}>
      <EyebrowLabel>Mes goûts — recommandations</EyebrowLabel>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, margin: '0 0 14px' }}>
        Optionnel. Sert uniquement à te proposer les bonnes soirées sur l&apos;accueil (« Nos recommandations pour toi »). Jamais partagé avec les organisateurs.
      </p>
      {tags.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {shown.map((t, i) => (
            <span key={i} style={{ fontSize: 11.5, fontWeight: 700, padding: '5px 11px', borderRadius: 999, background: 'rgba(139,92,246,0.14)', color: 'var(--violet)' }}>
              {t}
            </span>
          ))}
          {overflow > 0 && (
            <span style={{ fontSize: 11.5, fontWeight: 700, padding: '5px 11px', borderRadius: 999, background: 'rgba(255,255,255,0.06)', color: 'var(--text-faint)' }}>+{overflow}</span>
          )}
        </div>
      ) : (
        <p style={{ fontSize: 12.5, color: 'var(--text-faint)', margin: '0 0 14px' }}>Tu n&apos;as pas encore renseigné tes goûts.</p>
      )}
      <button onClick={() => setOpen(true)} style={primaryBtn(false)}>
        {tags.length > 0 ? 'Modifier mes goûts' : 'Renseigner mes goûts'}
      </button>
      <PreferencesModal
        open={open}
        onClose={() => setOpen(false)}
        initialPreferences={user.preferences}
        onSaved={(next) => setUser({ ...user, preferences: next })}
      />
    </div>
  )
}

function PrivacyToggle({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 0' }}>
      <div style={{ maxWidth: 260 }}>
        <p style={{ fontSize: 13, color: '#fff', margin: '0 0 2px', fontWeight: 600 }}>{label}</p>
        <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: 0, lineHeight: 1.4 }}>{hint}</p>
      </div>
      <button
        onClick={() => onChange(!value)}
        style={{ width: 42, height: 24, borderRadius: 999, border: 'none', background: value ? 'var(--teal-solid)' : 'rgba(255,255,255,0.14)', position: 'relative', cursor: 'pointer', flexShrink: 0 }}
        aria-pressed={value}
      >
        <span style={{ position: 'absolute', top: 3, left: value ? 21 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
      </button>
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
    <div style={cardStyle}>
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
    </div>
  )
}

function EmailCard({ user, setUser }: { user: ProfilUser; setUser: (u: ProfilUser) => void }) {
  const [newEmail, setNewEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null)
  const [cancelling, setCancelling] = useState(false)

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
    <div style={cardStyle}>
      <EyebrowLabel>Adresse e-mail</EyebrowLabel>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'var(--surface-2)', marginBottom: 14 }}>
        <span style={{ fontSize: 13, color: '#fff', flex: 1 }}>{user.email}</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--teal)', background: 'rgba(78,232,200,0.10)', padding: '3px 8px', borderRadius: 999 }}>Actuel</span>
      </div>

      {user.pendingEmail ? (
        <div style={{ padding: 14, borderRadius: 10, background: 'rgba(200,169,110,0.08)', border: '1px solid rgba(200,169,110,0.25)' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', margin: '0 0 4px' }}>Vérification en attente</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 10px', lineHeight: 1.5 }}>
            Un lien a été envoyé à {user.pendingEmail}. Ouvre-le pour confirmer le changement.
          </p>
          <button onClick={cancelRequest} disabled={cancelling} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 12, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>
            Annuler la demande
          </button>
        </div>
      ) : (
        <>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Nouvelle adresse e-mail</label>
          <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} type="email" style={{ ...inputStyle, marginBottom: 10 }} />
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Mot de passe actuel (requis)</label>
          <input value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} type="password" style={{ ...inputStyle, marginBottom: 12 }} />
          <button onClick={submit} disabled={saving || !newEmail || !currentPassword} style={primaryBtn(saving || !newEmail || !currentPassword)}>
            {saving ? 'Envoi…' : 'Envoyer le lien de vérification'}
          </button>
        </>
      )}
      {msg && <Toast text={msg.text} kind={msg.kind} />}
    </div>
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
    if (newPassword.length < 8) return setMsg({ text: 'Le nouveau mot de passe doit faire au moins 8 caractères', kind: 'err' })
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
    <div style={cardStyle}>
      <EyebrowLabel>Sécurité — Mot de passe</EyebrowLabel>
      <input value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} type="password" placeholder="Mot de passe actuel" style={{ ...inputStyle, marginBottom: 10 }} />
      <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" placeholder="Minimum 8 caractères" style={{ ...inputStyle, marginBottom: strength ? 6 : 10 }} />
      {strength && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ height: 3, borderRadius: 999, background: 'rgba(255,255,255,0.1)', overflow: 'hidden', marginBottom: 4 }}>
            <div style={{ height: '100%', width: `${strength.pct}%`, background: strength.color }} />
          </div>
          <span style={{ fontSize: 10.5, color: strength.color, fontWeight: 700 }}>FORCE : {strength.label}</span>
        </div>
      )}
      <input
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        type="password"
        placeholder="Confirmer le nouveau mot de passe"
        style={{ ...inputStyle, marginBottom: 12, border: mismatch ? '1px solid #e05aaa' : inputStyle.border }}
      />
      <button onClick={submit} disabled={saving || !currentPassword || !newPassword || !confirmPassword} style={primaryBtn(saving || !currentPassword || !newPassword || !confirmPassword)}>
        {saving ? 'Mise à jour…' : 'Mettre à jour le mot de passe'}
      </button>
      {msg && <Toast text={msg.text} kind={msg.kind} />}
      <div style={{ marginTop: 14 }}>
        <button onClick={sendReset} disabled={resetSending} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 12, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>
          Mot de passe oublié ? Recevoir un lien de réinitialisation
        </button>
      </div>
    </div>
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
    <div style={cardStyle}>
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
        <button
          onClick={() => setShowConfirm(true)}
          style={{ padding: '11px 18px', borderRadius: 10, border: '1px solid rgba(224,90,170,0.4)', background: 'transparent', color: '#e05aaa', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
        >
          Supprimer mon compte
        </button>
      )}

      {showConfirm && (
        <ConfirmModal
          title="Supprimer mon compte"
          body={
            <>
              Cette action est <strong style={{ color: '#e05aaa' }}>irréversible</strong>. Ton compte, tes billets et ton solde ne seront plus accessibles. Si tu es organisateur ou prestataire avec un dossier validé, ta demande sera d&apos;abord transmise à l&apos;équipe pour revue.
            </>
          }
          confirmLabel={deleting ? 'Suppression…' : 'Supprimer'}
          confirmDisabled={deleting || !password}
          onCancel={() => setShowConfirm(false)}
          onConfirm={handleDelete}
        >
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', margin: '0 0 6px' }}>Confirme avec ton mot de passe</label>
          <input autoFocus type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
          {error && <p style={{ fontSize: 12, color: '#e05aaa', margin: '8px 0 0' }}>{error}</p>}
        </ConfirmModal>
      )}
    </div>
  )
}

// ────────────────────────────────── SupportPanel ─────────────────────────────

const FAQ = [
  { q: 'Comment réserver un billet ?', a: 'Va sur l’onglet Événements, sélectionne la soirée de ton choix et clique sur Réservation. Choisis ton type de place et confirme.' },
  { q: 'Puis-je annuler ma réservation ?', a: 'Les réservations sont fermes et définitives. En cas d’annulation d’événement par l’organisateur, un remboursement sera traité sous 5 jours ouvrés.' },
  { q: 'Comment utiliser mes points ?', a: 'Tu gagnes 1 point par ticket ou carré acheté. Les points seront bientôt échangeables contre des avantages exclusifs (accès prioritaire, réductions, cadeaux).' },
  { q: 'Comment créer un événement ?', a: "Rends-toi dans 'Mes Événements & Créations' via le menu. Tu peux créer et publier ton événement en 5 étapes simples." },
]

function SupportPanel({ onBack }: { onBack: () => void }) {
  const [openFaq, setOpenFaq] = useState<number | null>(null)
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
    <main style={{ minHeight: '100vh', padding: '20px 16px 48px' }}>
      <div style={{ maxWidth: 520, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 22, cursor: 'pointer', padding: '4px 8px 4px 0' }} aria-label="Retour">
            ‹
          </button>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: '#fff' }}>Support / Aide</h1>
        </div>

        <div style={cardStyle}>
          <EyebrowLabel>Questions fréquentes</EyebrowLabel>
          {FAQ.map((f, i) => (
            <div key={i} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 0', background: 'none', border: 'none', color: '#fff', fontSize: 13.5, fontWeight: 600, textAlign: 'left', cursor: 'pointer' }}
              >
                {f.q}
                <span style={{ transform: openFaq === i ? 'rotate(180deg)' : 'none', transition: 'transform .2s', color: 'var(--text-faint)' }}>⌄</span>
              </button>
              {openFaq === i && <p style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 14px' }}>{f.a}</p>}
            </div>
          ))}
        </div>

        <div style={{ ...cardStyle, border: '1px solid rgba(200,169,110,0.25)' }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, margin: '0 0 14px' }}>Tu n&apos;as pas trouvé de réponse ? Écris-nous, on répond sous 24h.</p>
          <button onClick={copyEmail} style={{ ...primaryBtn(false), marginBottom: 10 }}>
            {copied ? 'Adresse copiée' : "Copier l'adresse e-mail"}
          </button>
          <p style={{ fontSize: 12.5, color: '#fff', margin: '0 0 10px' }}>{SUPPORT_EMAIL}</p>
          <a href={`mailto:${SUPPORT_EMAIL}?subject=Support%20LIVEINBLACK`} style={{ fontSize: 12, color: 'var(--teal)', textDecoration: 'none' }}>
            ou ouvrir mon application mail →
          </a>
        </div>
      </div>
    </main>
  )
}
