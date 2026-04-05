import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import {
  createApplication, saveDraft, submitApplication,
  uploadDocument, getApplicationByUser, DOCUMENT_LABELS, getRequiredDocs,
} from '../utils/applications'

const DM = "'DM Mono', monospace"
const CG = "'Cormorant Garamond', serif"
const GOLD = '#c8a96e'

const S = {
  page:    { position: 'relative', zIndex: 1, padding: '24px 16px 8px', maxWidth: 560, margin: '0 auto' },
  card:    { background: 'rgba(8,10,20,0.55)', backdropFilter: 'blur(22px)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12, padding: '20px 20px' },
  label:   { fontFamily: DM, fontSize: 9, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', display: 'block', marginBottom: 6 },
  input:   { width: '100%', background: 'rgba(6,8,16,0.7)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 4, fontFamily: DM, fontSize: 12, color: 'rgba(255,255,255,0.9)', padding: '10px 12px', outline: 'none', boxSizing: 'border-box' },
  select:  { width: '100%', background: 'rgba(6,8,16,0.7)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 4, fontFamily: DM, fontSize: 12, color: 'rgba(255,255,255,0.9)', padding: '10px 12px', outline: 'none', boxSizing: 'border-box', appearance: 'none' },
  section: { fontFamily: DM, fontSize: 8, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)', marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.05)' },
  btnGold: { width: '100%', padding: '13px', background: 'linear-gradient(135deg,rgba(200,169,110,0.22),rgba(200,169,110,0.06))', border: '1px solid rgba(200,169,110,0.45)', borderRadius: 4, fontFamily: DM, fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: GOLD, cursor: 'pointer' },
  btnGhost:{ width: '100%', padding: '13px', background: 'transparent', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 4, fontFamily: DM, fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' },
  error:   { fontFamily: DM, fontSize: 10, color: '#e05aaa', letterSpacing: '0.04em' },
}

const FORMES_JURIDIQUES = ['SARL','SAS','SASU','SA','EURL','EI','Micro-entreprise','Association','Autre']
const TYPES_ETAB = ['Boîte / Club','Bar','Restaurant','Salle de spectacle','Salle polyvalente','Hôtel','Autre']

const STEPS = [
  { label: 'Entreprise',  icon: '🏢' },
  { label: 'Responsable', icon: '👤' },
  { label: 'Activité',    icon: '🎪' },
  { label: 'Paiement',    icon: '💳' },
  { label: 'Documents',   icon: '📎' },
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

export default function OnboardingOrganisateur() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [app, setApp] = useState(null)
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState({})
  const [uploadStatus, setUploadStatus] = useState({}) // { [docKey]: 'uploading'|'done'|'error' }
  const [toast, setToast] = useState(null)

  // Form state — each section
  const [f, setF] = useState({
    // Step 0 — Entreprise
    nomCommercial: '', raisonSociale: '', formeJuridique: '', siren: '', siret: '',
    adresseSiege: '', adresseEtablissement: '', emailPro: '', telephonePro: '', siteWeb: '',
    // Step 1 — Responsable
    responsableNom: '', responsablePrenom: '', responsableFonction: '',
    responsableEmail: '', responsableTelephone: '',
    // Step 2 — Activité
    typeEtablissement: '', ville: '', pays: 'France', capacite: '',
    horaires: '', alcool: false, evenementsPublics: false, evenementsPrives: false,
    description: '',
    // Step 3 — Paiement
    titulaire: '', iban: '', responsableFinancier: '',
  })

  useEffect(() => {
    if (!user) { navigate('/connexion?next=/onboarding-organisateur'); return }
    const existing = getApplicationByUser(user.uid, 'organisateur')
    if (existing) {
      setApp(existing)
      if (existing.formData && Object.keys(existing.formData).length > 0) {
        setF(prev => ({ ...prev, ...existing.formData }))
      }
      // If approved/submitted, redirect to dossier
      if (['submitted','under_review','approved'].includes(existing.status)) {
        navigate('/mon-dossier')
      }
    } else {
      const created = createApplication(user.uid, user.email, user.name, 'organisateur')
      setApp(created)
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
      if (!f.siren.trim()) errs.siren = 'Requis'
      if (!f.emailPro.trim() || !f.emailPro.includes('@')) errs.emailPro = 'Email invalide'
      if (!f.telephonePro.trim()) errs.telephonePro = 'Requis'
      if (!f.adresseSiege.trim()) errs.adresseSiege = 'Requis'
    }
    if (s === 1) {
      if (!f.responsableNom.trim()) errs.responsableNom = 'Requis'
      if (!f.responsablePrenom.trim()) errs.responsablePrenom = 'Requis'
      if (!f.responsableEmail.trim()) errs.responsableEmail = 'Requis'
    }
    if (s === 2) {
      if (!f.ville.trim()) errs.ville = 'Requis'
      if (!f.typeEtablissement) errs.typeEtablissement = 'Requis'
    }
    if (s === 3) {
      if (!f.titulaire.trim()) errs.titulaire = 'Requis'
      if (!f.iban.trim()) errs.iban = 'Requis'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function next() {
    if (!validate(step)) return
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
      setApp(getApplicationByUser(user.uid, 'organisateur'))
      showToast('Document enregistré')
    } else {
      setUploadStatus(s => ({ ...s, [docKey]: 'error' }))
      showToast('Erreur upload', 'error')
    }
  }

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const result = await submitApplication(app.id, f)
      setApp(result)
      showToast('Dossier soumis !')
      setTimeout(() => navigate('/mon-dossier'), 1500)
    } catch {
      showToast('Erreur lors de la soumission', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (!user || !app) return null

  const requiredDocs = getRequiredDocs('organisateur')
  const uploadedDocs = Object.keys(app.documents || {})

  return (
    <Layout>
      <div style={S.page}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ width: 28, height: 1, background: GOLD, flexShrink: 0, display: 'block' }} />
            <span style={{ fontFamily: DM, fontSize: 8, letterSpacing: '0.4em', textTransform: 'uppercase', color: GOLD }}>
              Demande d'espace
            </span>
          </div>
          <h1 style={{ fontFamily: CG, fontWeight: 300, fontSize: 'clamp(1.8rem,8vw,2.8rem)', color: 'rgba(255,255,255,0.92)', margin: 0, lineHeight: 1.1 }}>
            Compte Organisateur
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
                background: 'none', border: 'none', cursor: i < step ? 'pointer' : 'default',
                flex: 1,
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', fontSize: 13,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: i === step ? 'rgba(200,169,110,0.15)' : i < step ? 'rgba(78,232,200,0.12)' : 'rgba(255,255,255,0.04)',
                  border: i === step ? '1px solid rgba(200,169,110,0.5)' : i < step ? '1px solid rgba(78,232,200,0.4)' : '1px solid rgba(255,255,255,0.08)',
                }}>
                  {i < step ? '✓' : s.icon}
                </div>
                <span style={{ fontFamily: DM, fontSize: 7, letterSpacing: '0.1em', color: i === step ? GOLD : i < step ? '#4ee8c8' : 'rgba(255,255,255,0.2)', textTransform: 'uppercase', display: 'none' }} className="md:block">
                  {s.label}
                </span>
              </button>
            ))}
          </div>
          <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 99 }}>
            <div style={{ height: '100%', borderRadius: 99, background: `linear-gradient(to right,${GOLD},rgba(200,169,110,0.3))`, width: `${(step / (STEPS.length - 1)) * 100}%`, transition: 'width 0.4s' }} />
          </div>
        </div>

        {/* ── STEP 0: Entreprise ── */}
        {step === 0 && (
          <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={S.section}>🏢 Informations de l'entreprise</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Nom commercial" required>
                  <input style={{ ...S.input, borderColor: errors.nomCommercial ? '#e05aaa' : undefined }} value={f.nomCommercial} onChange={e => update('nomCommercial', e.target.value)} placeholder="LIVEINBLACK Events" />
                  {errors.nomCommercial && <p style={S.error}>{errors.nomCommercial}</p>}
                </Field>
              </div>
              <Field label="Raison sociale">
                <input style={S.input} value={f.raisonSociale} onChange={e => update('raisonSociale', e.target.value)} placeholder="SAS EVENTS FRANCE" />
              </Field>
              <Field label="Forme juridique">
                <select style={S.select} value={f.formeJuridique} onChange={e => update('formeJuridique', e.target.value)}>
                  <option value="">Choisir...</option>
                  {FORMES_JURIDIQUES.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </Field>
              <Field label="SIREN" required>
                <input style={{ ...S.input, borderColor: errors.siren ? '#e05aaa' : undefined }} value={f.siren} onChange={e => update('siren', e.target.value)} placeholder="123 456 789" maxLength={9} />
                {errors.siren && <p style={S.error}>{errors.siren}</p>}
              </Field>
              <Field label="SIRET">
                <input style={S.input} value={f.siret} onChange={e => update('siret', e.target.value)} placeholder="123 456 789 00012" maxLength={14} />
              </Field>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Adresse du siège social" required>
                  <input style={{ ...S.input, borderColor: errors.adresseSiege ? '#e05aaa' : undefined }} value={f.adresseSiege} onChange={e => update('adresseSiege', e.target.value)} placeholder="12 rue de la Paix, 75001 Paris" />
                  {errors.adresseSiege && <p style={S.error}>{errors.adresseSiege}</p>}
                </Field>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Adresse de l'établissement / lieu principal">
                  <input style={S.input} value={f.adresseEtablissement} onChange={e => update('adresseEtablissement', e.target.value)} placeholder="(si différente du siège)" />
                </Field>
              </div>
              <Field label="Email professionnel" required>
                <input type="email" style={{ ...S.input, borderColor: errors.emailPro ? '#e05aaa' : undefined }} value={f.emailPro} onChange={e => update('emailPro', e.target.value)} placeholder="contact@monclub.fr" />
                {errors.emailPro && <p style={S.error}>{errors.emailPro}</p>}
              </Field>
              <Field label="Téléphone professionnel" required>
                <input style={{ ...S.input, borderColor: errors.telephonePro ? '#e05aaa' : undefined }} value={f.telephonePro} onChange={e => update('telephonePro', e.target.value)} placeholder="+33 6 00 00 00 00" />
                {errors.telephonePro && <p style={S.error}>{errors.telephonePro}</p>}
              </Field>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Site web / Instagram (optionnel)">
                  <input style={S.input} value={f.siteWeb} onChange={e => update('siteWeb', e.target.value)} placeholder="https://... ou @nom" />
                </Field>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 1: Responsable ── */}
        {step === 1 && (
          <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={S.section}>👤 Responsable du compte</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Nom" required>
                <input style={{ ...S.input, borderColor: errors.responsableNom ? '#e05aaa' : undefined }} value={f.responsableNom} onChange={e => update('responsableNom', e.target.value)} placeholder="Dupont" />
                {errors.responsableNom && <p style={S.error}>{errors.responsableNom}</p>}
              </Field>
              <Field label="Prénom" required>
                <input style={{ ...S.input, borderColor: errors.responsablePrenom ? '#e05aaa' : undefined }} value={f.responsablePrenom} onChange={e => update('responsablePrenom', e.target.value)} placeholder="Jean" />
                {errors.responsablePrenom && <p style={S.error}>{errors.responsablePrenom}</p>}
              </Field>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Fonction / Poste">
                  <input style={S.input} value={f.responsableFonction} onChange={e => update('responsableFonction', e.target.value)} placeholder="Gérant, Directeur, etc." />
                </Field>
              </div>
              <Field label="Email de contact" required>
                <input type="email" style={{ ...S.input, borderColor: errors.responsableEmail ? '#e05aaa' : undefined }} value={f.responsableEmail} onChange={e => update('responsableEmail', e.target.value)} placeholder="jean.dupont@..." />
                {errors.responsableEmail && <p style={S.error}>{errors.responsableEmail}</p>}
              </Field>
              <Field label="Téléphone de contact">
                <input style={S.input} value={f.responsableTelephone} onChange={e => update('responsableTelephone', e.target.value)} placeholder="+33 6 ..." />
              </Field>
            </div>
          </div>
        )}

        {/* ── STEP 2: Activité ── */}
        {step === 2 && (
          <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={S.section}>🎪 Description de l'activité</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Type d'établissement" required>
                  <select style={{ ...S.select, borderColor: errors.typeEtablissement ? '#e05aaa' : undefined }} value={f.typeEtablissement} onChange={e => update('typeEtablissement', e.target.value)}>
                    <option value="">Choisir...</option>
                    {TYPES_ETAB.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                  {errors.typeEtablissement && <p style={S.error}>{errors.typeEtablissement}</p>}
                </Field>
              </div>
              <Field label="Ville" required>
                <input style={{ ...S.input, borderColor: errors.ville ? '#e05aaa' : undefined }} value={f.ville} onChange={e => update('ville', e.target.value)} placeholder="Paris" />
                {errors.ville && <p style={S.error}>{errors.ville}</p>}
              </Field>
              <Field label="Pays">
                <input style={S.input} value={f.pays} onChange={e => update('pays', e.target.value)} placeholder="France" />
              </Field>
              <Field label="Capacité d'accueil déclarée">
                <input type="number" style={S.input} value={f.capacite} onChange={e => update('capacite', e.target.value)} placeholder="ex: 500" min={0} />
              </Field>
              <Field label="Horaires habituels">
                <input style={S.input} value={f.horaires} onChange={e => update('horaires', e.target.value)} placeholder="ex: Ven-Sam 23h-07h" />
              </Field>
              <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Toggle value={f.alcool} onChange={v => update('alcool', v)} label="Alcool vendu sur place" />
                <Toggle value={f.evenementsPublics} onChange={v => update('evenementsPublics', v)} label="Événements publics" />
                <Toggle value={f.evenementsPrives} onChange={v => update('evenementsPrives', v)} label="Événements privés" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Description courte de l'activité">
                  <textarea style={{ ...S.input, minHeight: 80, resize: 'vertical' }} value={f.description} onChange={e => update('description', e.target.value)} placeholder="Décris en quelques lignes ton activité, ton public, l'ambiance..." />
                </Field>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 3: Paiement ── */}
        {step === 3 && (
          <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={S.section}>💳 Coordonnées bancaires</p>
            <div style={{
              padding: '10px 14px', background: 'rgba(200,169,110,0.06)', border: '1px solid rgba(200,169,110,0.2)', borderRadius: 6, marginBottom: 4,
            }}>
              <p style={{ fontFamily: DM, fontSize: 9, color: 'rgba(200,169,110,0.8)', letterSpacing: '0.08em', margin: 0 }}>
                Ces informations sont nécessaires pour les reversements de billetterie. Elles sont stockées de manière sécurisée et ne sont jamais visibles par d'autres utilisateurs.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Titulaire du compte" required>
                <input style={{ ...S.input, borderColor: errors.titulaire ? '#e05aaa' : undefined }} value={f.titulaire} onChange={e => update('titulaire', e.target.value)} placeholder="SAS EVENTS FRANCE" />
                {errors.titulaire && <p style={S.error}>{errors.titulaire}</p>}
              </Field>
              <Field label="IBAN / RIB" required>
                <input style={{ ...S.input, borderColor: errors.iban ? '#e05aaa' : undefined }} value={f.iban} onChange={e => update('iban', e.target.value.toUpperCase())} placeholder="FR76 XXXX XXXX XXXX XXXX XXXX XXX" />
                {errors.iban && <p style={S.error}>{errors.iban}</p>}
              </Field>
              <Field label="Nom du responsable financier / gérant">
                <input style={S.input} value={f.responsableFinancier} onChange={e => update('responsableFinancier', e.target.value)} placeholder="Jean Dupont" />
              </Field>
            </div>
            <div style={{ marginTop: 8, padding: '12px 14px', background: 'rgba(78,232,200,0.04)', border: '1px solid rgba(78,232,200,0.12)', borderRadius: 6 }}>
              <p style={{ fontFamily: DM, fontSize: 8, color: 'rgba(78,232,200,0.6)', letterSpacing: '0.1em', margin: '0 0 4px', textTransform: 'uppercase' }}>Stripe Connect</p>
              <p style={{ fontFamily: DM, fontSize: 9, color: 'rgba(255,255,255,0.25)', margin: 0, lineHeight: 1.6 }}>
                Une fois ton compte validé, tu seras guidé pour connecter ton compte bancaire via Stripe Connect pour recevoir les reversements automatiquement.
              </p>
            </div>
          </div>
        )}

        {/* ── STEP 4: Documents ── */}
        {step === 4 && (
          <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={S.section}>📎 Documents justificatifs</p>
            <p style={{ fontFamily: DM, fontSize: 10, color: 'rgba(255,255,255,0.3)', lineHeight: 1.7, margin: 0 }}>
              Télécharge les documents nécessaires. Les fichiers sont stockés de manière privée et ne sont accessibles qu'à l'équipe LIVEINBLACK.
            </p>

            {/* Required docs */}
            {requiredDocs.map(docKey => {
              const cfg     = DOCUMENT_LABELS[docKey]
              const uploaded = app.documents?.[docKey]
              const status   = uploadStatus[docKey]
              return (
                <DocUploadRow
                  key={docKey}
                  label={cfg?.label || docKey}
                  required
                  uploaded={uploaded}
                  status={status}
                  onChange={file => handleUpload(docKey, file)}
                />
              )
            })}

            {/* Conditional: alcool */}
            {f.alcool && (
              <DocUploadRow
                label="Licence / Justificatif de débit de boissons"
                required={false}
                uploaded={app.documents?.alcohol_license}
                status={uploadStatus.alcohol_license}
                onChange={file => handleUpload('alcohol_license', file)}
              />
            )}

            <DocUploadRow
              label="Justificatif montrant le lien avec le lieu (bail, titre de propriété...)"
              required={false}
              uploaded={app.documents?.venue_proof}
              status={uploadStatus.venue_proof}
              onChange={file => handleUpload('venue_proof', file)}
            />

            {/* Submit section */}
            <div style={{ marginTop: 8, padding: '16px', background: 'rgba(200,169,110,0.05)', border: '1px solid rgba(200,169,110,0.15)', borderRadius: 8 }}>
              <p style={{ fontFamily: DM, fontSize: 9, color: GOLD, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Prêt à soumettre ?</p>
              <p style={{ fontFamily: DM, fontSize: 10, color: 'rgba(255,255,255,0.3)', lineHeight: 1.6, marginBottom: 16 }}>
                Une fois soumis, ton dossier sera examiné par l'équipe LIVEINBLACK. Tu peux suivre l'avancement dans <strong style={{ color: 'rgba(255,255,255,0.55)' }}>Mon Dossier</strong>.
              </p>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                style={{ ...S.btnGold, opacity: submitting ? 0.6 : 1 }}
              >
                {submitting ? 'Soumission...' : 'Soumettre mon dossier'}
              </button>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          {step > 0 && (
            <button onClick={prev} style={{ ...S.btnGhost, flex: 1 }}>← Retour</button>
          )}
          {step < STEPS.length - 1 && (
            <button onClick={next} style={{ ...S.btnGold, flex: 2 }}>Continuer →</button>
          )}
        </div>

        <p style={{ fontFamily: DM, fontSize: 9, color: 'rgba(255,255,255,0.18)', textAlign: 'center', marginTop: 12, letterSpacing: '0.1em' }}>
          Sauvegarde automatique activée
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

// ── Document upload row ───────────────────────────────────────────────────────
function DocUploadRow({ label, required, uploaded, status, onChange }) {
  const isDone = status === 'done' || !!uploaded
  const isUploading = status === 'uploading'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: isDone ? 'rgba(34,197,94,0.04)' : 'rgba(255,255,255,0.02)', border: `1px solid ${isDone ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 6 }}>
      <div style={{ width: 32, height: 32, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isDone ? 'rgba(34,197,94,0.10)' : 'rgba(255,255,255,0.04)', border: `1px solid ${isDone ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.08)'}`, fontSize: 14, flexShrink: 0 }}>
        {isUploading ? '⏳' : isDone ? '✓' : '📄'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: DM, fontSize: 10, color: isDone ? '#4ee8c8' : 'rgba(255,255,255,0.6)', margin: '0 0 2px', letterSpacing: '0.04em' }}>
          {label} {required && <span style={{ color: '#e05aaa' }}>*</span>}
        </p>
        {uploaded && (
          <p style={{ fontFamily: DM, fontSize: 9, color: 'rgba(255,255,255,0.25)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {uploaded.name}
          </p>
        )}
      </div>
      <label style={{ cursor: 'pointer', flexShrink: 0 }}>
        <input type="file" style={{ display: 'none' }} accept=".pdf,.jpg,.jpeg,.png" onChange={e => e.target.files?.[0] && onChange(e.target.files[0])} />
        <span style={{ fontFamily: DM, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: isDone ? 'rgba(78,232,200,0.6)' : 'rgba(200,169,110,0.7)', padding: '5px 10px', border: `1px solid ${isDone ? 'rgba(78,232,200,0.25)' : 'rgba(200,169,110,0.3)'}`, borderRadius: 4, background: 'transparent' }}>
          {isDone ? 'Modifier' : 'Choisir'}
        </span>
      </label>
    </div>
  )
}
