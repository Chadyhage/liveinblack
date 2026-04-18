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

const TYPES = [
  { key: 'artiste',  label: 'Artiste / DJ / Performer', icon: '🎤', color: '#8b5cf6' },
  { key: 'salle',    label: 'Lieu / Salle à louer',     icon: '🏛',  color: '#3b82f6' },
  { key: 'materiel', label: 'Matériel à louer',          icon: '🔊', color: '#f59e0b' },
  { key: 'food',     label: 'Food / Boissons / Traiteur',icon: '🍽', color: '#22c55e' },
]

const STEPS = [
  { label: 'Type',       icon: '🎯' },
  { label: 'Profil',     icon: '👤' },
  { label: 'Spécifique', icon: '⚙️' },
  { label: 'Paiement',   icon: '💳' },
  { label: 'Documents',  icon: '📎' },
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
    <button type="button" onClick={() => onChange(!value)} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
      <div style={{ width: 36, height: 20, borderRadius: 99, position: 'relative', transition: 'background 0.2s', background: value ? 'rgba(78,232,200,0.6)' : 'rgba(255,255,255,0.1)', border: `1px solid ${value ? '#4ee8c8' : 'rgba(255,255,255,0.12)'}` }}>
        <div style={{ position: 'absolute', top: 2, left: value ? 18 : 2, width: 14, height: 14, borderRadius: '50%', background: value ? '#4ee8c8' : 'rgba(255,255,255,0.4)', transition: 'left 0.2s' }} />
      </div>
      <span style={{ fontFamily: DM, fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>{label}</span>
    </button>
  )
}

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
        {uploaded && <p style={{ fontFamily: DM, fontSize: 9, color: 'rgba(255,255,255,0.25)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{uploaded.name}</p>}
      </div>
      <label style={{ cursor: 'pointer', flexShrink: 0 }}>
        <input type="file" style={{ display: 'none' }} accept=".pdf,.jpg,.jpeg,.png" onChange={e => e.target.files?.[0] && onChange(e.target.files[0])} />
        <span style={{ fontFamily: DM, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: isDone ? 'rgba(78,232,200,0.6)' : 'rgba(200,169,110,0.7)', padding: '5px 10px', border: `1px solid ${isDone ? 'rgba(78,232,200,0.25)' : 'rgba(200,169,110,0.3)'}`, borderRadius: 4 }}>
          {isDone ? 'Modifier' : 'Choisir'}
        </span>
      </label>
    </div>
  )
}

export default function OnboardingPrestataire() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [app, setApp] = useState(null)
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [candidateNote, setCandidateNote] = useState('')
  const [errors, setErrors] = useState({})
  const [uploadStatus, setUploadStatus] = useState({})
  const [toast, setToast] = useState(null)

  const [f, setF] = useState({
    // Step 0 — Type
    prestataireType: '',
    // Step 1 — Profil commun
    nomCommercial: '', raisonSociale: '', siren: '', siret: '',
    adresse: '', ville: '', pays: 'France',
    emailPro: '', telephonePro: '',
    responsableNom: '', responsablePrenom: '', responsableFonction: '',
    zoneIntervention: '', description: '',
    // Step 2 — Artiste
    nomScene: '', styles: '', portfolio: '', statutFacturation: '', besoinstechniques: '',
    // Step 2 — Salle
    adresseLieu: '', capaciteLieu: '', typeLieu: '', horairesAutorises: '', reglesDuLieu: '',
    // Step 2 — Matériel
    categoriesMateriel: '', conditionsLocation: '', politiqueCaution: '',
    // Step 2 — Food
    typeActiviteFood: '', menuBase: '', informationsReglementaires: '',
    alcoolFood: false,
    // Step 3 — Paiement
    titulaire: '', iban: '',
  })

  useEffect(() => {
    if (!user) { navigate('/connexion?next=/onboarding-prestataire'); return }
    const existing = getApplicationByUser(user.uid, 'prestataire')
    if (existing) {
      setApp(existing)
      if (existing.formData && Object.keys(existing.formData).length > 0) {
        setF(prev => ({ ...prev, ...existing.formData }))
      }
      if (['submitted','under_review','approved'].includes(existing.status)) {
        navigate('/mon-dossier')
      }
    } else {
      const created = createApplication(user.uid, user.email, user.name, 'prestataire')
      setApp(created)
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

  function validate(s) {
    const errs = {}
    if (s === 0) {
      if (!f.prestataireType) errs.prestataireType = 'Sélectionne un type'
    }
    if (s === 1) {
      if (!f.nomCommercial.trim()) errs.nomCommercial = 'Requis'
      if (!f.emailPro.trim() || !f.emailPro.includes('@')) errs.emailPro = 'Email invalide'
      if (!f.telephonePro.trim()) errs.telephonePro = 'Requis'
      if (!f.responsableNom.trim()) errs.responsableNom = 'Requis'
      if (!f.ville.trim()) errs.ville = 'Requis'
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
      setApp(getApplicationByUser(user.uid, 'prestataire'))
      showToast('Document enregistré')
    } else {
      setUploadStatus(s => ({ ...s, [docKey]: 'error' }))
      showToast('Erreur upload', 'error')
    }
  }

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const result = await submitApplication(app.id, f, candidateNote)
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

  const selectedType = TYPES.find(t => t.key === f.prestataireType)
  const requiredDocs = getRequiredDocs('prestataire', f.prestataireType)

  return (
    <Layout>
      <div style={S.page}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ width: 28, height: 1, background: '#8b5cf6', display: 'block', flexShrink: 0 }} />
            <span style={{ fontFamily: DM, fontSize: 8, letterSpacing: '0.4em', textTransform: 'uppercase', color: '#8b5cf6' }}>Demande d'espace</span>
          </div>
          <h1 style={{ fontFamily: CG, fontWeight: 300, fontSize: 'clamp(1.8rem,8vw,2.8rem)', color: 'rgba(255,255,255,0.92)', margin: 0, lineHeight: 1.1 }}>
            Compte Prestataire
          </h1>
          <p style={{ fontFamily: DM, fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 8, lineHeight: 1.6 }}>
            Complète ton dossier. Tu peux sauvegarder et revenir plus tard.
          </p>
        </div>

        {/* Progress */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            {STEPS.map((s, i) => (
              <button key={i} onClick={() => i < step && setStep(i)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: i < step ? 'pointer' : 'default', flex: 1 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', fontSize: 13,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: i === step ? 'rgba(139,92,246,0.15)' : i < step ? 'rgba(78,232,200,0.12)' : 'rgba(255,255,255,0.04)',
                  border: i === step ? '1px solid rgba(139,92,246,0.5)' : i < step ? '1px solid rgba(78,232,200,0.4)' : '1px solid rgba(255,255,255,0.08)',
                }}>
                  {i < step ? '✓' : s.icon}
                </div>
              </button>
            ))}
          </div>
          <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 99 }}>
            <div style={{ height: '100%', borderRadius: 99, background: 'linear-gradient(to right,#8b5cf6,rgba(139,92,246,0.3))', width: `${(step / (STEPS.length - 1)) * 100}%`, transition: 'width 0.4s' }} />
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
                <span style={{ fontSize: 24 }}>{t.icon}</span>
                <div>
                  <p style={{ fontFamily: DM, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: f.prestataireType === t.key ? t.color : 'rgba(255,255,255,0.7)', margin: 0 }}>{t.label}</p>
                </div>
                {f.prestataireType === t.key && (
                  <span style={{ marginLeft: 'auto', color: t.color, fontSize: 16 }}>✓</span>
                )}
              </button>
            ))}
            {errors.prestataireType && <p style={S.error}>{errors.prestataireType}</p>}
          </div>
        )}

        {/* ── STEP 1: Profil commun ── */}
        {step === 1 && (
          <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={S.section}>
              {selectedType?.icon} Profil — {selectedType?.label}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Nom commercial / Nom complet" required>
                  <input style={{ ...S.input, borderColor: errors.nomCommercial ? '#e05aaa' : undefined }} value={f.nomCommercial} onChange={e => update('nomCommercial', e.target.value)} placeholder={f.prestataireType === 'artiste' ? 'DJ Shadow, Les Traiteurs du Sud...' : 'Nom de ta structure'} />
                  {errors.nomCommercial && <p style={S.error}>{errors.nomCommercial}</p>}
                </Field>
              </div>
              <Field label="Raison sociale (si applicable)">
                <input style={S.input} value={f.raisonSociale} onChange={e => update('raisonSociale', e.target.value)} placeholder="SAS, EI, Auto-entrepreneur..." />
              </Field>
              <Field label="SIREN (si activité pro déclarée)">
                <input style={S.input} value={f.siren} onChange={e => update('siren', e.target.value)} placeholder="123 456 789" maxLength={9} />
              </Field>
              <Field label="SIRET">
                <input style={S.input} value={f.siret} onChange={e => update('siret', e.target.value)} placeholder="123 456 789 00012" maxLength={14} />
              </Field>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Adresse">
                  <input style={S.input} value={f.adresse} onChange={e => update('adresse', e.target.value)} placeholder="12 rue..." />
                </Field>
              </div>
              <Field label="Ville" required>
                <input style={{ ...S.input, borderColor: errors.ville ? '#e05aaa' : undefined }} value={f.ville} onChange={e => update('ville', e.target.value)} placeholder="Paris" />
                {errors.ville && <p style={S.error}>{errors.ville}</p>}
              </Field>
              <Field label="Pays">
                <input style={S.input} value={f.pays} onChange={e => update('pays', e.target.value)} placeholder="France" />
              </Field>
              <Field label="Email" required>
                <input type="email" style={{ ...S.input, borderColor: errors.emailPro ? '#e05aaa' : undefined }} value={f.emailPro} onChange={e => update('emailPro', e.target.value)} placeholder="contact@..." />
                {errors.emailPro && <p style={S.error}>{errors.emailPro}</p>}
              </Field>
              <Field label="Téléphone" required>
                <input style={{ ...S.input, borderColor: errors.telephonePro ? '#e05aaa' : undefined }} value={f.telephonePro} onChange={e => update('telephonePro', e.target.value)} placeholder="+33 6..." />
                {errors.telephonePro && <p style={S.error}>{errors.telephonePro}</p>}
              </Field>
              <Field label="Nom du responsable" required>
                <input style={{ ...S.input, borderColor: errors.responsableNom ? '#e05aaa' : undefined }} value={f.responsableNom} onChange={e => update('responsableNom', e.target.value)} placeholder="Dupont" />
                {errors.responsableNom && <p style={S.error}>{errors.responsableNom}</p>}
              </Field>
              <Field label="Prénom">
                <input style={S.input} value={f.responsablePrenom} onChange={e => update('responsablePrenom', e.target.value)} placeholder="Jean" />
              </Field>
              <Field label="Fonction">
                <input style={S.input} value={f.responsableFonction} onChange={e => update('responsableFonction', e.target.value)} placeholder="Gérant, Artiste..." />
              </Field>
              <Field label="Zone d'intervention">
                <input style={S.input} value={f.zoneIntervention} onChange={e => update('zoneIntervention', e.target.value)} placeholder="Île-de-France, National, Europe..." />
              </Field>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Description courte de l'activité">
                  <textarea style={{ ...S.input, minHeight: 80, resize: 'vertical' }} value={f.description} onChange={e => update('description', e.target.value)} placeholder="Décris ton activité, ton style, tes points forts..." />
                </Field>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2: Champs spécifiques ── */}
        {step === 2 && (
          <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={S.section}>{selectedType?.icon} Informations spécifiques — {selectedType?.label}</p>

            {/* Artiste */}
            {f.prestataireType === 'artiste' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Field label="Nom de scène (optionnel)">
                  <input style={S.input} value={f.nomScene} onChange={e => update('nomScene', e.target.value)} placeholder="ex: DJ Paradox" />
                </Field>
                <Field label="Styles / Spécialités">
                  <input style={S.input} value={f.styles} onChange={e => update('styles', e.target.value)} placeholder="House, Techno, R&B, Live Saxo..." />
                </Field>
                <Field label="Portfolio / Instagram / Lien vidéo">
                  <input style={S.input} value={f.portfolio} onChange={e => update('portfolio', e.target.value)} placeholder="https://... ou @nom" />
                </Field>
                <Field label="Statut de facturation">
                  <select style={S.select} value={f.statutFacturation} onChange={e => update('statutFacturation', e.target.value)}>
                    <option value="">Choisir...</option>
                    <option value="auto_entrepreneur">Auto-entrepreneur</option>
                    <option value="artiste_auteur">Artiste-Auteur</option>
                    <option value="salarie_intermittent">Salarié / Intermittent</option>
                    <option value="structure">Via structure (SARL, SAS...)</option>
                    <option value="autre">Autre</option>
                  </select>
                </Field>
                <Field label="Besoins techniques (optionnel)">
                  <textarea style={{ ...S.input, minHeight: 70, resize: 'vertical' }} value={f.besoinstech} onChange={e => update('besoinstech', e.target.value)} placeholder="Table de mix, monitoring, rider technique..." />
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
                    <option value="autre">Autre</option>
                  </select>
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
                <Toggle value={f.alcoolFood} onChange={v => update('alcoolFood', v)} label="Alcool proposé" />
                <Field label="Informations réglementaires (licence alcool si applicable)">
                  <input style={S.input} value={f.informationsReglementaires} onChange={e => update('informationsReglementaires', e.target.value)} placeholder="Licence II, III, IV..." />
                </Field>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3: Paiement ── */}
        {step === 3 && (
          <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={S.section}>💳 Coordonnées bancaires</p>
            <div style={{ padding: '10px 14px', background: 'rgba(200,169,110,0.06)', border: '1px solid rgba(200,169,110,0.2)', borderRadius: 6 }}>
              <p style={{ fontFamily: DM, fontSize: 9, color: 'rgba(200,169,110,0.8)', letterSpacing: '0.08em', margin: 0 }}>
                Ces informations sont nécessaires pour recevoir tes paiements via LIVEINBLACK. Stockées de manière sécurisée.
              </p>
            </div>
            <Field label="Titulaire du compte" required>
              <input style={{ ...S.input, borderColor: errors.titulaire ? '#e05aaa' : undefined }} value={f.titulaire} onChange={e => update('titulaire', e.target.value)} placeholder="Nom complet ou raison sociale" />
              {errors.titulaire && <p style={S.error}>{errors.titulaire}</p>}
            </Field>
            <Field label="IBAN / RIB" required>
              <input style={{ ...S.input, borderColor: errors.iban ? '#e05aaa' : undefined }} value={f.iban} onChange={e => update('iban', e.target.value.toUpperCase())} placeholder="FR76 XXXX XXXX XXXX XXXX XXXX XXX" />
              {errors.iban && <p style={S.error}>{errors.iban}</p>}
            </Field>
            <div style={{ padding: '12px 14px', background: 'rgba(78,232,200,0.04)', border: '1px solid rgba(78,232,200,0.12)', borderRadius: 6 }}>
              <p style={{ fontFamily: DM, fontSize: 8, color: 'rgba(78,232,200,0.6)', letterSpacing: '0.1em', margin: '0 0 4px', textTransform: 'uppercase' }}>Stripe Connect</p>
              <p style={{ fontFamily: DM, fontSize: 9, color: 'rgba(255,255,255,0.25)', margin: 0, lineHeight: 1.6 }}>
                Une fois validé, tu pourras connecter ton compte bancaire via Stripe Connect pour recevoir les reversements automatiquement.
              </p>
            </div>
          </div>
        )}

        {/* ── STEP 4: Documents ── */}
        {step === 4 && (
          <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={S.section}>📎 Documents justificatifs</p>
            <p style={{ fontFamily: DM, fontSize: 10, color: 'rgba(255,255,255,0.3)', lineHeight: 1.7, margin: 0 }}>
              Télécharge les documents requis pour ta catégorie. Ils sont stockés de manière privée.
            </p>

            {requiredDocs.map(docKey => {
              const label = DOCUMENT_LABELS[docKey]?.label || docKey
              return (
                <DocUploadRow
                  key={docKey}
                  label={label}
                  required
                  uploaded={app.documents?.[docKey]}
                  status={uploadStatus[docKey]}
                  onChange={file => handleUpload(docKey, file)}
                />
              )
            })}

            {/* RC Pro — optionnelle mais affichée */}
            <DocUploadRow
              label="Attestation RC Pro (si applicable)"
              required={false}
              uploaded={app.documents?.rc_pro}
              status={uploadStatus.rc_pro}
              onChange={file => handleUpload('rc_pro', file)}
            />

            {/* Alcool food */}
            {f.prestataireType === 'food' && f.alcoolFood && (
              <DocUploadRow
                label="Licence alcool (II / III / IV)"
                required={false}
                uploaded={app.documents?.alcohol_license}
                status={uploadStatus.alcohol_license}
                onChange={file => handleUpload('alcohol_license', file)}
              />
            )}

            {/* Submit */}
            <div style={{ marginTop: 8, padding: '16px', background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: 8 }}>
              <p style={{ fontFamily: DM, fontSize: 9, color: '#8b5cf6', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Prêt à soumettre ?</p>
              <p style={{ fontFamily: DM, fontSize: 10, color: 'rgba(255,255,255,0.3)', lineHeight: 1.6, marginBottom: 16 }}>
                Ton dossier sera examiné par l'équipe LIVEINBLACK. Suis l'avancement dans <strong style={{ color: 'rgba(255,255,255,0.55)' }}>Mon Dossier</strong>.
              </p>
              {/* Note optionnelle pour l'équipe */}
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
              <button onClick={handleSubmit} disabled={submitting} style={{ ...S.btnGold, opacity: submitting ? 0.6 : 1 }}>
                {submitting ? 'Soumission...' : 'Soumettre mon dossier'}
              </button>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          {step > 0 && <button onClick={prev} style={{ ...S.btnGhost, flex: 1 }}>← Retour</button>}
          {step < STEPS.length - 1 && <button onClick={next} style={{ ...S.btnGold, flex: 2 }}>Continuer →</button>}
        </div>
        <p style={{ fontFamily: DM, fontSize: 9, color: 'rgba(255,255,255,0.18)', textAlign: 'center', marginTop: 12, letterSpacing: '0.1em' }}>
          Sauvegarde automatique activée
        </p>
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 100, padding: '10px 20px', borderRadius: 6, backdropFilter: 'blur(20px)', fontFamily: DM, fontSize: 11, letterSpacing: '0.06em', ...(toast.type === 'error' ? { background: 'rgba(220,50,50,0.16)', border: '1px solid rgba(220,50,50,0.4)', color: 'rgba(220,100,100,0.95)' } : { background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)', color: '#4ee8c8' }) }}>
          {toast.msg}
        </div>
      )}
    </Layout>
  )
}
