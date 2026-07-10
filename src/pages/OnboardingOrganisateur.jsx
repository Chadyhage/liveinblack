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

const DM = "Inter, sans-serif"
const CG = "Inter, sans-serif"
const GOLD = '#c8a96e'

const S = {
  page:    { position: 'relative', zIndex: 1, padding: '32px 18px 16px', maxWidth: 600, margin: '0 auto' },
  card:    { background: '#12131c', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 16, padding: '28px 26px', boxShadow: '0 24px 64px rgba(0,0,0,0.55)' },
  label:   { fontFamily: DM, fontSize: 13, fontWeight: 600, letterSpacing: '0.01em', color: 'rgba(255,255,255,0.62)', display: 'block', marginBottom: 8, overflowWrap: 'break-word', wordBreak: 'break-word' },
  input:   { width: '100%', background: '#0b0c12', borderWidth: 1, borderStyle: 'solid', borderColor: 'rgba(255,255,255,0.12)', borderRadius: 12, fontFamily: DM, fontSize: 15, fontWeight: 500, color: 'rgba(255,255,255,0.92)', padding: '13px 15px', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.18s' },
  select:  { width: '100%', background: '#0b0c12', borderWidth: 1, borderStyle: 'solid', borderColor: 'rgba(255,255,255,0.12)', borderRadius: 12, fontFamily: DM, fontSize: 15, fontWeight: 500, color: 'rgba(255,255,255,0.92)', padding: '13px 15px', outline: 'none', boxSizing: 'border-box', appearance: 'none' },
  section: { fontFamily: DM, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: 22, paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.08)', overflowWrap: 'break-word', wordBreak: 'break-word' },
  btnGold: { width: '100%', padding: '15px 20px', background: 'linear-gradient(180deg, #8f56ff, #7a3bf2)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 12, fontFamily: DM, fontSize: 15, fontWeight: 700, letterSpacing: '0.01em', color: '#fff', cursor: 'pointer', boxShadow: '0 6px 20px rgba(122,59,242,0.35)' },
  btnGhost:{ width: '100%', padding: '15px 20px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 12, fontFamily: DM, fontSize: 14.5, fontWeight: 600, letterSpacing: '0.01em', color: 'rgba(255,255,255,0.9)', cursor: 'pointer' },
  error:   { fontFamily: DM, fontSize: 12, color: '#e05aaa', letterSpacing: '0.01em', marginTop: 6 },
}

const COUNTRY_CODES = DIAL_CODES

function PhoneInput({ codeField, numberField, formState, onUpdate, inputStyle, error, placeholder = '6 00 00 00 00' }) {
  const selected = COUNTRY_CODES.find(c => c.code === formState[codeField]) || COUNTRY_CODES[0]
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <select
        value={formState[codeField]}
        onChange={e => onUpdate(codeField, e.target.value)}
        style={{
          flexShrink: 0, width: 115,
          background: '#0b0c12',
          border: `1px solid ${error ? '#e05aaa' : 'rgba(255,255,255,0.12)'}`,
          borderRadius: 10, fontFamily: DM, fontSize: 13,
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

const TYPES_ETAB = ['Boîte / Club','Bar','Autre']

const STEPS = [
  { label: 'Établissement' },
  { label: 'Activité' },
  { label: 'Revenus' },
  { label: 'Documents' },
]

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

const ANON_DRAFT_KEY = 'lib_anon_org_draft_id'

export default function OnboardingOrganisateur() {
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
  // Documents gardés EN MÉMOIRE tant que le compte n'existe pas. Ils ne sont
  // uploadés vers Storage qu'à la soumission finale (après création du compte).
  // Forme : { [docKey]: [{ file, name, size }] }
  const [pendingDocs, setPendingDocs] = useState({})
  const [toast, setToast] = useState(null)
  const [successScreen, setSuccessScreen] = useState(false)

  // Anonymous mode state (used when no user logged in)
  const anonUidRef = useRef(null) // real Firebase uid once account is created
  const [regPassword, setRegPassword] = useState('')
  const [regPasswordConfirm, setRegPasswordConfirm] = useState('')
  const [showPwd, setShowPwd] = useState(false)

  const anonMode = !user

  // Form state — each section
  const [f, setF] = useState({
    // Step 0 — Entreprise
    nomCommercial: '', siret: '', noFixedAddress: false,
    adresseEtablissement: '', emailPro: '', telephoneProCode: '+33', telephonePro: '', siteWeb: '',
    // Step 1 — Activité
    typeEtablissement: '', typeEtablissementCustom: '', itinerant: false, ville: '', pays: 'France', zonesActivite: '', capacite: '',
    horaires: '', alcool: false, alcoolAtteste: false,
    description: '',
    // Step 3 — Revenus (informatif, pas de champs)
  })

  useEffect(() => {
    if (user) {
      // ── Logged-in mode (backwards compat) ──
      const existing = getApplicationByUser(user.uid, 'organisateur')
      if (existing) {
        setApp(existing)
        const fd = existing.formData || {}
        setF(prev => ({ ...prev, ...fd }))
        if (['submitted','under_review','approved'].includes(existing.status)) {
          navigate('/mon-dossier')
        }
      } else {
        const created = createApplication(user.uid, user.email, user.name, 'organisateur')
        setApp(created)
        // Pré-remplir avec les données transmises depuis MonDossierPage (recréation après suppression)
        const prefill = location.state?.prefill
        if (prefill) setF(prev => ({ ...prev, ...prefill }))
      }
    } else {
      // ── Anonymous mode — load or create temp draft ──
      const savedId = localStorage.getItem(ANON_DRAFT_KEY)
      const existing = savedId ? getApplicationById(savedId) : null
      if (existing) {
        setApp(existing)
        const fd = existing.formData || {}
        setF(prev => ({ ...prev, ...fd }))
        // Compte Firebase déjà créé lors d'une session précédente (uid réel != id
        // temporaire "anon-org-…") : restaurer la référence pour NE PAS retenter
        // createUserWithEmailAndPassword au rechargement (sinon "email déjà associé").
        if (existing.uid && !String(existing.uid).startsWith('anon-')) {
          anonUidRef.current = existing.uid
        }
      } else {
        const tempId = 'anon-org-' + Date.now()
        localStorage.setItem(ANON_DRAFT_KEY, tempId)
        const created = createApplication(tempId, '', '', 'organisateur')
        setApp(created)
      }
    }
  }, [user])

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function autoSave(patch) {
    if (!app) return
    const updated = { ...f, ...patch }
    setF(updated)
    saveDraft(app.id, updated)
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
      if (!f.nomCommercial.trim()) errs.nomCommercial = 'Requis'
      if (!f.emailPro.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.emailPro.trim())) errs.emailPro = 'Email invalide'
      if (!f.siret.trim()) errs.siret = 'Requis — indique 000000 si tu n\'as pas de numéro'
      else if (!isValidSiret(f.siret)) errs.siret = 'Numéro invalide : SIREN = 9 chiffres, SIRET = 14 chiffres (ou 000000 si aucun)'
      if (!f.telephonePro.trim()) errs.telephonePro = 'Requis'
      else if (!isValidPhone(f.telephoneProCode, f.telephonePro)) errs.telephonePro = 'Numéro invalide pour ce pays'
      if (!f.noFixedAddress && !f.adresseEtablissement.trim()) errs.adresseEtablissement = 'Requis (ou coche « Pas de lieu fixe »)'
      // Anonymous mode: cet email pro sert aussi de login → valider le mot de passe
      if (anonMode) {
        if (!regPassword || regPassword.length < 8) errs.regPassword = 'Au moins 8 caractères'
        if (!/[A-Z]/.test(regPassword)) errs.regPassword = 'Au moins une majuscule'
        if (regPassword !== regPasswordConfirm) errs.regPasswordConfirm = 'Les mots de passe ne correspondent pas'
      }
    }
    if (s === 1) {
      if (!f.typeEtablissement) errs.typeEtablissement = 'Requis'
      if (f.typeEtablissement === 'Autre' && !f.typeEtablissementCustom?.trim()) errs.typeEtablissementCustom = 'Précise le type'
      if (!f.itinerant && !f.ville.trim()) errs.ville = 'Requis (ou coche « Itinérant »)'
      if (f.itinerant && !f.zonesActivite.trim()) errs.zonesActivite = 'Sélectionne au moins un pays'
      if (f.alcool && !f.alcoolAtteste) errs.alcoolAtteste = 'Coche l\'attestation pour vendre de l\'alcool'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function next() {
    if (!validate(step)) return

    // Étape 0 (anonyme) : on NE crée AUCUN compte ici. On vérifie seulement que
    // l'email est libre (best-effort). Le compte n'est créé qu'à la soumission
    // finale — plus de comptes fantômes à moitié créés qui bloquent l'email.
    if (anonMode && step === 0) {
      setCreatingAccount(true)
      try {
        const { USE_REAL_FIREBASE } = await import('../firebase')
        if (USE_REAL_FIREBASE) {
          const { auth } = await import('../firebase')
          const { fetchSignInMethodsForEmail } = await import('firebase/auth')
          const methods = await fetchSignInMethodsForEmail(auth, f.emailPro.trim())
          if (methods && methods.length > 0) {
            setCreatingAccount(false)
            setErrors({ emailPro: 'Cet email est déjà associé à un compte. Connecte-toi à ce compte, puis débloque l\'interface organisateur depuis ton profil (menu « Mes interfaces » → Devenir organisateur). Pas besoin de créer un nouveau compte.', emailExists: true })
            return
          }
        }
      } catch { /* protection anti-énumération / hors-ligne : vérification finale à la soumission */ }
      setCreatingAccount(false)
      saveDraft(app.id, f)
    }

    setStep(s => Math.min(s + 1, STEPS.length - 1))
    window.scrollTo(0, 0)
  }

  function prev() {
    setStep(s => Math.max(s - 1, 0))
    window.scrollTo(0, 0)
  }

  // Sélection d'un document : on garde le File EN MÉMOIRE (pas d'upload tant que
  // le compte n'existe pas). L'upload réel se fait à la soumission.
  function handleUpload(docKey, file) {
    if (!file) return
    setPendingDocs(p => ({ ...p, [docKey]: [{ file, name: file.name, size: file.size }] }))
    setUploadStatus(s => ({ ...s, [docKey]: 'ready' }))
  }

  function handleRemove(docKey) {
    setPendingDocs(p => { const n = { ...p }; delete n[docKey]; return n })
    setUploadStatus(s => { const n = { ...s }; delete n[docKey]; return n })
  }

  async function handleSubmit() {
    if (!(pendingDocs.identity?.length)) {
      showToast('Document manquant : Pièce d\'identité', 'error')
      return
    }
    setSubmitting(true)
    try {
      const { USE_REAL_FIREBASE } = await import('../firebase')

      // 1) CRÉER le compte MAINTENANT (anonyme uniquement — un utilisateur
      //    connecté a déjà son compte). C'est la seule création de compte.
      if (anonMode) {
        const name = f.nomCommercial.trim()
        const phone = f.telephonePro || ''
        const loginEmail = f.emailPro.trim()
        if (USE_REAL_FIREBASE) {
          const { createUserWithEmailAndPassword } = await import('firebase/auth')
          const { auth, db } = await import('../firebase')
          const { doc, setDoc } = await import('firebase/firestore')
          let cred
          try {
            cred = await createUserWithEmailAndPassword(auth, loginEmail, regPassword)
          } catch (e) {
            setSubmitting(false)
            if (e.code === 'auth/email-already-in-use') {
              setStep(0)
              setErrors({ emailPro: 'Cet email est déjà associé à un compte. Connecte-toi à ce compte pour continuer.', emailExists: true })
              showToast('Email déjà associé à un compte', 'error')
            } else {
              showToast('Création du compte impossible — réessaie.', 'error')
            }
            return
          }
          const uid = cred.user.uid
          await setDoc(doc(db, 'users', uid), {
            uid, email: loginEmail, name, phone,
            role: 'client', activeRole: 'client', enabledRoles: ['client'],
            status: 'draft', emailVerified: false, createdAt: Date.now(),
          })
          updateApplication(app.id, { uid, email: loginEmail, name })
          setApp(prev => ({ ...prev, uid, email: loginEmail, name }))
        } else {
          const uid = 'local-org-' + Date.now()
          const { saveAccount } = await import('../utils/accounts')
          saveAccount({ uid, email: loginEmail, name, phone, role: 'organisateur', status: 'draft', emailVerified: false, createdAt: Date.now() })
          updateApplication(app.id, { uid, email: loginEmail, name })
          setApp(prev => ({ ...prev, uid, email: loginEmail, name }))
        }
      }

      // 2) Uploader les documents gardés en mémoire (maintenant authentifié)
      for (const [docKey, entries] of Object.entries(pendingDocs)) {
        for (const entry of entries) {
          setUploadStatus(s => ({ ...s, [docKey]: 'uploading' }))
          const res = await uploadDocument(app.id, docKey, entry.file)
          if (!res.ok) {
            setSubmitting(false)
            setUploadStatus(s => ({ ...s, [docKey]: 'error' }))
            showToast(`Échec de l'envoi : ${DOCUMENT_LABELS[docKey]?.label || docKey}. Réessaie.`, 'error')
            return
          }
          setUploadStatus(s => ({ ...s, [docKey]: 'done' }))
        }
      }

      const result = await submitApplication(app.id, f, candidateNote)
      setApp(result)

      // Email d'accusé de réception (best-effort) — envoyé AVANT le signOut
      // anonMode ci-dessous (l'endpoint exige un token Firebase valide).
      try {
        const { authHeaders } = await import('../utils/apiAuth')
        await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
          body: JSON.stringify({ appId: app.id, type: 'application_received' }),
        })
      } catch {}

      if (anonMode) {
        // Sign out immediately — no access until admin validates
        try {
          const { USE_REAL_FIREBASE } = await import('../firebase')
          if (USE_REAL_FIREBASE) {
            const { auth } = await import('../firebase')
            const { signOut } = await import('firebase/auth')
            await signOut(auth)
          }
        } catch {}
        // Clear the anon draft reference
        localStorage.removeItem(ANON_DRAFT_KEY)
        setSuccessScreen(true)
      } else {
        showToast('Dossier envoyé.')
        setTimeout(() => navigate('/mon-dossier'), 1500)
      }
    } catch {
      showToast('L\'envoi du dossier a échoué. Réessaie.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (!app) return null

  // ── Success screen (anonymous mode after submit) ──
  if (successScreen) {
    return (
      <PublicShell>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ textAlign: 'center', maxWidth: 420 }}>
            <div style={{ width: 68, height: 68, borderRadius: '50%', margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(78,232,200,0.12)', border: '1px solid rgba(78,232,200,0.4)' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#4ee8c8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h2 style={{ fontFamily: CG, fontWeight: 800, fontSize: 24, color: 'rgba(255,255,255,0.93)', margin: '0 0 16px' }}>
              Demande envoyée
            </h2>
            <p style={{ fontFamily: DM, fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, marginBottom: 8 }}>
              Ton dossier a été transmis à l'équipe LIVEINBLACK.
            </p>
            <p style={{ fontFamily: DM, fontSize: 13.5, color: GOLD, lineHeight: 1.7, marginBottom: 24 }}>
              Tu seras contacté à <strong>{f.emailPro}</strong> une fois ton compte validé.
            </p>
            <p style={{ fontFamily: DM, fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7, marginBottom: 32 }}>
              La validation prend généralement moins de 24 h. Tu recevras un email dès que ton espace est activé.
            </p>
            <button onClick={() => navigate('/accueil')} style={{ ...S.btnGold, maxWidth: 240, margin: '0 auto' }}>
              Retour à l'accueil
            </button>
          </div>
        </div>
      </PublicShell>
    )
  }

  const requiredDocs = getRequiredDocs('organisateur')
  const uploadedDocs = Object.keys(app.documents || {})

  return (
    <PublicShell>
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
            <span style={{ width: 28, height: 2, borderRadius: 2, background: GOLD, flexShrink: 0, display: 'block' }} />
            <span style={{ fontFamily: DM, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: GOLD }}>
              Demande d'espace
            </span>
          </div>
          <h1 style={{ fontFamily: CG, fontWeight: 800, fontSize: 'clamp(2rem,8vw,3rem)', letterSpacing: '-1px', color: '#fff', margin: 0, lineHeight: 1.05 }}>
            Compte Organisateur
          </h1>
          <p style={{ fontFamily: DM, fontSize: 14, color: 'rgba(255,255,255,0.5)', marginTop: 10, lineHeight: 1.6 }}>
            Complète ton dossier. Tu peux sauvegarder et revenir plus tard.
          </p>
          {anonMode && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Commencer une nouvelle demande ? Le brouillon en cours sera effacé.')) {
                  localStorage.removeItem(ANON_DRAFT_KEY)
                  window.location.reload()
                }
              }}
              style={{ marginTop: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: DM, fontSize: 11.5, color: 'rgba(255,255,255,0.5)', textDecoration: 'underline' }}
            >
              Commencer une nouvelle demande
            </button>
          )}
        </div>

        {/* Progress bar — étapes numérotées (style pro, sans emoji) */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            {STEPS.map((s, i) => {
              const done = i < step
              const active = i === step
              return (
                <button key={i} onClick={() => i < step && setStep(i)} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
                  background: 'none', border: 'none', cursor: i < step ? 'pointer' : 'default',
                  flex: 1, padding: 0,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', fontSize: 14, fontFamily: DM, fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: active ? GOLD : done ? '#4ee8c8' : 'rgba(255,255,255,0.35)',
                    background: active ? 'rgba(200,169,110,0.16)' : done ? 'rgba(78,232,200,0.12)' : 'rgba(255,255,255,0.04)',
                    border: active ? '1px solid rgba(200,169,110,0.55)' : done ? '1px solid rgba(78,232,200,0.45)' : '1px solid rgba(255,255,255,0.10)',
                    transition: 'all 0.25s',
                    boxShadow: active ? '0 0 0 4px rgba(200,169,110,0.08)' : 'none',
                  }}>
                    {done ? (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ee8c8" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    ) : i + 1}
                  </div>
                  <span style={{
                    fontFamily: DM, fontSize: 11, fontWeight: 600, letterSpacing: '0.02em',
                    color: active ? GOLD : done ? 'rgba(78,232,200,0.8)' : 'rgba(255,255,255,0.4)',
                    textAlign: 'center', whiteSpace: 'nowrap',
                  }}>
                    {s.label}
                  </span>
                </button>
              )
            })}
          </div>
          <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 99, background: GOLD, width: `${(step / (STEPS.length - 1)) * 100}%`, transition: 'width 0.4s' }} />
          </div>
        </div>

        {/* ── STEP 0: Entreprise ── */}
        {step === 0 && (
          <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={S.section}>Informations de l'établissement</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

              {/* Nom commercial */}
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Nom de l'établissement / commercial" required>
                  <input style={{ ...S.input, borderColor: errors.nomCommercial ? '#e05aaa' : undefined }} value={f.nomCommercial} onChange={e => update('nomCommercial', e.target.value)} placeholder="Ex : Club Neon, L|VE Events…" />
                  {errors.nomCommercial && <p style={S.error}>{errors.nomCommercial}</p>}
                </Field>
              </div>

              {/* Numéro SIRET/SIREN — pleine largeur + note 000.000 */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={S.label}>
                  Numéro SIRET / SIREN
                  <span style={{ color: 'rgba(255,255,255,0.45)', marginLeft: 6 }}>
                    — si pas de numéro, indique <span style={{ color: GOLD }}>000000</span>
                  </span>
                </label>
                <input
                  style={{ ...S.input, borderColor: errors.siret ? '#e05aaa' : undefined }}
                  value={f.siret}
                  onChange={e => update('siret', formatSiret(e.target.value))}
                  inputMode="numeric"
                  placeholder="9 chiffres (SIREN) ou 14 (SIRET) — ou 000000"
                />
                {errors.siret && <p style={S.error}>{errors.siret}</p>}
              </div>

              {/* Email + Téléphone */}
              <Field label="Email professionnel" required>
                <input type="email" style={{ ...S.input, borderColor: errors.emailPro ? '#e05aaa' : undefined }} value={f.emailPro} onChange={e => update('emailPro', e.target.value)} placeholder="contact@monclub.fr" disabled={anonMode && !!anonUidRef.current} />
                {errors.emailPro && <p style={S.error}>{errors.emailPro}</p>}
                {errors.emailExists && (
                  <button type="button" onClick={() => navigate('/connexion')} style={{
                    marginTop: 8, padding: '11px 14px', width: '100%', cursor: 'pointer',
                    background: '#3ed6b5', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 10,
                    fontFamily: DM, fontSize: 13, fontWeight: 700, color: '#04120e',
                  }}>Se connecter à ce compte</button>
                )}
                {anonMode && !errors.emailExists && (
                  anonUidRef.current
                    ? <p style={{ fontFamily: DM, fontSize: 11, color: 'rgba(78,232,200,0.75)', marginTop: 4 }}>Compte créé — cet email te sert d'identifiant de connexion (non modifiable).</p>
                    : <p style={{ fontFamily: DM, fontSize: 11, color: 'rgba(200,169,110,0.8)', marginTop: 4 }}>Cet email te servira aussi à te connecter à ton espace.</p>
                )}
              </Field>
              <Field label="Téléphone professionnel" required>
                <PhoneInput codeField="telephoneProCode" numberField="telephonePro" formState={f} onUpdate={update} inputStyle={S.input} error={errors.telephonePro} />
                {errors.telephonePro && <p style={S.error}>{errors.telephonePro}</p>}
              </Field>

              {/* Adresse de l'établissement + case "Pas de lieu fixe" */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={S.label}>Adresse de l'établissement — lieu principal{!f.noFixedAddress && <span style={{ color: '#e05aaa' }}> *</span>}</label>

                {/* Checkbox pas de lieu fixe */}
                <div
                  onClick={() => update('noFixedAddress', !f.noFixedAddress)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, cursor: 'pointer', userSelect: 'none' }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                    border: `1.5px solid ${f.noFixedAddress ? '#4ee8c8' : 'rgba(255,255,255,0.20)'}`,
                    background: f.noFixedAddress ? 'rgba(78,232,200,0.15)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.2s',
                  }}>
                    {f.noFixedAddress && (
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                        <polyline points="2,6 5,9 10,3" stroke="#4ee8c8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <span style={{ fontFamily: DM, fontSize: 12.5, color: f.noFixedAddress ? '#4ee8c8' : 'rgba(255,255,255,0.55)' }}>
                    Pas de lieu fixe (établissement en ligne / itinérant)
                  </span>
                </div>

                {!f.noFixedAddress ? (
                  <>
                    <input
                      style={{ ...S.input, borderColor: errors.adresseEtablissement ? '#e05aaa' : undefined }}
                      value={f.adresseEtablissement}
                      onChange={e => update('adresseEtablissement', e.target.value)}
                      placeholder="Adresse complète de l'établissement"
                    />
                    {errors.adresseEtablissement && <p style={S.error}>{errors.adresseEtablissement}</p>}
                  </>
                ) : (
                  <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderLeft: '3px solid rgba(78,232,200,0.55)', borderRadius: 10 }}>
                    <span style={{ fontFamily: DM, fontSize: 12.5, color: 'rgba(255,255,255,0.6)' }}>
                      Aucune adresse physique — établissement dématérialisé ou sans lieu fixe.
                    </span>
                  </div>
                )}
              </div>

              {/* Site web */}
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Site web / Instagram (optionnel)">
                  <input style={S.input} value={f.siteWeb} onChange={e => update('siteWeb', e.target.value)} placeholder="https://… ou @nom" />
                </Field>
              </div>
            </div>

            {/* ── Mot de passe (mode anonyme, avant création du compte) ── */}
            {anonMode && !anonUidRef.current && (
              <>
                <p style={{ ...S.section, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  Mot de passe
                </p>
                <p style={{ fontFamily: DM, fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, margin: '-4px 0 8px' }}>
                  Tu te connecteras avec l'<strong style={{ color: 'rgba(200,169,110,0.8)' }}>email professionnel</strong> ci-dessus. Choisis un mot de passe pour accéder à ton espace une fois le dossier validé.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
                          <button type="button" onClick={() => setShowPwd(p => !p)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: DM, fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.55)' }}>
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

        {/* ── STEP 1: Activité ── */}
        {step === 1 && (
          <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={S.section}>Description de l'activité</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Type d'établissement" required>
                  <select
                    style={{ ...S.select, borderColor: errors.typeEtablissement ? '#e05aaa' : undefined }}
                    value={f.typeEtablissement}
                    onChange={e => update('typeEtablissement', e.target.value)}
                  >
                    <option value="">Sélectionner…</option>
                    {TYPES_ETAB.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                  {errors.typeEtablissement && <p style={S.error}>{errors.typeEtablissement}</p>}
                </Field>

                {/* Champ libre si "Autre" sélectionné */}
                {f.typeEtablissement === 'Autre' && (
                  <input
                    style={{ ...S.input, marginTop: 8, borderColor: errors.typeEtablissementCustom ? '#e05aaa' : undefined }}
                    placeholder="Précise le type d'établissement…"
                    value={f.typeEtablissementCustom || ''}
                    onChange={e => update('typeEtablissementCustom', e.target.value)}
                    autoFocus
                  />
                )}
              </div>
              {/* Ville / Pays — ou itinérant */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={S.label}>
                  Localisation principale<span style={{ color: '#e05aaa' }}> *</span>
                </label>

                {/* Toggle itinérant */}
                <div
                  onClick={() => update('itinerant', !f.itinerant)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, cursor: 'pointer', userSelect: 'none' }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                    border: `1.5px solid ${f.itinerant ? '#4ee8c8' : 'rgba(255,255,255,0.20)'}`,
                    background: f.itinerant ? 'rgba(78,232,200,0.15)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.2s',
                  }}>
                    {f.itinerant && (
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                        <polyline points="2,6 5,9 10,3" stroke="#4ee8c8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <span style={{ fontFamily: DM, fontSize: 12.5, color: f.itinerant ? '#4ee8c8' : 'rgba(255,255,255,0.55)' }}>
                    Itinérant — j'organise dans plusieurs villes / pays
                  </span>
                </div>

                {f.itinerant ? (
                  <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {regions.map(region => {
                        const selectedZones = f.zonesActivite.split(',').map(s => s.trim()).filter(Boolean)
                        const isSel = selectedZones.includes(region.name)
                        return (
                          <button
                            type="button"
                            key={region.id}
                            onClick={() => {
                              const next = isSel
                                ? selectedZones.filter(n => n !== region.name)
                                : [...selectedZones, region.name]
                              update('zonesActivite', next.join(', '))
                            }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer',
                              padding: '9px 14px', borderRadius: 8, transition: 'all 0.15s',
                              border: `1.5px solid ${isSel ? '#4ee8c8' : 'rgba(255,255,255,0.12)'}`,
                              background: isSel ? 'rgba(78,232,200,0.12)' : 'transparent',
                              fontFamily: DM, fontSize: 12, color: isSel ? '#4ee8c8' : 'rgba(255,255,255,0.6)',
                            }}>
                            <span style={{ fontSize: 15 }}>{region.flag}</span>
                            {region.name}
                            {isSel && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 2, flexShrink: 0 }}><polyline points="20 6 9 17 4 12" /></svg>}
                          </button>
                        )
                      })}
                    </div>
                    {errors.zonesActivite && <p style={S.error}>{errors.zonesActivite}</p>}
                    <p style={{ fontFamily: DM, fontSize: 11.5, color: 'rgba(255,255,255,0.45)', margin: '8px 0 0' }}>
                      Sélectionne les pays où tu organises (plusieurs possibles).
                    </p>
                  </>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <input
                        style={{ ...S.input, borderColor: errors.ville ? '#e05aaa' : undefined }}
                        value={f.ville}
                        onChange={e => update('ville', e.target.value)}
                        placeholder="Paris"
                      />
                      {errors.ville && <p style={S.error}>{errors.ville}</p>}
                    </div>
                    <select style={S.select} value={f.pays} onChange={e => update('pays', e.target.value)}>
                      {regions.map(region => <option key={region.id} value={region.name}>{region.flag} {region.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
              {!f.itinerant && (
                <>
                  <Field label="Capacité d'accueil déclarée">
                    <input type="number" style={S.input} value={f.capacite} onChange={e => update('capacite', e.target.value)} placeholder="Ex : 500" min={0} />
                  </Field>
                  <Field label="Horaires habituels">
                    <input style={S.input} value={f.horaires} onChange={e => update('horaires', e.target.value)} placeholder="Ex : Ven-Sam 23h-07h" />
                  </Field>
                </>
              )}
              <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Toggle value={f.alcool} onChange={v => update('alcool', v)} label="Alcool vendu sur place" />
                {f.alcool && (
                  <div style={{ marginTop: 6, marginLeft: 46, padding: '12px 14px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${errors.alcoolAtteste ? '#e05aaa' : 'rgba(255,255,255,0.07)'}`, borderLeft: `3px solid ${errors.alcoolAtteste ? '#e05aaa' : 'rgba(200,169,110,0.55)'}`, borderRadius: 10 }}>
                    <p style={{ fontFamily: DM, fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, margin: '0 0 10px' }}>
                      La vente d'alcool est soumise à la réglementation de ton pays (licence, autorisations, âge légal). Cette responsabilité t'incombe entièrement — LIVEINBLACK n'est pas responsable de la conformité de ton activité.
                    </p>
                    <div
                      onClick={() => update('alcoolAtteste', !f.alcoolAtteste)}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', userSelect: 'none' }}
                    >
                      <div style={{
                        width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 1,
                        border: `1.5px solid ${f.alcoolAtteste ? '#4ee8c8' : 'rgba(255,255,255,0.25)'}`,
                        background: f.alcoolAtteste ? 'rgba(78,232,200,0.15)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s',
                      }}>
                        {f.alcoolAtteste && (
                          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                            <polyline points="2,6 5,9 10,3" stroke="#4ee8c8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <span style={{ fontFamily: DM, fontSize: 12.5, color: f.alcoolAtteste ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
                        J'atteste respecter la réglementation locale sur la vente d'alcool et en assumer l'entière responsabilité.
                      </span>
                    </div>
                    {errors.alcoolAtteste && <p style={{ ...S.error, margin: '6px 0 0 28px' }}>{errors.alcoolAtteste}</p>}
                    <p style={{ fontFamily: DM, fontSize: 11.5, color: 'rgba(255,255,255,0.45)', margin: '8px 0 0 28px' }}>
                      Facultatif : tu pourras joindre un justificatif à l'étape Documents si tu en as un.
                    </p>
                  </div>
                )}
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Description courte de l'activité">
                  <textarea style={{ ...S.input, minHeight: 80, resize: 'vertical' }} value={f.description} onChange={e => update('description', e.target.value)} placeholder="Décris en quelques lignes ton activité, ton public, l'ambiance…" />
                </Field>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2: Revenus ── */}
        {step === 2 && (
          <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <p style={S.section}>Tes revenus</p>

            {/* Explication principale */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontFamily: CG, fontSize: 18, fontWeight: 700, color: 'rgba(255,255,255,0.93)', margin: 0 }}>
                Comment tu seras payé
              </p>
              <p style={{ fontFamily: DM, fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, margin: 0 }}>
                LIVEINBLACK collecte les paiements de tes billets et te reverse ta part directement sur ton compte bancaire.
                Les reversements sont gérés de façon entièrement automatique — tu n'as rien à faire manuellement.
              </p>
            </div>

            {/* 3 étapes visuelles */}
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
                desc: 'À chaque vente de billet, ta part (après commission LIVEINBLACK) est automatiquement virée sur ton compte dans les 2–7 jours ouvrés.',
                color: '#8444ff',
              },
            ].map(s => (
              <div key={s.num} style={{ display: 'flex', gap: 14, padding: '14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12 }}>
                <div style={{ fontFamily: DM, fontSize: 20, fontWeight: 700, color: s.color, opacity: 0.6, flexShrink: 0, lineHeight: 1, paddingTop: 2 }}>
                  {s.num}
                </div>
                <div>
                  <p style={{ fontFamily: DM, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.9)', margin: '0 0 5px' }}>{s.title}</p>
                  <p style={{ fontFamily: DM, fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: 0, lineHeight: 1.6 }}>{s.desc}</p>
                </div>
              </div>
            ))}

            {/* Note sécurité */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderLeft: '3px solid rgba(78,232,200,0.55)', borderRadius: 10 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4ee8c8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              <p style={{ fontFamily: DM, fontSize: 12, color: 'rgba(255,255,255,0.55)', margin: 0, lineHeight: 1.6 }}>
                Tes coordonnées bancaires ne transitent jamais par LIVEINBLACK. Stripe est certifié PCI-DSS niveau 1 (la norme de sécurité bancaire la plus élevée).
              </p>
            </div>

            <p style={{ fontFamily: DM, fontSize: 11.5, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
              Aucune information bancaire n'est demandée ici — tu configureras tout après approbation.
            </p>
          </div>
        )}

        {/* ── STEP 3: Documents ── */}
        {step === 3 && (
          <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={S.section}>Documents justificatifs</p>
            <p style={{ fontFamily: DM, fontSize: 12.5, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, margin: 0 }}>
              Ces documents nous permettent de vérifier ton identité et la légitimité de ton activité.
              Ils sont stockés de façon privée et accessibles uniquement à l'équipe LIVEINBLACK.
            </p>

            {/* ── Obligatoire : pièce d'identité ── */}
            <DocUploadRow
              label="Pièce d'identité"
              required
              files={pendingDocs.identity || []}
              status={uploadStatus.identity}
              onChange={file => handleUpload('identity', file)}
              onRemove={() => handleRemove('identity')}
            />

            {/* ── Optionnel : document officiel entreprise ── */}
            <DocUploadRow
              label="Document officiel de l'entreprise (KBIS, statuts, récépissé INSEE…)"
              required={false}
              files={pendingDocs.business_doc || []}
              status={uploadStatus.business_doc}
              onChange={file => handleUpload('business_doc', file)}
              onRemove={() => handleRemove('business_doc')}
            />

            {/* ── Conditionnel : alcool (justificatif FACULTATIF) ── */}
            {f.alcool && (
              <DocUploadRow
                label="Licence / Justificatif de débit de boissons (facultatif)"
                files={pendingDocs.alcohol_license || []}
                status={uploadStatus.alcohol_license}
                onChange={file => handleUpload('alcohol_license', file)}
                onRemove={() => handleRemove('alcohol_license')}
              />
            )}

            {/* Submit section */}
            {(() => {
              const missing = []
              if (!(pendingDocs.identity?.length))             missing.push('Pièce d\'identité')
              const canSubmit = missing.length === 0
              return (
                <div style={{ marginTop: 8, padding: '16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderLeft: `3px solid ${canSubmit ? 'rgba(200,169,110,0.55)' : 'rgba(224,90,170,0.55)'}`, borderRadius: 12 }}>
                  {!canSubmit ? (
                    <>
                      <p style={{ fontFamily: DM, fontSize: 11, fontWeight: 700, color: '#e05aaa', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                        Documents requis manquants
                      </p>
                      {missing.map(d => (
                        <p key={d} style={{ fontFamily: DM, fontSize: 12, color: 'rgba(224,90,170,0.85)', margin: '0 0 4px' }}>
                          {d}
                        </p>
                      ))}
                      <p style={{ fontFamily: DM, fontSize: 11.5, color: 'rgba(255,255,255,0.45)', margin: '10px 0 0', lineHeight: 1.6 }}>
                        Ajoute les documents requis ci-dessus pour pouvoir envoyer ton dossier.
                      </p>
                    </>
                  ) : (
                    <>
                      <p style={{ fontFamily: DM, fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Prêt à envoyer</p>
                      <p style={{ fontFamily: DM, fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, marginBottom: 16 }}>
                        {anonMode
                          ? 'Une fois envoyé, ton dossier sera examiné par l\'équipe LIVEINBLACK. Tu seras contacté par email dès validation.'
                          : 'Une fois soumis, ton dossier sera examiné par l\'équipe LIVEINBLACK. Tu peux suivre l\'avancement dans Mon Dossier.'}
                      </p>
                      {/* Note optionnelle pour l'équipe */}
                      <div style={{ marginBottom: 14 }}>
                        <p style={{ fontFamily: DM, fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 }}>
                          Message pour l'équipe (optionnel)
                        </p>
                        <textarea
                          value={candidateNote}
                          onChange={e => setCandidateNote(e.target.value)}
                          placeholder={app?.status === 'needs_changes'
                            ? 'Ex : J\'ai mis à jour la pièce d\'identité et complété le SIRET…'
                            : 'Ex : Bonjour, voici mon dossier. N\'hésitez pas à me contacter si vous avez des questions…'}
                          style={{
                            width: '100%', boxSizing: 'border-box',
                            background: '#0b0c12',
                            border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: 10, color: 'rgba(255,255,255,0.92)',
                            fontFamily: DM, fontSize: 13,
                            padding: '10px 12px', outline: 'none', resize: 'vertical',
                            minHeight: 64, lineHeight: 1.5,
                          }}
                        />
                      </div>
                    </>
                  )}
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || !canSubmit}
                    style={(submitting || !canSubmit)
                      ? { ...S.btnGold, background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.06)', boxShadow: 'none', cursor: 'not-allowed', marginTop: canSubmit ? 0 : 12 }
                      : { ...S.btnGold, marginTop: 0 }}
                  >
                    {submitting ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, justifyContent: 'center' }}>
                        <span className="lib-spin" style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block' }} />
                        Envoi…
                      </span>
                    ) : anonMode ? 'Envoyer ma demande' : 'Soumettre mon dossier'}
                  </button>
                </div>
              )
            })()}
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          {step > 0 && (
            <button onClick={prev} disabled={creatingAccount || submitting} style={{ ...S.btnGhost, flex: 1 }}>Retour</button>
          )}
          {step < STEPS.length - 1 && (
            <button onClick={next} disabled={creatingAccount} style={{ ...S.btnGold, flex: 2 }}>
              {creatingAccount ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, justifyContent: 'center' }}>
                  <span className="lib-spin" style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block' }} />
                  Vérification…
                </span>
              ) : 'Continuer'}
            </button>
          )}
        </div>

        <p style={{ fontFamily: DM, fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 12, letterSpacing: '0.02em' }}>
          {anonMode ? 'Brouillon enregistré sur cet appareil' : 'Sauvegarde automatique activée'}
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 100,
          padding: '12px 20px', borderRadius: 12, background: 'rgba(12,12,22,0.96)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
          fontFamily: DM, fontSize: 13, fontWeight: 600, color: '#fff',
          ...(toast.type === 'error'
            ? { border: '1px solid rgba(224,90,170,0.5)' }
            : { border: '1px solid rgba(78,232,200,0.5)' }),
        }}>
          {toast.msg}
        </div>
      )}
    </PublicShell>
  )
}

// ── File row (inside DocUploadRow list) ──────────────────────────────────────
function FileRow({ file, onRemove }) {
  // Fichier gardé en mémoire (avant soumission) : possède `file` mais pas d'`url`
  // — ce n'est PAS un échec, il sera uploadé à la soumission.
  const pending = !!file.file && !file.url
  const failed = !file.url && !file.file
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
          fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 500,
          color: failed ? 'rgba(224,90,170,0.9)' : 'rgba(255,255,255,0.85)',
          display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {file.name}
        </span>
        <span style={{
          fontFamily: "Inter, sans-serif", fontSize: 10.5,
          color: failed ? 'rgba(224,90,170,0.7)' : 'rgba(255,255,255,0.45)',
        }}>
          {failed
            ? 'Envoi échoué — retire ce fichier puis ajoute-le à nouveau'
            : (() => {
                const size = file.size != null
                  ? file.size < 1024 * 1024
                    ? `${(file.size / 1024).toFixed(0)} Ko`
                    : `${(file.size / (1024 * 1024)).toFixed(1)} Mo`
                  : ''
                return pending ? `${size}${size ? ' · ' : ''}prêt à envoyer` : size
              })()}
        </span>
      </div>
      <button
        onClick={onRemove}
        style={{
          background: 'rgba(224,90,170,0.14)', border: '1px solid rgba(224,90,170,0.55)',
          cursor: 'pointer', color: '#fff', lineHeight: 0,
          padding: '5px 7px', borderRadius: 8, flexShrink: 0,
        }}
        title="Retirer ce fichier"
      ><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
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
    : missing ? 'rgba(224,90,170,0.04)' : 'rgba(255,255,255,0.04)'
  const iconColor = hasFiles ? '#4ee8c8' : missing ? '#e05aaa' : 'rgba(255,255,255,0.25)'
  const btnColor  = hasFiles ? 'rgba(78,232,200,0.7)' : missing ? '#e05aaa' : 'rgba(200,169,110,0.7)'
  const btnBorder = hasFiles ? 'rgba(78,232,200,0.3)' : missing ? 'rgba(224,90,170,0.4)' : 'rgba(200,169,110,0.3)'

  return (
    <div style={{
      borderRadius: 10, marginBottom: 12, overflow: 'hidden',
      border: `1px solid ${borderColor}`,
      background: bgColor,
    }}>
      {/* ─ Header ─ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 16px' }}>
        {/* Icon */}
        <div style={{
          width: 40, height: 40, borderRadius: 8, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, fontWeight: 700,
          background: hasFiles ? 'rgba(78,232,200,0.10)' : missing ? 'rgba(224,90,170,0.10)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${borderColor}`,
          color: iconColor,
        }}>
          {isUploading ? (
            <span className="lib-spin" style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.25)', borderTopColor: 'currentColor', borderRadius: '50%', display: 'inline-block' }} />
          ) : hasFiles ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          ) : missing ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
          )}
        </div>

        {/* Label + status */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontFamily: DM, fontSize: 13, margin: 0,
            color: hasFiles ? '#fff' : missing ? '#e05aaa' : 'rgba(255,255,255,0.7)',
            fontWeight: hasFiles ? 600 : 500,
          }}>
            {label}
            {required && <span style={{ color: '#e05aaa', marginLeft: 4 }}>*</span>}
          </p>
          <p style={{
            fontFamily: DM, fontSize: 11, margin: '3px 0 0',
            color: hasFiles
              ? 'rgba(78,232,200,0.75)'
              : missing ? 'rgba(224,90,170,0.75)' : 'rgba(255,255,255,0.45)',
          }}>
            {isUploading
              ? 'Enregistrement en cours…'
              : hasFiles
                ? `${files.length} fichier${files.length > 1 ? 's' : ''} ajouté${files.length > 1 ? 's' : ''}`
                : missing ? 'Obligatoire — aucun fichier' : 'Optionnel'}
          </p>
        </div>

        {/* Add button */}
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
            fontFamily: DM, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
            padding: '8px 14px', borderRadius: 10,
            color: isUploading ? 'rgba(255,255,255,0.35)' : btnColor,
            border: `1px solid ${isUploading ? 'rgba(255,255,255,0.06)' : btnBorder}`,
            background: isUploading ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.06)',
            whiteSpace: 'nowrap',
          }}>
            {isUploading ? 'Envoi…' : hasFiles ? 'Ajouter' : 'Choisir'}
          </span>
        </label>
      </div>

      {/* ─ File list ─ */}
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
