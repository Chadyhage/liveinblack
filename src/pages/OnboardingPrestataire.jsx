import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import {
  createApplication, saveDraft, submitApplication,
  uploadDocument, getApplicationById, getApplicationByUser,
  updateApplication, DOCUMENT_LABELS, getRequiredDocs,
  hasDoc, getDocFiles, removeDocumentFile,
} from '../utils/applications'

const DM = "'DM Mono', monospace"
const CG = "'Cormorant Garamond', serif"
const GOLD = '#c8a96e'
const PURPLE = '#8b5cf6'

const S = {
  page:    { position: 'relative', zIndex: 1, padding: '24px 16px 8px', maxWidth: 560, margin: '0 auto' },
  card:    { background: 'rgba(8,10,20,0.55)', backdropFilter: 'blur(22px)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12, padding: '20px 20px' },
  label:   { fontFamily: DM, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', display: 'block', marginBottom: 6, overflowWrap: 'break-word', wordBreak: 'break-word' },
  input:   { width: '100%', background: 'rgba(6,8,16,0.7)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 4, fontFamily: DM, fontSize: 12, color: 'rgba(255,255,255,0.9)', padding: '10px 12px', outline: 'none', boxSizing: 'border-box' },
  select:  { width: '100%', background: 'rgba(6,8,16,0.7)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 4, fontFamily: DM, fontSize: 12, color: 'rgba(255,255,255,0.9)', padding: '10px 12px', outline: 'none', boxSizing: 'border-box', appearance: 'none' },
  section: { fontFamily: DM, fontSize: 8, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)', marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.05)', overflowWrap: 'break-word', wordBreak: 'break-word' },
  btnGold: { width: '100%', padding: '13px', background: 'linear-gradient(135deg,rgba(200,169,110,0.22),rgba(200,169,110,0.06))', border: '1px solid rgba(200,169,110,0.45)', borderRadius: 4, fontFamily: DM, fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: GOLD, cursor: 'pointer' },
  btnGhost:{ width: '100%', padding: '13px', background: 'transparent', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 4, fontFamily: DM, fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' },
  error:   { fontFamily: DM, fontSize: 10, color: '#e05aaa', letterSpacing: '0.04em' },
}

const COUNTRY_CODES = [
  { code: '+33',  flag: '🇫🇷', label: 'France' },
  { code: '+32',  flag: '🇧🇪', label: 'Belgique' },
  { code: '+41',  flag: '🇨🇭', label: 'Suisse' },
  { code: '+352', flag: '🇱🇺', label: 'Luxembourg' },
  { code: '+1',   flag: '🇨🇦', label: 'Canada' },
  { code: '+212', flag: '🇲🇦', label: 'Maroc' },
  { code: '+213', flag: '🇩🇿', label: 'Algérie' },
  { code: '+216', flag: '🇹🇳', label: 'Tunisie' },
  { code: '+221', flag: '🇸🇳', label: 'Sénégal' },
  { code: '+225', flag: '🇨🇮', label: 'Côte d\'Ivoire' },
  { code: '+226', flag: '🇧🇫', label: 'Burkina Faso' },
  { code: '+227', flag: '🇳🇪', label: 'Niger' },
  { code: '+228', flag: '🇹🇬', label: 'Togo' },
  { code: '+229', flag: '🇧🇯', label: 'Bénin' },
  { code: '+237', flag: '🇨🇲', label: 'Cameroun' },
  { code: '+241', flag: '🇬🇦', label: 'Gabon' },
  { code: '+242', flag: '🇨🇬', label: 'Congo' },
  { code: '+243', flag: '🇨🇩', label: 'RD Congo' },
]

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
          <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
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

const TYPES = [
  { key: 'artiste',  label: 'Artiste / DJ / Performer',  icon: '🎤', color: '#8b5cf6', desc: 'DJ, musicien live, performeur, saxophoniste, animateur...' },
  { key: 'salle',    label: 'Lieu / Salle à louer',      icon: '🏛',  color: '#3b82f6', desc: 'Club, loft, rooftop, château, salle de réception...' },
  { key: 'materiel', label: 'Matériel à louer',          icon: '🔊', color: '#f59e0b', desc: 'Son, lumière, scène, vidéo, structure, mobilier...' },
  { key: 'food',     label: 'Food / Boissons / Traiteur', icon: '🍽', color: '#22c55e', desc: 'Traiteur, bar, cocktails, food truck, pâtisserie...' },
]

const STEPS = [
  { label: 'Type',       icon: '🎯' },
  { label: 'Profil',     icon: '👤' },
  { label: 'Spécifique', icon: '⚙️' },
  { label: 'Paiement',   icon: '💳' },
  { label: 'Documents',  icon: '📎' },
]

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
  if (f.prestataireType === 'artiste' && f.nomScene?.trim()) return f.nomScene.trim()
  if (f.nomCommercial?.trim()) return f.nomCommercial.trim()
  return [f.prenom, f.nom].filter(Boolean).map(s => s.trim()).join(' ') || ''
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

export default function OnboardingPrestataire() {
  const { user } = useAuth()
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

  const anonMode = !user

  const [f, setF] = useState({
    prestataireType: '',
    // Identité de la personne
    prenom: '', nom: '',
    telephoneCode: '+33', telephone: '',
    ville: '', pays: 'France',
    // Structure (nom commercial + SIRET — requis pour salle/mat/food, optionnel artiste)
    nomCommercial: '', nomScene: '', siret: '',
    // Activité
    zoneIntervention: '', description: '',
    // Artiste
    typeArtiste: '', styles: '', anneesExperience: '', statutFacturation: '',
    portfolio: '', instagram: '', besoinstechniques: '',
    // Salle
    adresseLieu: '', capaciteLieu: '', typeLieu: '', equipements: '',
    horairesAutorises: '', reglesDuLieu: '',
    // Matériel
    categoriesMateriel: '', inventaire: '', conditionsLocation: '', politiqueCaution: '',
    // Food
    typeActiviteFood: '', menuBase: '', alcoolFood: false,
    // Tarifs (tous types)
    tarifMin: '', tarifMax: '', tarifType: '', tarifDevis: false,
  })

  useEffect(() => {
    if (user) {
      // Logged-in mode
      const existing = getApplicationByUser(user.uid, 'prestataire')
      if (existing) {
        setApp(existing)
        const fd = existing.formData || {}
        setF(prev => ({ ...prev, ...fd }))
        if (['submitted', 'under_review', 'approved'].includes(existing.status)) {
          navigate('/mon-dossier')
        }
      } else {
        const created = createApplication(user.uid, user.email, user.name, 'prestataire')
        setApp(created)
        const prefill = location.state?.prefill
        if (prefill) setF(prev => ({ ...prev, ...prefill }))
      }
    } else {
      // Anonymous mode
      const savedId = localStorage.getItem(ANON_DRAFT_KEY)
      const existing = savedId ? getApplicationById(savedId) : null
      if (existing) {
        setApp(existing)
        const fd = existing.formData || {}
        setF(prev => ({ ...prev, ...fd }))
        if (fd.regEmail) setRegEmail(fd.regEmail)
      } else {
        const tempId = 'anon-prest-' + Date.now()
        localStorage.setItem(ANON_DRAFT_KEY, tempId)
        const created = createApplication(tempId, '', '', 'prestataire')
        setApp(created)
      }
    }
  }, [user])

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  function update(key, val) {
    const patch = { [key]: val }
    setF(p => ({ ...p, ...patch }))
    saveDraft(app?.id, { ...f, ...patch })
  }

  // ── Validation par step ──────────────────────────────────────────────────────
  function validate(s) {
    const errs = {}
    if (s === 0) {
      if (!f.prestataireType) errs.prestataireType = 'Sélectionne un type'
    }
    if (s === 1) {
      if (!f.prenom.trim()) errs.prenom = 'Requis'
      if (!f.nom.trim()) errs.nom = 'Requis'
      if (!f.telephone.trim()) errs.telephone = 'Requis'
      const isStructure = ['salle', 'materiel', 'food'].includes(f.prestataireType)
      if (isStructure && !f.nomCommercial.trim()) errs.nomCommercial = 'Requis'
      if (isStructure && !f.siret.trim()) errs.siret = 'SIRET requis pour ce type de prestataire'
      if (f.prestataireType === 'artiste' && !f.nomScene.trim() && !f.nomCommercial.trim()) {
        errs.nomScene = 'Renseigne ton nom de scène ou nom commercial'
      }
      if (anonMode) {
        const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail.trim())
        if (!regEmail.trim() || !emailOk) errs.regEmail = 'Email invalide'
        if (!regPassword || regPassword.length < 8) errs.regPassword = 'Au moins 8 caractères'
        if (!/[A-Z]/.test(regPassword)) errs.regPassword = 'Au moins une majuscule'
        if (regPassword !== regPasswordConfirm) errs.regPasswordConfirm = 'Les mots de passe ne correspondent pas'
      }
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function next() {
    if (!validate(step)) return

    // Anonymous mode: create Firebase account when leaving step 1
    if (anonMode && step === 1 && !anonUidRef.current) {
      setCreatingAccount(true)
      try {
        const { USE_REAL_FIREBASE } = await import('../firebase')
        let uid
        const name = getDisplayName(f) || `${f.prenom} ${f.nom}`.trim()
        const phone = f.telephone || ''

        if (USE_REAL_FIREBASE) {
          const { createUserWithEmailAndPassword } = await import('firebase/auth')
          const { auth, db } = await import('../firebase')
          const { doc, setDoc } = await import('firebase/firestore')
          const cred = await createUserWithEmailAndPassword(auth, regEmail.trim(), regPassword)
          uid = cred.user.uid
          await setDoc(doc(db, 'users', uid), {
            uid, email: regEmail.trim(), name, phone,
            role: 'client', activeRole: 'client', enabledRoles: ['client'],
            status: 'draft', emailVerified: false, createdAt: Date.now(),
          })
        } else {
          uid = 'local-prest-' + Date.now()
          const { saveAccount } = await import('../utils/accounts')
          saveAccount({ uid, email: regEmail.trim(), name, phone, role: 'prestataire', status: 'draft', emailVerified: false, createdAt: Date.now() })
        }

        updateApplication(app.id, { uid, email: regEmail.trim(), name })
        setApp(prev => ({ ...prev, uid, email: regEmail.trim(), name }))
        anonUidRef.current = uid
        saveDraft(app.id, { ...f, regEmail: regEmail.trim() })

      } catch (err) {
        setCreatingAccount(false)
        if (err.code === 'auth/email-already-in-use') {
          setErrors({ regEmail: 'Cet email est déjà lié à un compte. Connecte-toi sur /mon-dossier pour voir son état.' })
        } else {
          setErrors({ regEmail: `Erreur : ${err.message || 'Réessaie.'}` })
        }
        return
      }
      setCreatingAccount(false)
    }

    setStep(s => Math.min(s + 1, STEPS.length - 1))
    window.scrollTo(0, 0)
  }

  function prev() {
    setStep(s => Math.max(s - 1, 0))
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
      showToast('Erreur lors de l\'ajout', 'error')
    }
  }

  async function handleRemove(docKey, index) {
    if (!app) return
    await removeDocumentFile(app.id, docKey, index)
    const fresh = getApplicationById(app.id)
    if (fresh) setApp(fresh)
  }

  async function handleSubmit() {
    // Dynamic check based on type
    const requiredDocKeys = getRequiredDocs('prestataire', f.prestataireType)
    const missingDocs = requiredDocKeys
      .filter(key => !hasDoc(app, key))
      .map(key => DOCUMENT_LABELS[key]?.label || key)
    if (f.prestataireType === 'food' && f.alcoolFood && !hasDoc(app, 'alcohol_license')) {
      missingDocs.push('Licence alcool')
    }
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

      const result = await submitApplication(app.id, f, candidateNote)
      setApp(result)

      // Sync display name to user profile (logged-in mode)
      if (user) {
        try {
          const { syncDoc } = await import('../utils/firestore-sync')
          syncDoc(`users/${user.uid}`, { name: getDisplayName(f), prestataireType: f.prestataireType })
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
      <Layout hideNav>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ textAlign: 'center', maxWidth: 420 }}>
            <div style={{ fontSize: 56, marginBottom: 24 }}>✅</div>
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
      </Layout>
    )
  }

  const selectedType = TYPES.find(t => t.key === f.prestataireType)
  const typeColor = selectedType?.color || PURPLE
  const requiredDocs = getRequiredDocs('prestataire', f.prestataireType)

  return (
    <Layout>
      <div style={S.page}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ width: 28, height: 1, background: PURPLE, flexShrink: 0, display: 'block' }} />
            <span style={{ fontFamily: DM, fontSize: 8, letterSpacing: '0.4em', textTransform: 'uppercase', color: PURPLE }}>
              Demande d'espace
            </span>
          </div>
          <h1 style={{ fontFamily: CG, fontWeight: 300, fontSize: 'clamp(1.8rem,8vw,2.8rem)', color: 'rgba(255,255,255,0.92)', margin: 0, lineHeight: 1.1 }}>
            Compte Prestataire
          </h1>
          <p style={{ fontFamily: DM, fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 8, lineHeight: 1.6 }}>
            Complète ton dossier. Tu peux sauvegarder et revenir plus tard.
          </p>
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            {STEPS.map((s, i) => (
              <button key={i} onClick={() => i < step && setStep(i)} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                background: 'none', border: 'none', cursor: i < step ? 'pointer' : 'default', flex: 1,
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', fontSize: 13,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: i === step ? `${typeColor}22` : i < step ? 'rgba(78,232,200,0.12)' : 'rgba(255,255,255,0.04)',
                  border: i === step ? `1px solid ${typeColor}80` : i < step ? '1px solid rgba(78,232,200,0.4)' : '1px solid rgba(255,255,255,0.08)',
                }}>
                  {i < step ? '✓' : s.icon}
                </div>
              </button>
            ))}
          </div>
          <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 99 }}>
            <div style={{ height: '100%', borderRadius: 99, background: `linear-gradient(to right,${typeColor},${typeColor}4d)`, width: `${(step / (STEPS.length - 1)) * 100}%`, transition: 'width 0.4s' }} />
          </div>
        </div>

        {/* ── STEP 0: Choix du type ── */}
        {step === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontFamily: DM, fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginBottom: 4 }}>
              Quel type de prestataire es-tu ?
            </p>
            {TYPES.map(t => (
              <button key={t.key} onClick={() => update('prestataireType', t.key)} style={{
                padding: '16px', borderRadius: 8, textAlign: 'left', cursor: 'pointer',
                background: f.prestataireType === t.key ? t.color + '12' : 'rgba(8,10,20,0.55)',
                border: f.prestataireType === t.key ? `1px solid ${t.color}55` : '1px solid rgba(255,255,255,0.08)',
                display: 'flex', alignItems: 'center', gap: 14, transition: 'all 0.2s',
              }}>
                <span style={{ fontSize: 24, flexShrink: 0 }}>{t.icon}</span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontFamily: DM, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: f.prestataireType === t.key ? t.color : 'rgba(255,255,255,0.7)', margin: '0 0 4px' }}>{t.label}</p>
                  <p style={{ fontFamily: DM, fontSize: 9, color: 'rgba(255,255,255,0.3)', margin: 0, letterSpacing: '0.04em' }}>{t.desc}</p>
                </div>
                {f.prestataireType === t.key && (
                  <span style={{ color: t.color, fontSize: 16, flexShrink: 0 }}>✓</span>
                )}
              </button>
            ))}
            {errors.prestataireType && <p style={S.error}>{errors.prestataireType}</p>}
          </div>
        )}

        {/* ── STEP 1: Profil ── */}
        {step === 1 && (
          <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={S.section}>{selectedType?.icon} Ton identité</p>
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
                <input style={S.input} value={f.pays} onChange={e => update('pays', e.target.value)} placeholder="France" />
              </Field>

            </div>

            {/* ── Structure (nom commercial / nom de scène / SIRET) ── */}
            <p style={{ ...S.section, marginTop: 4 }}>
              {f.prestataireType === 'artiste' ? '🎭 Ton identité artistique' : '🏢 Ta structure'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Nom de scène — artiste uniquement, c'est son nom public */}
              {f.prestataireType === 'artiste' && (
                <Field label="Nom de scène" required>
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
                label={f.prestataireType === 'artiste' ? 'Structure / collectif' : 'Nom commercial'}
                required={['salle', 'materiel', 'food'].includes(f.prestataireType)}
              >
                <input
                  style={{ ...S.input, borderColor: errors.nomCommercial ? '#e05aaa' : undefined }}
                  value={f.nomCommercial}
                  onChange={e => update('nomCommercial', e.target.value)}
                  placeholder={f.prestataireType === 'artiste'
                    ? 'Optionnel — collectif, label, association...'
                    : 'Nom officiel de ta structure'}
                />
                {errors.nomCommercial && <p style={S.error}>{errors.nomCommercial}</p>}
              </Field>

              {/* SIRET */}
              <Field
                label={['salle', 'materiel', 'food'].includes(f.prestataireType) ? 'Numéro SIRET' : 'Numéro SIRET'}
                required={['salle', 'materiel', 'food'].includes(f.prestataireType)}
              >
                <input
                  style={{ ...S.input, borderColor: errors.siret ? '#e05aaa' : undefined }}
                  value={f.siret}
                  onChange={e => update('siret', e.target.value)}
                  placeholder={['salle', 'materiel', 'food'].includes(f.prestataireType)
                    ? '123 456 789 00012'
                    : 'Optionnel si artiste-auteur / intermittent'}
                />
                {errors.siret
                  ? <p style={S.error}>{errors.siret}</p>
                  : f.prestataireType === 'artiste' && (
                    <p style={{ fontFamily: DM, fontSize: 9, color: 'rgba(255,255,255,0.2)', margin: '5px 0 0', letterSpacing: '0.04em' }}>
                      Optionnel — indique ton statut de facturation à l'étape suivante
                    </p>
                  )
                }
              </Field>

            </div>

            {/* ── Activité ── */}
            <p style={{ ...S.section, marginTop: 4 }}>📍 Ton activité</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label="Zone d'intervention">
                <input style={S.input} value={f.zoneIntervention} onChange={e => update('zoneIntervention', e.target.value)} placeholder="Île-de-France, National, Europe..." />
              </Field>
              <Field label="Description courte">
                <textarea style={{ ...S.input, minHeight: 72, resize: 'vertical' }} value={f.description} onChange={e => update('description', e.target.value)} placeholder="Décris ton activité, ton style, tes points forts..." />
              </Field>
            </div>

            {/* ── Identifiants de connexion (mode anonyme uniquement) ── */}
            {anonMode && (
              <>
                <p style={{ ...S.section, marginTop: 4 }}>🔐 Identifiants de connexion</p>
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
                            placeholder="••••••••"
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
                          placeholder="••••••••"
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
            <p style={S.section}>{selectedType?.icon} Informations spécifiques — {selectedType?.label}</p>

            {/* Artiste */}
            {f.prestataireType === 'artiste' && (
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
            {f.prestataireType === 'salle' && (
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
            {f.prestataireType === 'materiel' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Field label="Catégories de matériel">
                  <input style={S.input} value={f.categoriesMateriel} onChange={e => update('categoriesMateriel', e.target.value)} placeholder="Son, Lumière, Scène, Vidéo, Structure..." />
                </Field>
                <Field label="Inventaire / Liste du matériel disponible">
                  <textarea style={{ ...S.input, minHeight: 80, resize: 'vertical' }} value={f.inventaire} onChange={e => update('inventaire', e.target.value)} placeholder="1× console Pioneer XDJ-RX3, 2× enceintes JBL SRX835..." />
                </Field>
                <Field label="Zone de livraison / installation">
                  <input style={S.input} value={f.zoneIntervention} onChange={e => update('zoneIntervention', e.target.value)} placeholder="Paris + 100km, National..." />
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
            {f.prestataireType === 'food' && (
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
                    <p style={{ fontFamily: DM, fontSize: 9, color: GOLD, letterSpacing: '0.06em', margin: '2px 0 0 46px' }}>
                      → Une licence alcool pourra vous être demandée
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* TarifBlock — affiché pour tous les types */}
            {f.prestataireType && <TarifBlock f={f} update={update} />}
          </div>
        )}

        {/* ── STEP 3: Paiement ── */}
        {step === 3 && (
          <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <p style={S.section}>💳 Tes revenus</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontFamily: CG, fontSize: 22, fontWeight: 400, color: 'rgba(255,255,255,0.90)', margin: 0 }}>
                Comment tu seras payé
              </p>
              <p style={{ fontFamily: DM, fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.8, margin: 0 }}>
                LIVEINBLACK collecte les paiements et te reverse ta part directement sur ton compte bancaire.
                Les reversements sont gérés de façon entièrement automatique.
              </p>
            </div>

            {[
              {
                num: '01',
                title: 'Dossier approuvé',
                desc: 'Notre équipe valide ton dossier (sous 48h). Tu reçois une notification par email.',
                color: GOLD,
              },
              {
                num: '02',
                title: 'Connexion Stripe',
                desc: 'Tu reçois un lien pour connecter ton compte bancaire via Stripe — la référence mondiale du paiement en ligne. Stripe vérifie ton identité et tes coordonnées bancaires de façon sécurisée (nous ne voyons jamais ton IBAN).',
                color: '#4ee8c8',
              },
              {
                num: '03',
                title: 'Reversements automatiques',
                desc: 'À chaque commande acceptée, ta part (après commission LIVEINBLACK) est automatiquement virée sur ton compte dans les 2–7 jours ouvrés.',
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
                🔒 Tes coordonnées bancaires ne transitent jamais par LIVEINBLACK. Stripe est certifié PCI-DSS niveau 1 (la norme de sécurité bancaire la plus élevée).
              </p>
            </div>

            <p style={{ fontFamily: DM, fontSize: 9, color: 'rgba(255,255,255,0.18)', margin: 0, letterSpacing: '0.05em' }}>
              Aucune information bancaire n'est demandée ici — tu configureras tout après approbation.
            </p>
          </div>
        )}

        {/* ── STEP 4: Documents ── */}
        {step === 4 && (
          <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={S.section}>📎 Documents justificatifs</p>
            <p style={{ fontFamily: DM, fontSize: 10, color: 'rgba(255,255,255,0.3)', lineHeight: 1.7, margin: 0 }}>
              Télécharge les documents requis pour ta catégorie. Stockés de façon privée, accessibles uniquement à l'équipe LIVEINBLACK.
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

            {/* Alcool food — conditionnelle */}
            {f.prestataireType === 'food' && f.alcoolFood && (
              <DocUploadRow
                label="Licence alcool (II / III / IV)"
                required
                files={getDocFiles(app, 'alcohol_license')}
                status={uploadStatus.alcohol_license}
                onChange={file => handleUpload('alcohol_license', file)}
                onRemove={i => handleRemove('alcohol_license', i)}
              />
            )}

            {/* Submit section */}
            {(() => {
              const missing = []
              const reqKeys = getRequiredDocs('prestataire', f.prestataireType)
              reqKeys.forEach(key => {
                if (!hasDoc(app, key)) missing.push(DOCUMENT_LABELS[key]?.label || key)
              })
              if (f.prestataireType === 'food' && f.alcoolFood && !hasDoc(app, 'alcohol_license')) missing.push('Licence alcool')
              const canSubmit = missing.length === 0
              return (
                <div style={{ marginTop: 8, padding: '16px', background: canSubmit ? 'rgba(139,92,246,0.05)' : 'rgba(224,90,170,0.04)', border: `1px solid ${canSubmit ? 'rgba(139,92,246,0.18)' : 'rgba(224,90,170,0.2)'}`, borderRadius: 8 }}>
                  {!canSubmit ? (
                    <>
                      <p style={{ fontFamily: DM, fontSize: 9, color: '#e05aaa', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                        Documents requis manquants
                      </p>
                      {missing.map(d => (
                        <p key={d} style={{ fontFamily: DM, fontSize: 10, color: 'rgba(224,90,170,0.7)', margin: '0 0 4px', letterSpacing: '0.04em' }}>
                          ✗ {d}
                        </p>
                      ))}
                      <p style={{ fontFamily: DM, fontSize: 9, color: 'rgba(255,255,255,0.2)', margin: '10px 0 0', lineHeight: 1.6 }}>
                        Télécharge les documents ci-dessus pour débloquer la soumission.
                      </p>
                    </>
                  ) : (
                    <>
                      <p style={{ fontFamily: DM, fontSize: 9, color: PURPLE, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Prêt à soumettre ✓</p>
                      <p style={{ fontFamily: DM, fontSize: 10, color: 'rgba(255,255,255,0.3)', lineHeight: 1.6, marginBottom: 16 }}>
                        {anonMode
                          ? 'Une fois envoyé, ton dossier sera examiné par l\'équipe LIVEINBLACK. Tu seras contacté par email dès validation.'
                          : 'Une fois soumis, ton dossier sera examiné par l\'équipe LIVEINBLACK. Tu peux suivre l\'avancement dans Mon Dossier.'}
                      </p>
                      <div style={{ marginBottom: 14 }}>
                        <p style={{ fontFamily: DM, fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
                          Message pour l'équipe (optionnel)
                        </p>
                        <textarea
                          value={candidateNote}
                          onChange={e => setCandidateNote(e.target.value)}
                          placeholder={app?.status === 'needs_changes'
                            ? 'Ex : J\'ai mis à jour les documents demandés et corrigé les informations...'
                            : 'Ex : Bonjour, voici mon dossier prestataire. Je suis disponible pour tout complément...'}
                          style={{
                            width: '100%', boxSizing: 'border-box',
                            background: 'rgba(8,10,20,0.6)',
                            border: '1px solid rgba(255,255,255,0.10)',
                            borderRadius: 6, color: '#fff',
                            fontFamily: DM, fontSize: 11,
                            padding: '9px 12px', outline: 'none', resize: 'vertical',
                            minHeight: 64, lineHeight: 1.5,
                          }}
                        />
                      </div>
                    </>
                  )}
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || !canSubmit}
                    style={{ ...S.btnGold, opacity: (submitting || !canSubmit) ? 0.35 : 1, cursor: !canSubmit ? 'not-allowed' : 'pointer', marginTop: canSubmit ? 0 : 12 }}
                  >
                    {submitting ? 'Envoi en cours...' : anonMode ? 'Envoyer ma demande' : 'Soumettre mon dossier'}
                  </button>
                </div>
              )
            })()}
          </div>
        )}

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
    </Layout>
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
      <span style={{ fontSize: 14, flexShrink: 0 }}>{failed ? '⚠' : '📄'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          fontFamily: "'DM Mono', monospace", fontSize: 10,
          color: failed ? 'rgba(224,90,170,0.9)' : 'rgba(255,255,255,0.8)',
          display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {file.name}
        </span>
        <span style={{
          fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: '0.04em',
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
            fontFamily: "'DM Mono', monospace", fontSize: 11, margin: 0, letterSpacing: '0.03em',
            color: hasFiles ? '#fff' : missing ? '#e05aaa' : 'rgba(255,255,255,0.6)',
            fontWeight: hasFiles ? 500 : 400,
          }}>
            {label}
            {required && <span style={{ color: '#e05aaa', marginLeft: 4 }}>*</span>}
          </p>
          <p style={{
            fontFamily: "'DM Mono', monospace", fontSize: 9, margin: '3px 0 0',
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
            fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
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
