import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import PublicShell from '../components/PublicShell'
import { useAuth } from '../context/AuthContext'
import { regions } from '../data/regions'
import { DIAL_CODES } from '../data/dialCodes'
import { formatSiret, isValidSiret, isValidPhone } from '../utils/validation'
import {
  createApplication, saveDraft, submitApplication,
  uploadDocument, getApplicationById, getApplicationByUser,
  updateApplication, DOCUMENT_LABELS, getRequiredDocs,
  hasDoc, getDocFiles, removeDocumentFile,
} from '../utils/applications'
import {
  PROVIDER_CATEGORIES,
  getPrimaryProviderType,
  normalizeProviderTypes,
} from '../utils/providerCategories'

const DM = "Inter, sans-serif"
const CG = "Inter, sans-serif"
const GOLD = '#c8a96e'
const PURPLE = '#8b5cf6'

const S = {
  page:    { position: 'relative', zIndex: 1, padding: '32px 18px 16px', maxWidth: 600, margin: '0 auto' },
  card:    { background: 'rgba(10,12,22,0.6)', backdropFilter: 'blur(24px) saturate(1.4)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: '28px 26px', boxShadow: '0 24px 64px rgba(0,0,0,0.38)' },
  label:   { fontFamily: DM, fontSize: 13, fontWeight: 600, letterSpacing: '0.01em', color: 'rgba(255,255,255,0.62)', display: 'block', marginBottom: 8, overflowWrap: 'break-word', wordBreak: 'break-word' },
  input:   { width: '100%', background: 'rgba(6,8,16,0.85)', borderWidth: 1, borderStyle: 'solid', borderColor: 'rgba(255,255,255,0.14)', borderRadius: 13, fontFamily: DM, fontSize: 15.5, color: '#fff', padding: '15px 16px', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.18s' },
  select:  { width: '100%', background: 'rgba(6,8,16,0.85)', borderWidth: 1, borderStyle: 'solid', borderColor: 'rgba(255,255,255,0.14)', borderRadius: 13, fontFamily: DM, fontSize: 15.5, color: '#fff', padding: '15px 16px', outline: 'none', boxSizing: 'border-box', appearance: 'none' },
  section: { fontFamily: DM, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: 22, paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.08)', overflowWrap: 'break-word', wordBreak: 'break-word' },
  btnGold: { width: '100%', padding: '17px', background: 'linear-gradient(135deg,rgba(200,169,110,0.26),rgba(200,169,110,0.08))', border: '1px solid rgba(200,169,110,0.5)', borderRadius: 14, fontFamily: DM, fontSize: 15, fontWeight: 700, letterSpacing: '0.01em', color: GOLD, cursor: 'pointer' },
  btnGhost:{ width: '100%', padding: '17px', background: 'transparent', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 14, fontFamily: DM, fontSize: 15, fontWeight: 600, letterSpacing: '0.01em', color: 'rgba(255,255,255,0.55)', cursor: 'pointer' },
  error:   { fontFamily: DM, fontSize: 12, color: '#e05aaa', letterSpacing: '0.01em', marginTop: 6 },
}

const COUNTRY_CODES = DIAL_CODES

function PhoneInput({ codeField, numberField, formState, onUpdate, inputStyle, error, placeholder = '6 00 00 00 00' }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <select
        value={formState[codeField]}
        onChange={e => onUpdate(codeField, e.target.value)}
        style={{
          flexShrink: 0, width: 115,
          background: 'rgba(6,8,16,0.7)',
          border: `1px solid ${error ? '#e05aaa' : 'rgba(255,255,255,0.10)'}`,
          borderRadius: 4, fontFamily: DM, fontSize: 12,
          color: 'rgba(255,255,255,0.9)', padding: '10px 8px',
          outline: 'none', appearance: 'none', cursor: 'pointer',
        }}>
        {COUNTRY_CODES.map(c => (
          <option key={c.iso} value={c.code}>{c.flag} {c.name} {c.code}</option>
        ))}
      </select>
      <input
        type="tel"
        value={formState[numberField]}
        onChange={e => onUpdate(numberField, e.target.value)}
        placeholder={placeholder}
        style={{ ...inputStyle, flex: 1, borderColor: error ? '#e05aaa' : undefined }}
      />
    </div>
  )
}

const FLEXIBLE_TYPES = PROVIDER_CATEGORIES.map(category => ({
  key: category.id,
  label: category.singular,
  color: category.color,
  desc: category.description,
}))

const STEPS = [
  { label: 'Compte' },
  { label: 'Activités' },
  { label: 'Spécifique' },
  { label: 'Fonctionnement' },
  { label: 'Documents' },
  { label: 'Abonnement' },
]

const LAST_STEP = STEPS.length - 1

function savedStep(formData = {}) {
  const value = Number(formData._onboardingStep)
  return Number.isInteger(value) ? Math.min(Math.max(value, 0), LAST_STEP) : 0
}

// Icônes SVG (au lieu d'emojis) par type de prestataire — style ligne cohérent avec l'app
function TypeIcon({ type, size = 22 }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (type === 'artiste')  return <svg {...p}><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M19 10a7 7 0 0 1-14 0"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
  if (type === 'salle')    return <svg {...p}><path d="M3 21h18"/><path d="M5 21V8l7-4 7 4v13"/><path d="M9 21v-6h6v6"/><path d="M9 11h.01M15 11h.01"/></svg>
  if (type === 'materiel') return <svg {...p}><rect x="5" y="2" width="14" height="20" rx="2"/><circle cx="12" cy="14" r="4"/><circle cx="12" cy="6" r="1"/></svg>
  if (type === 'food')     return <svg {...p}><path d="M3 2v7c0 1.1.9 2 2 2h0a2 2 0 0 0 2-2V2M5 2v9M11 2v20M11 8c0-3 1.5-6 4-6s4 3 4 6-1.5 4-4 4"/></svg>
  if (type === 'photo_video') return <svg {...p}><rect x="3" y="6" width="18" height="13" rx="2"/><circle cx="12" cy="12.5" r="3.5"/><path d="M8 6l1.5-2h5L16 6"/></svg>
  if (type === 'decoration') return <svg {...p}><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z"/></svg>
  if (type === 'securite') return <svg {...p}><path d="M12 3l7 3v5c0 4.6-2.8 8.4-7 10-4.2-1.6-7-5.4-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg>
  if (type === 'transport') return <svg {...p}><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>
  if (type === 'staff') return <svg {...p}><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2"/><path d="M3 20c0-4 2.5-6 6-6s6 2 6 6M15 15c3 0 5 1.5 5 5"/></svg>
  if (type === 'communication') return <svg {...p}><path d="M3 11v2l11 4V7L3 11z"/><path d="M14 9l6-3v12l-6-3M6 14l1 6h4l-2-5"/></svg>
  if (type === 'bien_etre') return <svg {...p}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/></svg>
  return <svg {...p}><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>
}

const ANON_DRAFT_KEY = 'lib_anon_prest_draft_id'

function Field({ label, required, children }) {
  return (
    <div>
      <label style={S.label}>{label}{required && <span style={{ color: '#e05aaa' }}> *</span>}</label>
      {children}
    </div>
  )
}

function Toggle({ value, onChange, label }) {
  return (
    <button type="button" onClick={() => onChange(!value)} style={{
      display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0,
    }}>
      <div style={{ width: 36, height: 20, borderRadius: 99, position: 'relative', transition: 'background 0.2s', background: value ? 'rgba(78,232,200,0.6)' : 'rgba(255,255,255,0.1)', border: `1px solid ${value ? '#4ee8c8' : 'rgba(255,255,255,0.12)'}` }}>
        <div style={{ position: 'absolute', top: 2, left: value ? 18 : 2, width: 14, height: 14, borderRadius: '50%', background: value ? '#4ee8c8' : 'rgba(255,255,255,0.4)', transition: 'left 0.2s' }} />
      </div>
      <span style={{ fontFamily: DM, fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>{label}</span>
    </button>
  )
}

// ── Helper : nom d'affichage ──────────────────────────────────────────────────
function getDisplayName(f) {
  if (normalizeProviderTypes(f.prestataireTypes, f.prestataireType).includes('artiste') && f.nomScene?.trim()) return f.nomScene.trim()
  if (f.nomCommercial?.trim()) return f.nomCommercial.trim()
  return [f.prenom, f.nom].filter(Boolean).map(s => s.trim()).join(' ') || ''
}

function hydrateProviderForm(previous, incoming = {}) {
  const prestataireTypes = normalizeProviderTypes(incoming.prestataireTypes, incoming.prestataireType)
  return {
    ...previous,
    ...incoming,
    prestataireTypes,
    prestataireType: getPrimaryProviderType({ prestataireTypes }),
  }
}

// ── TarifBlock ────────────────────────────────────────────────────────────────
function TarifBlock({ f, update }) {
  return (
    <div style={{ marginTop: 8, padding: '14px', background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.14)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontFamily: DM, fontSize: 8, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(139,92,246,0.6)', margin: 0 }}>
        Tarifs indicatifs
      </p>
      <Toggle value={f.tarifDevis} onChange={v => update('tarifDevis', v)} label="Sur devis uniquement" />
      {!f.tarifDevis && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="À partir de (€)">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number"
                  min={0}
                  style={{ ...S.input, flex: 1 }}
                  value={f.tarifMin}
                  onChange={e => update('tarifMin', e.target.value)}
                  placeholder="ex: 200"
                />
                <span style={{ fontFamily: DM, fontSize: 11, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>€</span>
              </div>
            </Field>
            <Field label="Jusqu'à (€)">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number"
                  min={0}
                  style={{ ...S.input, flex: 1 }}
                  value={f.tarifMax}
                  onChange={e => update('tarifMax', e.target.value)}
                  placeholder="ex: 800"
                />
                <span style={{ fontFamily: DM, fontSize: 11, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>€</span>
              </div>
            </Field>
          </div>
          <Field label="Type de tarification">
            <select style={S.select} value={f.tarifType} onChange={e => update('tarifType', e.target.value)}>
              <option value="">Choisir...</option>
              <option value="soiree">Par soirée / événement</option>
              <option value="heure">Par heure</option>
              <option value="journee">Par journée</option>
              <option value="forfait">Au forfait</option>
              <option value="personne">Par personne</option>
            </select>
          </Field>
        </>
      )}
      <p style={{ fontFamily: DM, fontSize: 9, color: 'rgba(255,255,255,0.22)', margin: 0, letterSpacing: '0.04em', lineHeight: 1.6 }}>
        Ces tarifs sont indicatifs et seront affichés sur ton profil
      </p>
    </div>
  )
}

// ── Sélecteur multi-régions ───────────────────────────────────────────────────
const REGION_OPTIONS = [
  { id: 'international', name: 'International', flag: '🌍' },
  ...regions,
]

function RegionPicker({ value = [], onChange }) {
  function toggle(id) {
    const has = value.includes(id)
    if (id === 'international') {
      onChange(has ? [] : ['international'])
      return
    }
    const withoutInt = value.filter(r => r !== 'international')
    onChange(has ? withoutInt.filter(r => r !== id) : [...withoutInt, id])
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {REGION_OPTIONS.map(r => {
        const sel = value.includes(r.id)
        return (
          <button key={r.id} type="button" onClick={() => toggle(r.id)} style={{
            padding: '6px 14px', borderRadius: 20,
            border: `1px solid ${sel ? '#4ee8c8' : 'rgba(255,255,255,0.12)'}`,
            background: sel ? 'rgba(78,232,200,0.12)' : 'rgba(255,255,255,0.04)',
            color: sel ? '#4ee8c8' : 'rgba(255,255,255,0.4)',
            fontFamily: "Inter, sans-serif", fontSize: 11,
            cursor: 'pointer', letterSpacing: '0.03em', transition: 'all 0.15s',
          }}>
            {r.flag} {r.name}
          </button>
        )
      })}
    </div>
  )
}

export default function OnboardingPrestataire() {
  const { user, setUser } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [app, setApp] = useState(null)
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [candidateNote, setCandidateNote] = useState('')
  const [creatingAccount, setCreatingAccount] = useState(false)
  const [errors, setErrors] = useState({})
  const [uploadStatus, setUploadStatus] = useState({})
  const [toast, setToast] = useState(null)
  const [successScreen, setSuccessScreen] = useState(false)

  // Anonymous mode state
  const anonUidRef = useRef(null)
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regPasswordConfirm, setRegPasswordConfirm] = useState('')
  const [showPwd, setShowPwd] = useState(false)

  // ── Abonnement prestataire (9,99 €/mois) — dernière étape du dossier ──────────
  const [subActive, setSubActive] = useState(false)      // abonnement actif (source = webhook)
  const [subRedirecting, setSubRedirecting] = useState(false)
  const [subError, setSubError] = useState('')
  const [checkingSubReturn, setCheckingSubReturn] = useState(false)
  const [emailVerification, setEmailVerification] = useState('idle')
  const [authChecked, setAuthChecked] = useState(false)
  const checkedSubSessionRef = useRef('')

  const anonMode = !user

  const [f, setF] = useState({
    prestataireType: '',
    prestataireTypes: [],
    // Identité de la personne
    prenom: '', nom: '',
    telephoneCode: '+33', telephone: '',
    ville: '', pays: 'France',
    // Structure (nom commercial + SIRET — requis pour salle/mat/food, optionnel artiste)
    nomCommercial: '', nomScene: '', siret: '',
    // Activité
    zonesIntervention: [], description: '',
    specialitesLibre: '',
    // Artiste
    typeArtiste: '', styles: '', anneesExperience: '', statutFacturation: '',
    portfolio: '', instagram: '', besoinstechniques: '',
    // Salle
    adresseLieu: '', capaciteLieu: '', typeLieu: '', equipements: '',
    horairesAutorises: '', reglesDuLieu: '',
    // Matériel
    categoriesMateriel: '', inventaire: '', conditionsLocation: '', politiqueCaution: '',
    // Food
    typeActiviteFood: '', menuBase: '', alcoolFood: false, alcoolFoodAtteste: false,
    // Tarifs (tous types)
    tarifMin: '', tarifMax: '', tarifType: '', tarifDevis: false,
  })

  // Après un aller-retour Stripe, Firebase restaure sa session avant que la
  // session locale LIVEINBLACK ne soit forcément reconstruite. On réconcilie
  // les deux ici pour ne jamais revenir en mode anonyme ni perdre le brouillon.
  useEffect(() => {
    if (user) { setAuthChecked(true); return }
    let alive = true
    import('../firebase').then(async ({ USE_REAL_FIREBASE, auth, db }) => {
      if (!USE_REAL_FIREBASE || !auth?.currentUser) return
      const { doc, getDoc } = await import('firebase/firestore')
      const snap = await getDoc(doc(db, 'users', auth.currentUser.uid))
      if (!alive || !snap.exists()) return
      setUser({ ...snap.data(), uid: auth.currentUser.uid })
    }).catch(() => {}).finally(() => { if (alive) setAuthChecked(true) })
    return () => { alive = false }
  }, [user, setUser])

  useEffect(() => {
    let alive = true
    if (user) {
      // Local d'abord, Firestore ensuite : le retour Stripe reste fiable même
      // si le cache du navigateur a été vidé ou si le dossier vient d'un autre appareil.
      ;(async () => {
        const existing = getApplicationByUser(user.uid, 'prestataire')
          || await loadApplicationByUser(user.uid, 'prestataire')
        if (!alive) return
        if (existing) {
        setApp(existing)
        const fd = existing.formData || {}
        setF(prev => hydrateProviderForm(prev, fd))
        setStep(savedStep(fd))
        // Répare les comptes créés par l'ancien tunnel : ils étaient enregistrés
        // comme « client » avant le paiement, bien qu'un dossier prestataire leur
        // soit déjà rattaché.
        if (user.role !== 'prestataire' && fd.regEmail && existing.uid === user.uid) {
          const accountPatch = {
            role: 'prestataire', activeRole: 'prestataire', enabledRoles: ['prestataire'], status: 'draft',
          }
          setUser({ ...user, ...accountPatch })
          import('../utils/firestore-sync').then(({ syncDoc }) => {
            syncDoc(`users/${user.uid}`, accountPatch)
          }).catch(() => {})
        }
        if (['submitted', 'under_review', 'approved'].includes(existing.status)) {
          navigate('/mon-dossier')
        }
        } else {
          const created = createApplication(user.uid, user.email, user.name, 'prestataire')
          setApp(created)
          const prefill = location.state?.prefill
          if (prefill) setF(prev => hydrateProviderForm(prev, prefill))
        }
      })().catch(() => {})
    } else {
      if (!authChecked) return () => { alive = false }
      // Anonymous mode
      const savedId = localStorage.getItem(ANON_DRAFT_KEY)
      const existing = savedId ? getApplicationById(savedId) : null
      if (existing) {
        setApp(existing)
        const fd = existing.formData || {}
        setF(prev => hydrateProviderForm(prev, fd))
        setStep(savedStep(fd))
        if (fd.regEmail) setRegEmail(fd.regEmail)
        // Compte Firebase déjà créé (uid réel != id temporaire "anon-prest-…") :
        // restaurer la référence pour NE PAS retenter la création au rechargement
        // (sinon "email déjà associé").
        if (existing.uid && !String(existing.uid).startsWith('anon-')) {
          anonUidRef.current = existing.uid
        }
      } else {
        const tempId = 'anon-prest-' + Date.now()
        localStorage.setItem(ANON_DRAFT_KEY, tempId)
        const created = createApplication(tempId, '', '', 'prestataire')
        setApp(created)
      }
    }
    return () => { alive = false }
  }, [user, authChecked])

  // Statut d'abonnement en temps réel (users/{uid}.prestataireSubActive, écrit par
  // le webhook Stripe = source de vérité). Dispo une fois le compte créé.
  useEffect(() => {
    const uid = user?.uid
    if (!uid) return
    if (user.prestataireSubActive) setSubActive(true)
    let unsub = () => {}
    import('../utils/firestore-sync').then(({ listenDoc }) => {
      unsub = listenDoc(`users/${uid}`, data => setSubActive(!!data?.prestataireSubActive))
    }).catch(() => {})
    return () => { try { unsub() } catch {} }
  }, [user?.uid])

  // Retour de Stripe : vérification serveur immédiate de la session. Le webhook
  // reste la source de vérité pour les renouvellements, mais le retour utilisateur
  // n'attend plus sa latence et reprend toujours à la DERNIÈRE étape.
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const result = params.get('sub')
    if (!result || !user?.uid) return
    setStep(LAST_STEP)
    if (app?.id) saveDraft(app.id, { _onboardingStep: LAST_STEP })

    if (result === 'cancel') {
      setSubError('Paiement annulé. Ton dossier est conservé, tu peux reprendre quand tu veux.')
      navigate('/inscription-prestataire', { replace: true })
      return
    }
    if (result !== 'success') return

    const sessionId = params.get('session_id')
    if (!sessionId) {
      setSubError('Paiement reçu, mais la session est introuvable. Actualise la page dans quelques secondes.')
      return
    }
    if (checkedSubSessionRef.current === sessionId) return
    checkedSubSessionRef.current = sessionId

    let alive = true
    setCheckingSubReturn(true)
    import('../utils/apiAuth').then(async ({ authHeaders }) => {
      const response = await fetch(`/api/create-subscription?session_id=${encodeURIComponent(sessionId)}`, {
        headers: await authHeaders(),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.active) throw new Error(data.error || 'subscription_pending')
      if (!alive) return
      setSubActive(true)
      setSubError('')
      setUser({ ...user, prestataireSubActive: true, prestataireSubStatus: data.status || 'active' })
      navigate('/inscription-prestataire', { replace: true })
    }).catch(() => {
      checkedSubSessionRef.current = ''
      if (alive) setSubError('Paiement en cours de confirmation. Ne repaie pas : le statut va se mettre à jour automatiquement.')
    }).finally(() => { if (alive) setCheckingSubReturn(false) })
    return () => { alive = false }
  }, [location.search, user?.uid]) // eslint-disable-line react-hooks/exhaustive-deps

  // Crée le compte à la fin de l'étape « Compte », puis garde la session active
  // pendant tout le dossier. L'abonnement n'intervient qu'à la dernière étape.
  async function ensureAccount() {
    if (!anonMode || anonUidRef.current) return true
    const { USE_REAL_FIREBASE } = await import('../firebase')
    const name = `${f.prenom} ${f.nom}`.trim() || 'Prestataire'
    const phone = f.telephone || ''
    const loginEmail = regEmail.trim()
    try {
      let uid
      if (USE_REAL_FIREBASE) {
        const { createUserWithEmailAndPassword, updateProfile, sendEmailVerification } = await import('firebase/auth')
        const { auth, db } = await import('../firebase')
        const { doc, setDoc } = await import('firebase/firestore')
        const cred = await createUserWithEmailAndPassword(auth, loginEmail, regPassword)
        uid = cred.user.uid
        if (name) await updateProfile(cred.user, { displayName: name })
        const account = {
          uid, email: loginEmail, name, phone,
          role: 'prestataire', activeRole: 'prestataire', enabledRoles: ['prestataire'],
          status: 'draft', emailVerified: false, emailVerificationRequired: true, createdAt: Date.now(),
        }
        await setDoc(doc(db, 'users', uid), account)
        // Contrairement à l'ancien tunnel, le premier mail part réellement dès
        // la création. En cas de panne temporaire, l'écran final permet de renvoyer.
        try {
          await sendEmailVerification(cred.user)
          setEmailVerification('sent')
        } catch {
          setEmailVerification('required')
        }
        setUser(account)
      } else {
        uid = 'local-prest-' + Date.now()
        const { saveAccount } = await import('../utils/accounts')
        const account = { uid, email: loginEmail, name, phone, role: 'prestataire', activeRole: 'prestataire', enabledRoles: ['prestataire'], status: 'draft', emailVerified: true, createdAt: Date.now() }
        saveAccount(account)
        setUser(account)
      }
      const linkedApp = updateApplication(app.id, { uid, email: loginEmail, name })
      anonUidRef.current = uid
      const persistedApp = saveDraft(app.id, { ...f, regEmail: loginEmail, _onboardingStep: 1 }) || linkedApp
      if (persistedApp) {
        setApp(persistedApp)
        // Le brouillon temporaire a pu être créé avant authentification et donc
        // refusé par Firestore. On resynchronise ici le document COMPLET.
        import('../utils/firestore-sync').then(({ syncDoc }) => {
          syncDoc(`applications/${app.id}`, persistedApp)
        }).catch(() => {})
      }
      localStorage.removeItem(ANON_DRAFT_KEY)
      return true
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        setStep(0)
        setErrors({ regEmail: 'Cet email est déjà associé à un compte. Connecte-toi à ce compte pour continuer.', emailExists: true })
      } else {
        setSubError('Impossible de créer ton compte pour le moment. Réessaie dans un instant.')
      }
      return false
    }
  }

  async function checkEmailVerification({ resend = false } = {}) {
    try {
      const { USE_REAL_FIREBASE, auth, db } = await import('../firebase')
      if (!USE_REAL_FIREBASE) {
        setEmailVerification('verified')
        return true
      }
      const current = auth?.currentUser
      if (!current) {
        setEmailVerification('required')
        setSubError('Ta session a expiré. Reconnecte-toi : ton dossier est déjà sauvegardé.')
        return false
      }
      const { reload, sendEmailVerification } = await import('firebase/auth')
      await reload(current)
      if (current.emailVerified) {
        const { doc, setDoc } = await import('firebase/firestore')
        await setDoc(doc(db, 'users', current.uid), {
          emailVerified: true,
          emailVerificationRequired: false,
        }, { merge: true })
        if (user) setUser({ ...user, emailVerified: true, emailVerificationRequired: false })
        setEmailVerification('verified')
        setSubError('')
        return true
      }
      if (resend) {
        await sendEmailVerification(current)
        setEmailVerification('sent')
      } else {
        setEmailVerification('required')
      }
      return false
    } catch (error) {
      setEmailVerification('error')
      setSubError(error?.code === 'auth/too-many-requests'
        ? 'Trop de demandes ont été envoyées. Attends quelques minutes avant de réessayer.'
        : "Impossible de vérifier l'email pour le moment. Réessaie dans un instant.")
      return false
    }
  }

  async function handleSubscribe() {
    setSubError('')
    setSubRedirecting(true)
    const accountOk = await ensureAccount()
    if (!accountOk) { setSubRedirecting(false); return }
    const emailOk = await checkEmailVerification()
    if (!emailOk) { setSubRedirecting(false); return }

    const providerTypes = normalizeProviderTypes(f.prestataireTypes, f.prestataireType)
    const missingDocs = getRequiredDocs('prestataire', providerTypes).filter(key => !hasDoc(app, key))
    if (missingDocs.length) {
      setSubRedirecting(false)
      setSubError('Ajoute tous les documents requis avant de prendre l’abonnement.')
      return
    }
    saveDraft(app.id, { ...f, regEmail: regEmail.trim() || user?.email || '', _onboardingStep: LAST_STEP })
    try {
      const { authHeaders } = await import('../utils/apiAuth')
      const r = await fetch('/api/create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({}),
      })
      const data = await r.json().catch(() => ({}))
      if (r.ok && data.alreadyActive) {
        setSubActive(true)
        setSubRedirecting(false)
        setSubError('')
        return
      }
      if (r.ok && data.url) { window.location.href = data.url; return }
      throw new Error(data.error || 'checkout')
    } catch {
      setSubRedirecting(false)
      setSubError("Impossible de lancer le paiement pour le moment. Réessaie dans un instant.")
    }
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  function update(key, val) {
    const patch = { [key]: val }
    setF(p => ({ ...p, ...patch }))
    saveDraft(app?.id, { ...f, ...patch })
  }

  function toggleProviderType(type) {
    const current = normalizeProviderTypes(f.prestataireTypes, f.prestataireType)
    const next = current.includes(type)
      ? current.filter(item => item !== type)
      : type === 'autre'
        ? ['autre']
        : [...current.filter(item => item !== 'autre'), type]
    const patch = {
      prestataireTypes: next,
      prestataireType: getPrimaryProviderType({ prestataireTypes: next }),
    }
    setF(previous => ({ ...previous, ...patch }))
    saveDraft(app?.id, { ...f, ...patch })
  }

  // ── Validation par step ──────────────────────────────────────────────────────
  function validate(s) {
    const errs = {}
    if (s === 0) {
      if (!f.prenom.trim()) errs.prenom = 'Requis'
      if (!f.nom.trim()) errs.nom = 'Requis'
      if (!f.telephone.trim()) errs.telephone = 'Requis'
      else if (!isValidPhone(f.telephoneCode, f.telephone)) errs.telephone = 'Numéro invalide pour ce pays'
      // SIRET optionnel pour tous — mais si renseigné, format strict (évite le renvoi de dossier)
      if (f.siret.trim() && !isValidSiret(f.siret)) errs.siret = 'Numéro invalide : SIREN = 9 chiffres, SIRET = 14 chiffres'
      if (anonMode) {
        const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail.trim())
        if (!regEmail.trim() || !emailOk) errs.regEmail = 'Email invalide'
        if (!regPassword || regPassword.length < 8) errs.regPassword = 'Au moins 8 caractères'
        if (!/[A-Z]/.test(regPassword)) errs.regPassword = 'Au moins une majuscule'
        if (regPassword !== regPasswordConfirm) errs.regPasswordConfirm = 'Les mots de passe ne correspondent pas'
      }
    }
    if (s === 1 && f.siret.trim() && !isValidSiret(f.siret)) {
      errs.siret = 'Numéro invalide : SIREN = 9 chiffres, SIRET = 14 chiffres'
    }
    if (s === 2) {
      const types = normalizeProviderTypes(f.prestataireTypes, f.prestataireType)
      if (types.includes('food') && f.alcoolFood && !f.alcoolFoodAtteste) {
        errs.alcoolFoodAtteste = 'Coche l\'attestation pour proposer de l\'alcool'
      }
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function next() {
    if (!validate(step)) return

    // Étape Compte : création réelle + email de vérification. Le compte reste
    // connecté et le brouillon est ensuite synchronisé pendant tout le dossier.
    if (anonMode && step === 0 && !anonUidRef.current) {
      setCreatingAccount(true)
      const accountOk = await ensureAccount()
      setCreatingAccount(false)
      if (!accountOk) return
    }

    const nextStep = Math.min(step + 1, LAST_STEP)
    saveDraft(app.id, { ...f, regEmail: regEmail.trim() || user?.email || '', _onboardingStep: nextStep })
    setStep(nextStep)
    window.scrollTo(0, 0)
  }

  function prev() {
    const previousStep = Math.max(step - 1, 0)
    saveDraft(app.id, { _onboardingStep: previousStep })
    setStep(previousStep)
    window.scrollTo(0, 0)
  }

  async function handleUpload(docKey, file) {
    if (!app || !file) return
    setUploadStatus(s => ({ ...s, [docKey]: 'uploading' }))
    const res = await uploadDocument(app.id, docKey, file)
    if (res.ok) {
      setUploadStatus(s => ({ ...s, [docKey]: 'done' }))
      const fresh = getApplicationById(app.id)
      if (fresh) setApp(fresh)
    } else {
      setUploadStatus(s => ({ ...s, [docKey]: 'error' }))
      const notAuth = /authentifi/i.test(res.error || '')
      showToast(
        notAuth
          ? 'Session expirée — clique sur « Recommencer une nouvelle demande » en haut pour repartir à zéro.'
          : 'Erreur lors de l\'ajout',
        'error'
      )
    }
  }

  async function handleRemove(docKey, index) {
    if (!app) return
    await removeDocumentFile(app.id, docKey, index)
    const fresh = getApplicationById(app.id)
    if (fresh) setApp(fresh)
  }

  async function handleSubmit() {
    if (!subActive) {
      setSubError('Active ton abonnement avant d’envoyer le dossier.')
      setStep(LAST_STEP)
      return
    }
    const emailOk = await checkEmailVerification()
    if (!emailOk) return
    // Dynamic check based on type
    const providerTypes = normalizeProviderTypes(f.prestataireTypes, f.prestataireType)
    const requiredDocKeys = getRequiredDocs('prestataire', providerTypes)
    const missingDocs = requiredDocKeys
      .filter(key => !hasDoc(app, key))
      .map(key => DOCUMENT_LABELS[key]?.label || key)
    if (missingDocs.length > 0) {
      showToast(`Document(s) manquant(s) : ${missingDocs[0]}${missingDocs.length > 1 ? ` (+${missingDocs.length - 1})` : ''}`, 'error')
      return
    }
    setSubmitting(true)
    try {
      const freshApp = getApplicationById(app.id)
      const allDocs = freshApp?.documents || {}
      const failedDocs = []
      for (const [docKey, entries] of Object.entries(allDocs)) {
        const arr = Array.isArray(entries) ? entries : [entries]
        if (arr.some(e => e && !e.url)) {
          failedDocs.push(DOCUMENT_LABELS[docKey]?.label || docKey)
        }
      }
      if (failedDocs.length > 0) {
        setSubmitting(false)
        showToast(`Retire et rajoute ces fichiers : ${failedDocs.join(', ')}`, 'error')
        return
      }

      const submittedForm = {
        ...f,
        prestataireTypes: providerTypes,
        prestataireType: getPrimaryProviderType({ prestataireTypes: providerTypes }),
      }
      const result = await submitApplication(app.id, submittedForm, candidateNote)
      setApp(result)

      // Email d'accusé de réception (best-effort — le dossier vient d'être
      // synchronisé dans Firestore par submitApplication, donc /api/send-email
      // le retrouvera pour envoyer à l'email du dossier).
      try {
        const { authHeaders } = await import('../utils/apiAuth')
        await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
          body: JSON.stringify({ appId: app.id, type: 'application_received' }),
        })
      } catch {}

      // On NE touche PAS au nom global du compte : le nom de scène / commercial est
      // l'identité PRO du prestataire → il vit uniquement dans providers/{uid} (créé à
      // l'approbation). Écraser users/{uid}.name transformait « Raïssa Hage » (identité
      // perso, ex. bonjour {name} côté client) en « Riri star ». On ne synchronise que
      // le type de prestation.
      if (user) {
        try {
          const { syncDoc } = await import('../utils/firestore-sync')
          syncDoc(`users/${user.uid}`, {
            prestataireType: submittedForm.prestataireType,
            prestataireTypes: submittedForm.prestataireTypes,
          })
        } catch {}
      }

      if (anonMode) {
        try {
          const { USE_REAL_FIREBASE } = await import('../firebase')
          if (USE_REAL_FIREBASE) {
            const { auth } = await import('../firebase')
            const { signOut } = await import('firebase/auth')
            await signOut(auth)
          }
        } catch {}
        localStorage.removeItem(ANON_DRAFT_KEY)
        setSuccessScreen(true)
      } else {
        showToast('Dossier soumis !')
        setTimeout(() => navigate('/mon-dossier'), 1500)
      }
    } catch {
      showToast('Erreur lors de la soumission', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (!app) return null

  // ── Success screen (anonymous mode) ──────────────────────────────────────────
  if (successScreen) {
    return (
      <PublicShell>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ textAlign: 'center', maxWidth: 420 }}>
            <div style={{ width: 68, height: 68, borderRadius: '50%', margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(78,232,200,0.12)', border: '1px solid rgba(78,232,200,0.4)' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#4ee8c8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h2 style={{ fontFamily: CG, fontWeight: 300, fontSize: '2rem', color: 'rgba(255,255,255,0.92)', margin: '0 0 16px' }}>
              Demande envoyée !
            </h2>
            <p style={{ fontFamily: DM, fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.8, marginBottom: 8 }}>
              Ton dossier a été transmis à l'équipe LIVEINBLACK.
            </p>
            <p style={{ fontFamily: DM, fontSize: 12, color: GOLD, lineHeight: 1.8, marginBottom: 32 }}>
              Tu seras contacté à <strong>{regEmail}</strong> une fois ton compte validé.
            </p>
            <p style={{ fontFamily: DM, fontSize: 10, color: 'rgba(255,255,255,0.25)', lineHeight: 1.7, marginBottom: 32 }}>
              La validation prend généralement moins de 24h. Tu recevras un email dès que ton espace est activé.
            </p>
            <button onClick={() => navigate('/accueil')} style={{ ...S.btnGold, maxWidth: 240, margin: '0 auto' }}>
              Retour à l'accueil
            </button>
          </div>
        </div>
      </PublicShell>
    )
  }

  const selectedTypes = normalizeProviderTypes(f.prestataireTypes, f.prestataireType)
  const selectedType = FLEXIBLE_TYPES.find(t => t.key === selectedTypes[0])
  const typeColor = selectedType?.color || PURPLE
  const requiredDocs = getRequiredDocs('prestataire', selectedTypes)

  return (
    <PublicShell>
      <style>{`.lib-onb-card{transition:transform .18s ease,border-color .2s ease,background .2s ease}.lib-onb-card:hover{transform:translateY(-2px);border-color:rgba(255,255,255,0.2)}.lib-provider-type-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}@media(max-width:560px){.lib-provider-type-grid{grid-template-columns:1fr}}`}</style>
      <div style={S.page}>
        {/* Bouton retour — quitte l'étape courante (ou l'onboarding depuis l'étape 1) */}
        <button type="button" onClick={() => step > 0 ? prev() : navigate('/accueil')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginBottom: 18, padding: '9px 15px 9px 12px', borderRadius: 999, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', fontFamily: DM, fontSize: 13.5, fontWeight: 600, color: 'rgba(255,255,255,0.72)', transition: 'all .18s ease' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.28)'; e.currentTarget.style.color = '#fff' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = 'rgba(255,255,255,0.72)' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          Retour
        </button>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ width: 28, height: 2, borderRadius: 2, background: PURPLE, flexShrink: 0, display: 'block' }} />
            <span style={{ fontFamily: DM, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: PURPLE }}>
              Demande d'espace
            </span>
          </div>
          <h1 style={{ fontFamily: CG, fontWeight: 800, fontSize: 'clamp(2rem,8vw,3rem)', letterSpacing: '-1px', color: '#fff', margin: 0, lineHeight: 1.05 }}>
            Compte Prestataire
          </h1>
          <p style={{ fontFamily: DM, fontSize: 14, color: 'rgba(255,255,255,0.5)', marginTop: 10, lineHeight: 1.6 }}>
            Crée ton compte, complète ton dossier, puis active ton abonnement à la toute fin.
          </p>
          {anonMode && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Recommencer une nouvelle demande ? Le brouillon en cours sera effacé.')) {
                  localStorage.removeItem(ANON_DRAFT_KEY)
                  window.location.reload()
                }
              }}
              style={{ marginTop: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: DM, fontSize: 10, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.35)', textDecoration: 'underline' }}
            >
              Recommencer une nouvelle demande
            </button>
          )}
        </div>

        {/* Rappel transparent du tarif — le paiement reste la dernière étape */}
        {!subActive && step < LAST_STEP && (
          <div style={{ marginBottom: 24, padding: '14px 16px', background: 'rgba(200,169,110,0.06)', border: `1px solid ${GOLD}33`, borderRadius: 12 }}>
            <p style={{ fontFamily: DM, fontSize: 13.5, color: '#fff', margin: 0, fontWeight: 600 }}>
              Abonnement <span style={{ color: GOLD }}>9,99 €/mois</span> pour être sur LIVEINBLACK
            </p>
            <p style={{ fontFamily: DM, fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: '5px 0 0', lineHeight: 1.55 }}>
              1. Crée ton compte · 2. Remplis tout ton dossier · 3. <span style={{ color: 'rgba(255,255,255,0.72)' }}>Paie l'abonnement à la fin</span> · 4. On valide → tu es en ligne. Aucune commission sur tes prestations.
            </p>
          </div>
        )}

        {/* Progress bar */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            {STEPS.map((s, i) => {
              const done = i < step
              const active = i === step
              return (
                <button key={i} onClick={() => i < step && setStep(i)} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
                  background: 'none', border: 'none', cursor: i < step ? 'pointer' : 'default', flex: 1, padding: 0,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', fontSize: 14, fontFamily: DM, fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: active ? typeColor : done ? '#4ee8c8' : 'rgba(255,255,255,0.35)',
                    background: active ? `${typeColor}22` : done ? 'rgba(78,232,200,0.12)' : 'rgba(255,255,255,0.04)',
                    border: active ? `1px solid ${typeColor}90` : done ? '1px solid rgba(78,232,200,0.45)' : '1px solid rgba(255,255,255,0.10)',
                    transition: 'all 0.25s', boxShadow: active ? `0 0 0 4px ${typeColor}14` : 'none',
                  }}>
                    {done ? (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ee8c8" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    ) : i + 1}
                  </div>
                  <span style={{
                    fontFamily: DM, fontSize: 8.5, letterSpacing: '0.04em',
                    color: active ? typeColor : done ? 'rgba(78,232,200,0.8)' : 'rgba(255,255,255,0.3)',
                    textAlign: 'center', whiteSpace: 'nowrap',
                  }}>
                    {s.label}
                  </span>
                </button>
              )
            })}
          </div>
          <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 99, background: `linear-gradient(to right,${typeColor},${typeColor}66)`, width: `${(step / (STEPS.length - 1)) * 100}%`, transition: 'width 0.4s' }} />
          </div>
        </div>

        {/* ── STEP 1: Activités du prestataire (facultatives et modifiables) ── */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontFamily: DM, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 2 }}>
              Quelles activités proposes-tu ?
            </p>
            <p style={{ fontFamily: DM, fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6, margin: '0 0 8px' }}>
              Choisis une ou plusieurs catégories. Tu pourras les modifier plus tard depuis ton espace, ou continuer sans choisir pour le moment.
            </p>
            <div className="lib-provider-type-grid">
            {FLEXIBLE_TYPES.map(t => {
              const sel = selectedTypes.includes(t.key)
              return (
                <button type="button" key={t.key} onClick={() => toggleProviderType(t.key)} className="lib-onb-card" style={{
                  padding: '14px', borderRadius: 16, textAlign: 'left', cursor: 'pointer',
                  background: sel ? t.color + '14' : 'rgba(255,255,255,0.025)',
                  border: sel ? `1px solid ${t.color}66` : '1px solid rgba(255,255,255,0.09)',
                  display: 'flex', alignItems: 'center', gap: 15, transition: 'all 0.2s',
                }}>
                  <span style={{
                    width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                    background: `${t.color}1a`, border: `1px solid ${t.color}3a`, color: t.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <TypeIcon type={t.key} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: DM, fontSize: 14, fontWeight: 700, letterSpacing: '-0.2px', color: '#fff', margin: '0 0 3px' }}>{t.label}</p>
                    <p style={{ fontFamily: DM, fontSize: 11, color: 'rgba(255,255,255,0.5)', margin: 0, lineHeight: 1.4 }}>{t.desc}</p>
                  </div>
                  {sel
                    ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={t.color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>
                    : <span style={{ width: 20, height: 20, borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', flexShrink: 0 }} />}
                </button>
              )
            })}
            </div>
            <div style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(78,232,200,0.18)', background: 'rgba(78,232,200,0.04)' }}>
              <p style={{ fontFamily: DM, fontSize: 10.5, color: 'rgba(78,232,200,0.7)', margin: 0, lineHeight: 1.6 }}>
                {selectedTypes.length
                  ? `${selectedTypes.length} activité${selectedTypes.length > 1 ? 's' : ''} sélectionnée${selectedTypes.length > 1 ? 's' : ''}. La première devient ta catégorie principale.`
                  : 'Aucune catégorie choisie : ton profil sera classé provisoirement dans « Autres services ».'}
              </p>
            </div>
            <Field label="Nom de ta page / nom commercial">
              <input style={S.input} value={f.nomCommercial} onChange={e => update('nomCommercial', e.target.value)} placeholder="Le nom visible par les clients et organisateurs" />
            </Field>
            {selectedTypes.includes('artiste') && (
              <Field label="Nom de scène / nom public (optionnel)">
                <input style={S.input} value={f.nomScene} onChange={e => update('nomScene', e.target.value)} placeholder="Ex. DJ Paradox, Les Twins…" />
              </Field>
            )}
            <Field label="Précise librement tes spécialités">
              <textarea
                style={{ ...S.input, minHeight: 76, resize: 'vertical' }}
                value={f.specialitesLibre}
                onChange={e => update('specialitesLibre', e.target.value)}
                placeholder="Ex. photobooth 360°, décoration florale, navettes VIP, équipe de régie…"
              />
            </Field>
            <Field label="Description courte">
              <textarea style={{ ...S.input, minHeight: 86, resize: 'vertical' }} value={f.description} onChange={e => update('description', e.target.value)} placeholder="Décris ton activité, ton style et ce qui te différencie…" />
            </Field>
            <Field label="Zones d'intervention">
              <RegionPicker value={Array.isArray(f.zonesIntervention) ? f.zonesIntervention : []} onChange={value => update('zonesIntervention', value)} />
            </Field>
            <Field label="Numéro SIRET (optionnel)">
              <input style={{ ...S.input, borderColor: errors.siret ? '#e05aaa' : undefined }} value={f.siret} onChange={e => update('siret', formatSiret(e.target.value))} inputMode="numeric" placeholder="9 chiffres (SIREN) ou 14 chiffres (SIRET)" />
              {errors.siret && <p style={S.error}>{errors.siret}</p>}
            </Field>
          </div>
        )}

        {/* ── STEP 0: Création du compte et identité de base ── */}
        {step === 0 && (
          <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={S.section}>Ton identité</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

              {/* Prénom + Nom */}
              <Field label="Prénom" required>
                <input
                  style={{ ...S.input, borderColor: errors.prenom ? '#e05aaa' : undefined }}
                  value={f.prenom}
                  onChange={e => update('prenom', e.target.value)}
                  placeholder="Jean"
                />
                {errors.prenom && <p style={S.error}>{errors.prenom}</p>}
              </Field>
              <Field label="Nom" required>
                <input
                  style={{ ...S.input, borderColor: errors.nom ? '#e05aaa' : undefined }}
                  value={f.nom}
                  onChange={e => update('nom', e.target.value)}
                  placeholder="Dupont"
                />
                {errors.nom && <p style={S.error}>{errors.nom}</p>}
              </Field>

              {/* Téléphone */}
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Téléphone" required>
                  <PhoneInput codeField="telephoneCode" numberField="telephone" formState={f} onUpdate={update} inputStyle={S.input} error={errors.telephone} />
                  {errors.telephone && <p style={S.error}>{errors.telephone}</p>}
                </Field>
              </div>

              {/* Ville */}
              <Field label="Ville">
                <input style={S.input} value={f.ville} onChange={e => update('ville', e.target.value)} placeholder="Paris" />
              </Field>
              <Field label="Pays">
                <select style={S.select} value={f.pays} onChange={e => update('pays', e.target.value)}>
                  {regions.map(region => <option key={region.id} value={region.name}>{region.flag} {region.name}</option>)}
                </select>
              </Field>

            </div>

            {/* ── Structure (nom commercial / nom de scène / SIRET) ── */}
            <p style={{ ...S.section, marginTop: 4, display: 'none' }}>
              Ton identité professionnelle
            </p>
            <div style={{ display: 'none', flexDirection: 'column', gap: 12 }}>

              {/* Nom de scène — artiste uniquement, c'est son nom public */}
              {selectedTypes.includes('artiste') && (
                <Field label="Nom de scène">
                  <input
                    style={{ ...S.input, borderColor: errors.nomScene ? '#e05aaa' : undefined }}
                    value={f.nomScene}
                    onChange={e => update('nomScene', e.target.value)}
                    placeholder="ex : DJ Paradox, Salsa Flow, Les Twins..."
                  />
                  {errors.nomScene
                    ? <p style={S.error}>{errors.nomScene}</p>
                    : <p style={{ fontFamily: DM, fontSize: 9, color: 'rgba(255,255,255,0.22)', margin: '5px 0 0', letterSpacing: '0.04em' }}>
                        C'est ton nom affiché sur la plateforme. Laisse vide pour afficher Prénom Nom.
                      </p>
                  }
                </Field>
              )}

              {/* Nom commercial */}
              <Field
                label={selectedTypes.includes('artiste') ? 'Structure / collectif' : 'Nom commercial'}
              >
                <input
                  style={{ ...S.input, borderColor: errors.nomCommercial ? '#e05aaa' : undefined }}
                  value={f.nomCommercial}
                  onChange={e => update('nomCommercial', e.target.value)}
                  placeholder={selectedTypes.includes('artiste')
                    ? 'Optionnel — collectif, label, association...'
                    : 'Nom officiel de ta structure'}
                />
                {errors.nomCommercial && <p style={S.error}>{errors.nomCommercial}</p>}
              </Field>

              {/* SIRET */}
              <Field
                label={['salle', 'materiel', 'food'].includes(f.prestataireType) ? 'Numéro SIRET' : 'Numéro SIRET'}
              >
                <input
                  style={{ ...S.input, borderColor: errors.siret ? '#e05aaa' : undefined }}
                  value={f.siret}
                  onChange={e => update('siret', formatSiret(e.target.value))}
                  inputMode="numeric"
                  placeholder="Optionnel — 9 chiffres (SIREN) ou 14 (SIRET)"
                />
                {errors.siret
                  ? <p style={S.error}>{errors.siret}</p>
                  : selectedTypes.includes('artiste') && (
                    <p style={{ fontFamily: DM, fontSize: 9, color: 'rgba(255,255,255,0.2)', margin: '5px 0 0', letterSpacing: '0.04em' }}>
                      Optionnel — indique ton statut de facturation à l'étape suivante
                    </p>
                  )
                }
              </Field>

            </div>

            {/* ── Activité ── */}
            <p style={{ ...S.section, marginTop: 4, display: 'none' }}>Ton activité</p>
            <div style={{ display: 'none', flexDirection: 'column', gap: 12 }}>
              <Field label="Zones d'intervention">
                <RegionPicker value={Array.isArray(f.zonesIntervention) ? f.zonesIntervention : []} onChange={v => update('zonesIntervention', v)} />
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 9, color: 'rgba(255,255,255,0.22)', margin: '8px 0 0', letterSpacing: '0.04em' }}>
                  Sélectionne les pays / zones où tu es disponible
                </p>
              </Field>
              <Field label="Description courte">
                <textarea style={{ ...S.input, minHeight: 72, resize: 'vertical' }} value={f.description} onChange={e => update('description', e.target.value)} placeholder="Décris ton activité, ton style, tes points forts..." />
              </Field>
            </div>

            {/* ── Identifiants de connexion (mode anonyme uniquement) ── */}
            {anonMode && (
              <>
                <p style={{ ...S.section, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                  Identifiants de connexion
                </p>
                <p style={{ fontFamily: DM, fontSize: 10, color: 'rgba(255,255,255,0.28)', lineHeight: 1.6, margin: '-4px 0 8px' }}>
                  Ton email servira à te connecter une fois ton dossier validé.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <Field label="Email" required>
                      <input
                        type="email"
                        style={{ ...S.input, borderColor: errors.regEmail ? '#e05aaa' : undefined }}
                        value={regEmail}
                        onChange={e => setRegEmail(e.target.value)}
                        placeholder="ton@email.fr"
                        disabled={!!anonUidRef.current}
                      />
                      {errors.regEmail && <p style={S.error}>{errors.regEmail}</p>}
                      {errors.emailExists && (
                        <button type="button" onClick={() => navigate('/connexion')} style={{
                          marginTop: 8, padding: '9px 14px', width: '100%', cursor: 'pointer',
                          background: 'linear-gradient(135deg, rgba(78,232,200,0.22), rgba(78,232,200,0.08))',
                          border: '1px solid rgba(78,232,200,0.4)', borderRadius: 6,
                          fontFamily: DM, fontSize: 11, letterSpacing: '0.05em', color: '#4ee8c8',
                        }}>Se connecter à ce compte →</button>
                      )}
                      {anonUidRef.current && (
                        <p style={{ fontFamily: DM, fontSize: 9, color: 'rgba(78,232,200,0.6)', marginTop: 4 }}>✓ Compte créé — email verrouillé</p>
                      )}
                    </Field>
                  </div>
                  {!anonUidRef.current && (
                    <>
                      <Field label="Mot de passe" required>
                        <div style={{ position: 'relative' }}>
                          <input
                            type={showPwd ? 'text' : 'password'}
                            style={{ ...S.input, paddingRight: 52, borderColor: errors.regPassword ? '#e05aaa' : undefined }}
                            value={regPassword}
                            onChange={e => setRegPassword(e.target.value)}
                            placeholder="8 caractères, 1 majuscule"
                          />
                          <button type="button" onClick={() => setShowPwd(p => !p)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: DM, fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.05em' }}>
                            {showPwd ? 'Cacher' : 'Voir'}
                          </button>
                        </div>
                        {errors.regPassword && <p style={S.error}>{errors.regPassword}</p>}
                      </Field>
                      <Field label="Confirmer" required>
                        <input
                          type={showPwd ? 'text' : 'password'}
                          style={{ ...S.input, borderColor: errors.regPasswordConfirm ? '#e05aaa' : undefined }}
                          value={regPasswordConfirm}
                          onChange={e => setRegPasswordConfirm(e.target.value)}
                          placeholder="Retape ton mot de passe"
                        />
                        {errors.regPasswordConfirm && <p style={S.error}>{errors.regPasswordConfirm}</p>}
                      </Field>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── STEP 2: Informations spécifiques + tarifs ── */}
        {step === 2 && (
          <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={S.section}>Informations spécifiques {selectedTypes.length ? `— ${selectedTypes.length} activité${selectedTypes.length > 1 ? 's' : ''}` : ''}</p>

            {/* Artiste */}
            {selectedTypes.includes('artiste') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Field label="Type d'artiste" required>
                  <select style={S.select} value={f.typeArtiste} onChange={e => update('typeArtiste', e.target.value)}>
                    <option value="">Choisir...</option>
                    <option value="dj">DJ</option>
                    <option value="musicien_live">Musicien live / Band</option>
                    <option value="danseur">Danseur / Danseuse</option>
                    <option value="performeur">Performeur / Show artistique</option>
                    <option value="dj_sax">DJ-Saxophoniste</option>
                    <option value="orchestre">Orchestre / Groupe musical</option>
                    <option value="animateur">Animateur / MC / Présentateur</option>
                    <option value="humoriste">Humoriste / Stand-up</option>
                    <option value="autre">Autre</option>
                  </select>
                </Field>
                <Field label="Styles / Spécialités">
                  <input style={S.input} value={f.styles} onChange={e => update('styles', e.target.value)} placeholder="House, Techno, R&B, Salsa, Jazz, Classique..." />
                </Field>
                <Field label="Années d'expérience">
                  <select style={S.select} value={f.anneesExperience} onChange={e => update('anneesExperience', e.target.value)}>
                    <option value="">Choisir...</option>
                    <option value="moins_1">Moins d'1 an</option>
                    <option value="1_3">1–3 ans</option>
                    <option value="3_5">3–5 ans</option>
                    <option value="5_10">5–10 ans</option>
                    <option value="plus_10">Plus de 10 ans</option>
                  </select>
                </Field>
                <Field label="Portfolio / Lien vidéo">
                  <input style={S.input} value={f.portfolio} onChange={e => update('portfolio', e.target.value)} placeholder="https://soundcloud.com/... ou lien YouTube..." />
                </Field>
                <Field label="Instagram">
                  <input style={S.input} value={f.instagram} onChange={e => update('instagram', e.target.value)} placeholder="@ton_pseudo" />
                </Field>
                <Field label="Statut de facturation">
                  <select style={S.select} value={f.statutFacturation} onChange={e => update('statutFacturation', e.target.value)}>
                    <option value="">Choisir...</option>
                    <option value="auto_entrepreneur">Auto-entrepreneur</option>
                    <option value="artiste_auteur">Artiste-Auteur (Agessa / MDA)</option>
                    <option value="salarie_intermittent">Salarié / Intermittent</option>
                    <option value="structure">Via structure (SARL, SAS...)</option>
                    <option value="autre">Autre</option>
                  </select>
                </Field>
                <Field label="Besoins techniques (optionnel)">
                  <textarea style={{ ...S.input, minHeight: 70, resize: 'vertical' }} value={f.besoinstechniques} onChange={e => update('besoinstechniques', e.target.value)} placeholder="Table de mix, monitoring, rider technique..." />
                </Field>
              </div>
            )}

            {/* Salle */}
            {selectedTypes.includes('salle') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Field label="Adresse exacte du lieu">
                  <input style={S.input} value={f.adresseLieu} onChange={e => update('adresseLieu', e.target.value)} placeholder="12 rue de la Soirée, 75001 Paris" />
                </Field>
                <Field label="Capacité maximale déclarée">
                  <input type="number" style={S.input} value={f.capaciteLieu} onChange={e => update('capaciteLieu', e.target.value)} placeholder="ex: 200" min={0} />
                </Field>
                <Field label="Type de lieu">
                  <select style={S.select} value={f.typeLieu} onChange={e => update('typeLieu', e.target.value)}>
                    <option value="">Choisir...</option>
                    <option value="salle_reception">Salle de réception</option>
                    <option value="loft">Loft / Espace atypique</option>
                    <option value="rooftop">Rooftop / Terrasse</option>
                    <option value="club">Club / Discothèque</option>
                    <option value="chateau">Château / Manoir</option>
                    <option value="warehouse">Warehouse / Hangar</option>
                    <option value="plein_air">Plein air</option>
                    <option value="autre">Autre</option>
                  </select>
                </Field>
                <Field label="Équipements disponibles">
                  <input style={S.input} value={f.equipements} onChange={e => update('equipements', e.target.value)} placeholder="Sono intégrée, éclairage, parking, cuisine..." />
                </Field>
                <Field label="Horaires autorisés">
                  <input style={S.input} value={f.horairesAutorises} onChange={e => update('horairesAutorises', e.target.value)} placeholder="ex: Jusqu'à 06h00, Pas d'événement le dimanche..." />
                </Field>
                <Field label="Règles particulières">
                  <textarea style={{ ...S.input, minHeight: 70, resize: 'vertical' }} value={f.reglesDuLieu} onChange={e => update('reglesDuLieu', e.target.value)} placeholder="Matériel externe autorisé, animaux, fumeurs..." />
                </Field>
              </div>
            )}

            {/* Matériel */}
            {selectedTypes.includes('materiel') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Field label="Catégories de matériel">
                  <input style={S.input} value={f.categoriesMateriel} onChange={e => update('categoriesMateriel', e.target.value)} placeholder="Son, Lumière, Scène, Vidéo, Structure..." />
                </Field>
                <Field label="Inventaire / Liste du matériel disponible">
                  <textarea style={{ ...S.input, minHeight: 80, resize: 'vertical' }} value={f.inventaire} onChange={e => update('inventaire', e.target.value)} placeholder="1× console Pioneer XDJ-RX3, 2× enceintes JBL SRX835..." />
                </Field>
                <Field label="Zones de livraison / installation">
                  <RegionPicker value={Array.isArray(f.zonesIntervention) ? f.zonesIntervention : []} onChange={v => update('zonesIntervention', v)} />
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 9, color: 'rgba(255,255,255,0.22)', margin: '8px 0 0', letterSpacing: '0.04em' }}>
                    Sélectionne les zones où tu livres / installes ton matériel
                  </p>
                </Field>
                <Field label="Conditions de location">
                  <textarea style={{ ...S.input, minHeight: 60, resize: 'vertical' }} value={f.conditionsLocation} onChange={e => update('conditionsLocation', e.target.value)} placeholder="Durée minimum, weekend, installation incluse..." />
                </Field>
                <Field label="Politique de caution / casse">
                  <input style={S.input} value={f.politiqueCaution} onChange={e => update('politiqueCaution', e.target.value)} placeholder="Caution 20% du devis, assurance client requise..." />
                </Field>
              </div>
            )}

            {/* Food */}
            {selectedTypes.includes('food') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Field label="Type d'activité">
                  <select style={S.select} value={f.typeActiviteFood} onChange={e => update('typeActiviteFood', e.target.value)}>
                    <option value="">Choisir...</option>
                    <option value="traiteur">Traiteur événementiel</option>
                    <option value="boissons">Bar / Boissons</option>
                    <option value="cocktail">Bar à cocktails</option>
                    <option value="food_truck">Food Truck</option>
                    <option value="desserts">Pâtisserie / Desserts</option>
                    <option value="autre">Autre</option>
                  </select>
                </Field>
                <Field label="Menu / Carte de base">
                  <textarea style={{ ...S.input, minHeight: 80, resize: 'vertical' }} value={f.menuBase} onChange={e => update('menuBase', e.target.value)} placeholder="Décris tes formules, spécialités, régimes..." />
                </Field>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Toggle value={f.alcoolFood} onChange={v => update('alcoolFood', v)} label="Alcool proposé" />
                  {f.alcoolFood && (
                    <div style={{ marginTop: 6, marginLeft: 46, padding: '12px 14px', background: 'rgba(200,169,110,0.05)', border: `1px solid ${errors.alcoolFoodAtteste ? '#e05aaa' : 'rgba(200,169,110,0.22)'}`, borderRadius: 8 }}>
                      <p style={{ fontFamily: DM, fontSize: 10, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, margin: '0 0 10px' }}>
                        La vente d'alcool est soumise à la réglementation de ton pays (licence, autorisations, âge légal). Cette responsabilité t'incombe entièrement — LIVEINBLACK n'est pas responsable de la conformité de ton activité.
                      </p>
                      <div
                        onClick={() => update('alcoolFoodAtteste', !f.alcoolFoodAtteste)}
                        style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', userSelect: 'none' }}
                      >
                        <div style={{
                          width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 1,
                          border: `1.5px solid ${f.alcoolFoodAtteste ? '#4ee8c8' : 'rgba(255,255,255,0.25)'}`,
                          background: f.alcoolFoodAtteste ? 'rgba(78,232,200,0.15)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s',
                        }}>
                          {f.alcoolFoodAtteste && (
                            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                              <polyline points="2,6 5,9 10,3" stroke="#4ee8c8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                        <span style={{ fontFamily: DM, fontSize: 10.5, color: f.alcoolFoodAtteste ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
                          J'atteste respecter la réglementation locale sur la vente d'alcool et en assumer l'entière responsabilité.
                        </span>
                      </div>
                      {errors.alcoolFoodAtteste && <p style={{ ...S.error, margin: '6px 0 0 28px' }}>{errors.alcoolFoodAtteste}</p>}
                      <p style={{ fontFamily: DM, fontSize: 9, color: 'rgba(255,255,255,0.3)', margin: '8px 0 0 28px', letterSpacing: '0.04em' }}>
                        Facultatif : tu pourras joindre un justificatif à l'étape Documents si tu en as un.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TarifBlock — affiché pour tous les types */}
            <TarifBlock f={f} update={update} />
          </div>
        )}

        {/* ── STEP 3: Fonctionnement de la mise en relation ── */}
        {step === 3 && (
          <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <p style={S.section}>Comment ça fonctionne</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontFamily: CG, fontSize: 22, fontWeight: 400, color: 'rgba(255,255,255,0.90)', margin: 0 }}>
                Une vitrine, un catalogue, une messagerie
              </p>
              <p style={{ fontFamily: DM, fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.8, margin: 0 }}>
                LIVE IN BLACK te rend visible auprès des clients et des organisateurs. Ils consultent ta page puis te contactent directement dans la messagerie.
              </p>
            </div>

            {[
              {
                num: '01',
                title: 'Ta page est publiée',
                desc: 'Après validation, ton profil apparaît dans l’annuaire des prestataires.',
                color: GOLD,
              },
              {
                num: '02',
                title: 'Ton catalogue est consulté',
                desc: 'Tu présentes librement tes services, tes formules et des tarifs indicatifs.',
                color: '#4ee8c8',
              },
              {
                num: '03',
                title: 'Vous échangez directement',
                desc: 'Le client t’écrit dans la messagerie. Vous convenez ensemble de la date, du contrat, du tarif et du règlement.',
                color: PURPLE,
              },
            ].map(s => (
              <div key={s.num} style={{ display: 'flex', gap: 14, padding: '14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8 }}>
                <div style={{ fontFamily: DM, fontSize: 20, fontWeight: 700, color: s.color, opacity: 0.5, flexShrink: 0, lineHeight: 1, paddingTop: 2 }}>
                  {s.num}
                </div>
                <div>
                  <p style={{ fontFamily: DM, fontSize: 11, color: 'rgba(255,255,255,0.85)', margin: '0 0 5px', letterSpacing: '0.05em' }}>{s.title}</p>
                  <p style={{ fontFamily: DM, fontSize: 10, color: 'rgba(255,255,255,0.32)', margin: 0, lineHeight: 1.7 }}>{s.desc}</p>
                </div>
              </div>
            ))}

            <div style={{ padding: '10px 14px', background: 'rgba(78,232,200,0.04)', border: '1px solid rgba(78,232,200,0.12)', borderRadius: 6 }}>
              <p style={{ fontFamily: DM, fontSize: 9, color: 'rgba(78,232,200,0.55)', letterSpacing: '0.06em', margin: 0, lineHeight: 1.7 }}>
                LIVE IN BLACK ne collecte pas le paiement de tes prestations et ne prélève aucune commission dessus. La facturation et le règlement restent entre toi et ton client.
              </p>
            </div>
          </div>
        )}

        {/* ── STEP 4: Documents ── */}
        {step === 4 && (
          <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={S.section}>Documents justificatifs</p>
            <p style={{ fontFamily: DM, fontSize: 10, color: 'rgba(255,255,255,0.3)', lineHeight: 1.7, margin: 0 }}>
              Ajoute les documents requis pour ta catégorie. Ils sont stockés de façon privée et accessibles uniquement à l'équipe LIVEINBLACK.
            </p>

            {/* Documents requis par type */}
            {requiredDocs.map(docKey => {
              const label = DOCUMENT_LABELS[docKey]?.label || docKey
              return (
                <DocUploadRow
                  key={docKey}
                  label={label}
                  required
                  files={getDocFiles(app, docKey)}
                  status={uploadStatus[docKey]}
                  onChange={file => handleUpload(docKey, file)}
                  onRemove={i => handleRemove(docKey, i)}
                />
              )
            })}

            {/* RC Pro — optionnelle */}
            {!requiredDocs.includes('rc_pro') && (
              <DocUploadRow
                label="Attestation RC Pro (optionnelle)"
                required={false}
                files={getDocFiles(app, 'rc_pro')}
                status={uploadStatus.rc_pro}
                onChange={file => handleUpload('rc_pro', file)}
                onRemove={i => handleRemove('rc_pro', i)}
              />
            )}

            {/* Alcool food — justificatif FACULTATIF */}
            {selectedTypes.includes('food') && f.alcoolFood && (
              <DocUploadRow
                label="Licence alcool (II / III / IV) — facultatif"
                required={false}
                files={getDocFiles(app, 'alcohol_license')}
                status={uploadStatus.alcohol_license}
                onChange={file => handleUpload('alcohol_license', file)}
                onRemove={i => handleRemove('alcohol_license', i)}
              />
            )}

            <div style={{ padding: '13px 15px', borderRadius: 10, background: 'rgba(78,232,200,.04)', border: '1px solid rgba(78,232,200,.16)' }}>
              <p style={{ margin: 0, fontFamily: DM, fontSize: 11, color: 'rgba(255,255,255,.55)', lineHeight: 1.6 }}>
                Une fois les documents ajoutés, continue vers la dernière étape pour vérifier ton email et activer l'abonnement.
              </p>
            </div>
          </div>
        )}

        {/* ── STEP 5: Vérification, abonnement puis envoi ── */}
        {step === LAST_STEP && (() => {
          const missing = getRequiredDocs('prestataire', selectedTypes)
            .filter(key => !hasDoc(app, key))
            .map(key => DOCUMENT_LABELS[key]?.label || key)
          const docsReady = missing.length === 0
          const emailReady = emailVerification === 'verified' || user?.emailVerified === true
          const paymentPending = checkingSubReturn
          return (
            <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={S.section}>Finaliser mon inscription</p>

              <div style={{ padding: 16, borderRadius: 13, background: docsReady ? 'rgba(78,232,200,.05)' : 'rgba(224,90,170,.05)', border: `1px solid ${docsReady ? 'rgba(78,232,200,.22)' : 'rgba(224,90,170,.24)'}` }}>
                <p style={{ margin: 0, fontFamily: DM, fontWeight: 700, fontSize: 12, color: docsReady ? '#4ee8c8' : '#e05aaa' }}>{docsReady ? 'Dossier complet' : 'Documents manquants'}</p>
                {!docsReady && missing.map(label => <p key={label} style={{ margin: '7px 0 0', fontFamily: DM, fontSize: 10, color: 'rgba(224,90,170,.75)' }}>— {label}</p>)}
              </div>

              <div style={{ padding: 16, borderRadius: 13, background: emailReady ? 'rgba(78,232,200,.05)' : 'rgba(200,169,110,.06)', border: `1px solid ${emailReady ? 'rgba(78,232,200,.22)' : 'rgba(200,169,110,.28)'}` }}>
                <p style={{ margin: 0, fontFamily: DM, fontWeight: 700, fontSize: 12, color: emailReady ? '#4ee8c8' : GOLD }}>{emailReady ? 'Email vérifié' : 'Vérifie ton adresse email'}</p>
                {!emailReady && <>
                  <p style={{ margin: '7px 0 12px', fontFamily: DM, fontSize: 10.5, lineHeight: 1.6, color: 'rgba(255,255,255,.48)' }}>Le premier email a été envoyé à {regEmail || user?.email}. Vérifie aussi les courriers indésirables.</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => checkEmailVerification()} style={{ ...S.btnGhost, width: 'auto', flex: 1, padding: 11 }}>J'ai vérifié</button>
                    <button type="button" onClick={() => checkEmailVerification({ resend: true })} style={{ ...S.btnGhost, width: 'auto', flex: 1, padding: 11 }}>Renvoyer l'email</button>
                  </div>
                </>}
              </div>

              <div style={{ padding: 20, borderRadius: 14, background: 'linear-gradient(145deg,rgba(200,169,110,.12),rgba(10,12,22,.72))', border: '1px solid rgba(200,169,110,.32)' }}>
                <p style={{ margin: 0, fontFamily: DM, fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: GOLD }}>Abonnement prestataire</p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 9 }}><strong style={{ fontFamily: CG, fontSize: 34, color: '#fff' }}>9,99 €</strong><span style={{ fontFamily: DM, fontSize: 13, color: 'rgba(255,255,255,.45)' }}>/ mois</span></div>
                <p style={{ margin: '5px 0 0', fontFamily: DM, fontSize: 10.5, lineHeight: 1.6, color: 'rgba(255,255,255,.46)' }}>Sans engagement · résiliable à tout moment · aucune commission sur tes prestations.</p>
                <p style={{ margin: '8px 0 0', fontFamily: DM, fontSize: 9.5, lineHeight: 1.55, color: 'rgba(255,255,255,.38)' }}>Abonnement récurrent réglé par carte via Stripe. FedaPay Mobile Money est actuellement réservé à l'achat de billets.</p>
              </div>

              {subError && <p style={{ ...S.error, margin: 0 }}>{subError}</p>}

              {!subActive ? (
                <button onClick={handleSubscribe} disabled={!docsReady || !emailReady || subRedirecting || paymentPending} style={{ ...S.btnGold, opacity: (!docsReady || !emailReady || subRedirecting || paymentPending) ? .45 : 1, cursor: (!docsReady || !emailReady || subRedirecting || paymentPending) ? 'not-allowed' : 'pointer' }}>
                  {paymentPending ? 'Confirmation du paiement…' : subRedirecting ? 'Redirection sécurisée…' : 'Activer mon abonnement · 9,99 €/mois'}
                </button>
              ) : <>
                <div style={{ padding: '12px 14px', borderRadius: 11, background: 'rgba(78,232,200,.08)', border: '1px solid rgba(78,232,200,.26)', fontFamily: DM, fontSize: 11, fontWeight: 700, color: '#4ee8c8', textAlign: 'center' }}>Abonnement actif · paiement confirmé</div>
                <textarea value={candidateNote} onChange={e => setCandidateNote(e.target.value)} placeholder="Message pour l'équipe (optionnel)" style={{ ...S.input, minHeight: 78, resize: 'vertical' }} />
                <button onClick={handleSubmit} disabled={submitting || !docsReady} style={{ ...S.btnGold, opacity: submitting || !docsReady ? .45 : 1 }}>{submitting ? 'Envoi en cours…' : 'Soumettre mon dossier'}</button>
              </>}
            </div>
          )
        })()}

        {/* Navigation */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          {step > 0 && (
            <button onClick={prev} disabled={creatingAccount || submitting} style={{ ...S.btnGhost, flex: 1 }}>← Retour</button>
          )}
          {step < STEPS.length - 1 && (
            <button onClick={next} disabled={creatingAccount} style={{ ...S.btnGold, flex: 2, opacity: creatingAccount ? 0.6 : 1 }}>
              {creatingAccount ? 'Création du compte...' : 'Continuer →'}
            </button>
          )}
        </div>

        <p style={{ fontFamily: DM, fontSize: 9, color: 'rgba(255,255,255,0.18)', textAlign: 'center', marginTop: 12, letterSpacing: '0.1em' }}>
          {anonMode ? 'Brouillon enregistré localement' : 'Sauvegarde automatique activée'}
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 100,
          padding: '10px 20px', borderRadius: 6, backdropFilter: 'blur(20px)',
          fontFamily: DM, fontSize: 11, letterSpacing: '0.06em',
          ...(toast.type === 'error'
            ? { background: 'rgba(220,50,50,0.16)', border: '1px solid rgba(220,50,50,0.4)', color: 'rgba(220,100,100,0.95)' }
            : { background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)', color: '#4ee8c8' }),
        }}>
          {toast.msg}
        </div>
      )}
    </PublicShell>
  )
}

// ── File row ──────────────────────────────────────────────────────────────────
function FileRow({ file, onRemove }) {
  const failed = !file.url
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 10px', borderRadius: 6,
      background: failed ? 'rgba(224,90,170,0.06)' : 'rgba(78,232,200,0.05)',
      border: `1px solid ${failed ? 'rgba(224,90,170,0.25)' : 'rgba(78,232,200,0.12)'}`,
    }}>
      {failed ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#e05aaa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ee8c8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          fontFamily: "Inter, sans-serif", fontSize: 10,
          color: failed ? 'rgba(224,90,170,0.9)' : 'rgba(255,255,255,0.8)',
          display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {file.name}
        </span>
        <span style={{
          fontFamily: "Inter, sans-serif", fontSize: 8, letterSpacing: '0.04em',
          color: failed ? 'rgba(224,90,170,0.55)' : 'rgba(255,255,255,0.3)',
        }}>
          {failed
            ? 'Envoi échoué — retire et rajoute ce fichier'
            : file.size != null
              ? file.size < 1024 * 1024
                ? `${(file.size / 1024).toFixed(0)} Ko`
                : `${(file.size / (1024 * 1024)).toFixed(1)} Mo`
              : ''}
        </span>
      </div>
      <button
        onClick={onRemove}
        style={{
          background: 'rgba(224,90,170,0.10)', border: '1px solid rgba(224,90,170,0.25)',
          cursor: 'pointer', color: '#e05aaa', fontSize: 13, lineHeight: 1,
          padding: '3px 7px', borderRadius: 4, flexShrink: 0,
        }}
        title="Retirer ce fichier"
      >✕</button>
    </div>
  )
}

// ── Document upload row ───────────────────────────────────────────────────────
function DocUploadRow({ label, required, files = [], status, onChange, onRemove }) {
  const hasFiles    = files.length > 0
  const isUploading = status === 'uploading'
  const missing     = required && !hasFiles

  const borderColor = hasFiles
    ? 'rgba(78,232,200,0.25)'
    : missing ? 'rgba(224,90,170,0.35)' : 'rgba(255,255,255,0.10)'
  const bgColor = hasFiles
    ? 'rgba(78,232,200,0.04)'
    : missing ? 'rgba(224,90,170,0.04)' : 'rgba(255,255,255,0.02)'
  const iconColor = hasFiles ? '#4ee8c8' : missing ? '#e05aaa' : 'rgba(255,255,255,0.25)'
  const btnColor  = hasFiles ? 'rgba(78,232,200,0.7)' : missing ? '#e05aaa' : 'rgba(200,169,110,0.7)'
  const btnBorder = hasFiles ? 'rgba(78,232,200,0.3)' : missing ? 'rgba(224,90,170,0.4)' : 'rgba(200,169,110,0.3)'

  return (
    <div style={{
      borderRadius: 10, marginBottom: 12, overflow: 'hidden',
      border: `1px solid ${borderColor}`,
      background: bgColor,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 16px' }}>
        <div style={{
          width: 40, height: 40, borderRadius: 8, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, fontWeight: 700,
          background: hasFiles ? 'rgba(78,232,200,0.10)' : missing ? 'rgba(224,90,170,0.10)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${borderColor}`,
          color: iconColor,
        }}>
          {isUploading ? (
            <span style={{ fontSize: 12, opacity: 0.6 }}>···</span>
          ) : hasFiles ? '✓' : missing ? '!' : '○'}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontFamily: "Inter, sans-serif", fontSize: 11, margin: 0, letterSpacing: '0.03em',
            color: hasFiles ? '#fff' : missing ? '#e05aaa' : 'rgba(255,255,255,0.6)',
            fontWeight: hasFiles ? 500 : 400,
          }}>
            {label}
            {required && <span style={{ color: '#e05aaa', marginLeft: 4 }}>*</span>}
          </p>
          <p style={{
            fontFamily: "Inter, sans-serif", fontSize: 9, margin: '3px 0 0',
            color: hasFiles
              ? 'rgba(78,232,200,0.6)'
              : missing ? 'rgba(224,90,170,0.55)' : 'rgba(255,255,255,0.22)',
          }}>
            {isUploading
              ? 'Enregistrement en cours…'
              : hasFiles
                ? `${files.length} fichier${files.length > 1 ? 's' : ''} ajouté${files.length > 1 ? 's' : ''}`
                : missing ? 'Obligatoire — aucun fichier' : 'Optionnel'}
          </p>
        </div>

        <label style={{ cursor: isUploading ? 'wait' : 'pointer', flexShrink: 0 }}>
          <input
            type="file"
            multiple
            disabled={isUploading}
            style={{ display: 'none' }}
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={e => Array.from(e.target.files || []).forEach(f => onChange(f))}
          />
          <span style={{
            display: 'inline-block',
            fontFamily: "Inter, sans-serif", fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
            padding: '7px 14px', borderRadius: 5,
            color: isUploading ? 'rgba(255,255,255,0.25)' : btnColor,
            border: `1px solid ${isUploading ? 'rgba(255,255,255,0.08)' : btnBorder}`,
            background: 'transparent',
            whiteSpace: 'nowrap',
          }}>
            {isUploading ? '···' : hasFiles ? '+ Ajouter' : 'Choisir'}
          </span>
        </label>
      </div>

      {/* File list */}
      {hasFiles && (
        <div style={{
          borderTop: '1px solid rgba(78,232,200,0.08)',
          padding: '10px 16px 12px',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          {files.map((file, i) => (
            <FileRow key={i} file={file} onRemove={() => onRemove(i)} />
          ))}
        </div>
      )}
    </div>
  )
}
