'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn, useSession } from 'next-auth/react'
import { regions } from '@/lib/shared/regions'
import { PROVIDER_CATEGORIES, getPrimaryProviderType } from '@/lib/shared/providerCategories'
import { regionToCurrency } from '@/lib/shared/money'
import { fmtMoney } from '@/lib/shared/money'
import { PROVIDER_SUB } from '@/lib/shared/providerSubscription'
import { validatePrestataireStep0, validatePrestataireStep2, getRequiredDocs, type PrestataireFormData } from '@/lib/shared/applicationValidation'
import { getPasswordPolicyErrors } from '@/lib/shared/passwordPolicy'
import { uploadApplicationDocument } from '@/lib/client/applicationDocumentUpload'
import type { ApplicationDocumentUploadReference } from '@/lib/shared/applicationDocuments'
import { GROWTH_EVENT_NAMES, trackGrowthEvent } from '@/lib/client/growthAnalytics'
import { Globe } from 'lucide-react'
import { Button, Card, Input, Textarea, Select, Checkbox, Label } from '@/app/components/ui'

// Port de src/pages/OnboardingPrestataire.jsx (#8 phase prestataire) — 6
// étapes (Compte/Activités/Détails/Fonctionnement/Documents/Finaliser),
// même architecture que OrganizerOnboardingWizard.tsx (#7) : utilisé À LA
// FOIS par /inscription-prestataire (mode anonyme) et /onboarding-prestataire
// (mode connecté). Contrairement au legacy (compte Firebase créé au milieu
// du wizard, après l'étape "Compte"), le compte n'est créé qu'à la
// soumission finale — même simplification déjà actée pour l'organisateur
// (voir lib/server/applications.ts : "aucun compte fantôme avant la
// soumission finale"), invisible pour l'utilisateur qui remplit le même
// formulaire dans le même ordre.
//
// L'abonnement prestataire (Stripe EUR / FedaPay XOF) n'est PAS déclenché
// ici — fidèle au legacy, l'étape "Finaliser" ne fait qu'informer du prix ;
// l'activation réelle se fait depuis /proposer-services après approbation.

const STEPS = ['Compte', 'Activités', 'Détails', 'Fonctionnement', 'Documents', 'Finaliser']

const EMPTY_FORM: PrestataireFormData = {
  prestataireType: 'autre',
  prestataireTypes: [],
  prenom: '',
  nom: '',
  telephoneCode: '+33',
  telephone: '',
  ville: '',
  pays: 'France',
  nomCommercial: '',
  nomScene: '',
  siret: '',
  zonesIntervention: [],
  description: '',
  specialitesLibre: '',
  typeArtiste: '',
  styles: '',
  anneesExperience: '',
  statutFacturation: '',
  portfolio: '',
  instagram: '',
  besoinstechniques: '',
  adresseLieu: '',
  capaciteLieu: null,
  typeLieu: '',
  equipements: '',
  horairesAutorises: '',
  reglesDuLieu: '',
  categoriesMateriel: '',
  inventaire: '',
  conditionsLocation: '',
  politiqueCaution: '',
  typeActiviteFood: '',
  menuBase: '',
  alcoolFood: false,
  alcoolFoodAtteste: false,
  tarifMin: null,
  tarifMax: null,
  tarifType: '',
  tarifDevis: false,
}

const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', minHeight: 38, padding: '6px 10px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 'var(--font-size-body-sm)', outline: 'none' }
const labelStyle: React.CSSProperties = { fontSize: 'var(--font-size-footnote)', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }
const primaryBtn = (disabled: boolean): React.CSSProperties => ({
  padding: '13px 26px',
  borderRadius: 3,
  border: 'none',
  background: disabled ? 'var(--primary-a32)' : 'linear-gradient(180deg, var(--primary), var(--primary-strong))',
  color: 'var(--primary-ink)',
  fontWeight: 500,
  fontSize: 'var(--font-size-body-sm)',
  textTransform: 'none',
  letterSpacing: 'normal',
  cursor: disabled ? 'default' : 'pointer',
})
const chip = (active: boolean): React.CSSProperties => ({
  padding: '8px 14px',
  borderRadius: 999,
  border: `1px solid ${active ? 'var(--gold)' : 'var(--border-strong)'}`,
  background: active ? 'var(--primary-a14)' : 'transparent',
  color: active ? 'var(--gold)' : 'var(--text)',
  fontSize: 'var(--font-size-footnote-lg)',
  cursor: 'pointer',
})

const DOC_LABELS: Record<string, string> = {
  identity: "Pièce d'identité",
  billing_proof: 'Justificatif de facturation (auto-entrepreneur, statut artiste…)',
  business_doc: "Document officiel de l'entreprise (KBIS, statuts, récépissé INSEE…)",
  insurance: 'Attestation d’assurance responsabilité civile professionnelle',
  exploitation_proof: "Justificatif d'exploitation du lieu (bail, autorisation…)",
}

type DocState = ApplicationDocumentUploadReference

function IconEye({ open, size = 15 }: { open: boolean; size?: number }) {
  return open ? (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a20.3 20.3 0 0 1 5.06-5.94M9.9 4.24A10.4 10.4 0 0 1 12 4c7 0 11 7 11 7a20.3 20.3 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

export default function PrestataireOnboardingWizard({
  mode,
  initialFormData,
  initialCandidateNote,
}: {
  mode: 'anonymous' | 'loggedIn'
  initialFormData?: Partial<PrestataireFormData>
  initialCandidateNote?: string
}) {
  const router = useRouter()
  const { update } = useSession()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<PrestataireFormData>({ ...EMPTY_FORM, ...initialFormData })
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regPasswordConfirm, setRegPasswordConfirm] = useState('')
  const [showRegPwd, setShowRegPwd] = useState(false)
  const [documents, setDocuments] = useState<Record<string, DocState[]>>({})
  const [candidateNote, setCandidateNote] = useState(initialCandidateNote ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploadingDocs, setUploadingDocs] = useState(false)
  const [submitted, setSubmitted] = useState<{ email: string } | null>(null)
  const [autosaveState, setAutosaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  function set<K extends keyof PrestataireFormData>(key: K, value: PrestataireFormData[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function toggleProviderType(type: string) {
    setForm((f) => {
      let nextTypes: string[]
      if (type === 'autre') {
        nextTypes = f.prestataireTypes.includes('autre') ? [] : ['autre']
      } else {
        const withoutAutre = f.prestataireTypes.filter((t) => t !== 'autre')
        nextTypes = withoutAutre.includes(type) ? withoutAutre.filter((t) => t !== type) : [...withoutAutre, type]
      }
      return { ...f, prestataireTypes: nextTypes, prestataireType: getPrimaryProviderType({ prestataireTypes: nextTypes }) }
    })
  }

  function toggleZone(zoneId: string) {
    setForm((f) => {
      let next: string[]
      if (zoneId === 'international') {
        next = f.zonesIntervention.includes('international') ? [] : ['international']
      } else {
        const withoutIntl = f.zonesIntervention.filter((z) => z !== 'international')
        next = withoutIntl.includes(zoneId) ? withoutIntl.filter((z) => z !== zoneId) : [...withoutIntl, zoneId]
      }
      return { ...f, zonesIntervention: next }
    })
  }

  async function handleFileChange(key: string, files: File[]) {
    if (files.length === 0 || uploadingDocs) return
    const categoryCount = documents[key]?.length ?? 0
    const totalCount = Object.values(documents).reduce((total, entries) => total + entries.length, 0)
    if (categoryCount + files.length > 5) return setError('Maximum 5 fichiers par catégorie.')
    if (totalCount + files.length > 10) return setError('Maximum 10 fichiers pour le dossier complet.')

    setError(null)
    setUploadingDocs(true)
    try {
      for (const file of files) {
        const entry = await uploadApplicationDocument(file)
        setDocuments((current) => ({ ...current, [key]: [...(current[key] || []), entry] }))
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Impossible d’envoyer le document.')
    } finally {
      setUploadingDocs(false)
    }
  }
  function removeDoc(key: string, index: number) {
    setDocuments((d) => ({ ...d, [key]: (d[key] || []).filter((_, i) => i !== index) }))
  }

  function next() {
    setError(null)
    if (step === 0) {
      const result = validatePrestataireStep0(form)
      if (!result.ok) return setError(result.error)
      if (mode === 'anonymous') {
        const cleanRegEmail = regEmail.trim().toLowerCase()
        if (!cleanRegEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanRegEmail)) return setError('Adresse e-mail invalide.')
        const passwordErrors = getPasswordPolicyErrors(regPassword)
        if (passwordErrors.length > 0) return setError(passwordErrors[0])
        if (regPassword !== regPasswordConfirm) return setError('Les mots de passe ne correspondent pas.')
      }
    }
    if (step === 2) {
      const result = validatePrestataireStep2(form)
      if (!result.ok) return setError(result.error)
    }
    if (mode === 'loggedIn') {
      setAutosaveState('saving')
      const cleanedForm = {
        ...form,
        prenom: form.prenom.trim(),
        nom: form.nom.trim(),
        telephone: form.telephone.trim(),
        ville: form.ville.trim(),
        nomCommercial: form.nomCommercial.trim(),
        nomScene: form.nomScene.trim(),
        siret: form.siret.trim(),
      }
      fetch('/api/applications/prestataire/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cleanedForm) })
        .then((res) => setAutosaveState(res.ok ? 'saved' : 'error'))
        .catch(() => setAutosaveState('error'))
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }
  function back() {
    setError(null)
    setStep((s) => Math.max(0, s - 1))
  }

  const requiredDocs = getRequiredDocs('prestataire', form.prestataireTypes)
  const missingDocs = requiredDocs.filter((key) => !(documents[key]?.length > 0))
  const candidateCurrency = regionToCurrency(form.pays)

  async function handleSubmit() {
    setError(null)
    if (missingDocs.length > 0) return setError('Certains documents obligatoires sont manquants.')

    const cleanedForm = {
      ...form,
      prenom: form.prenom.trim(),
      nom: form.nom.trim(),
      telephone: form.telephone.trim(),
      ville: form.ville.trim(),
      nomCommercial: form.nomCommercial.trim(),
      nomScene: form.nomScene.trim(),
      siret: form.siret.trim(),
    }

    setBusy(true)
    try {
      if (mode === 'anonymous') {
        const cleanRegEmail = regEmail.trim().toLowerCase()
        const res = await fetch('/api/applications/prestataire/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanRegEmail, password: regPassword, formData: cleanedForm, documents, candidateNote: candidateNote.trim() }),
        })
        const data = await res.json()
        if (!res.ok || !data.ok) {
          if (data.error === 'email_taken') {
            setError('Cet email est déjà associé à un compte. Connecte-toi à ce compte, puis débloque l’interface prestataire depuis ton profil.')
          } else {
            setError('Impossible d’envoyer ta demande. Réessaie.')
          }
          return
        }
        trackGrowthEvent(GROWTH_EVENT_NAMES.professionalApplicationSubmit, {
          role: 'prestataire',
          mode,
          country: cleanedForm.pays || null,
          has_city: Boolean(cleanedForm.ville),
          provider_type: cleanedForm.prestataireType || null,
          has_documents: Object.values(documents).some((entries) => entries.length > 0),
        })
        const login = await signIn('credentials', { email: cleanRegEmail, password: regPassword, redirect: false })
        if (login?.error) {
          setSubmitted({ email: cleanRegEmail })
          return
        }
        router.replace('/offer-services')
        router.refresh()
      } else {
        const res = await fetch('/api/applications/prestataire/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ formData: cleanedForm, documents, candidateNote: candidateNote.trim() }),
        })
        const data = await res.json()
        if (!res.ok || !data.ok) {
          setError('Impossible d’envoyer ton dossier. Réessaie.')
          return
        }
        trackGrowthEvent(GROWTH_EVENT_NAMES.professionalApplicationSubmit, {
          role: 'prestataire',
          mode,
          country: cleanedForm.pays || null,
          has_city: Boolean(cleanedForm.ville),
          provider_type: cleanedForm.prestataireType || null,
          has_documents: Object.values(documents).some((entries) => entries.length > 0),
        })
        await update({ activeRole: 'prestataire' })
        router.replace('/offer-services')
        router.refresh()
      }
    } finally {
      setBusy(false)
    }
  }

  // mode==='anonymous' : rendu à l'intérieur de AuthSplitLayout (voir
  // app/(public)/provider-signup/page.tsx), qui fournit déjà le plein écran
  // + le visuel gauche — ce composant ne doit alors pas poser son propre
  // <main> par-dessus. mode==='loggedIn' (onboarding-provider, connecté,
  // dans le layout applicatif normal) garde son <main> plein écran d'origine.
  const Shell = mode === 'anonymous' ? 'div' : 'main'

  if (submitted) {
    return (
      <Shell style={mode === 'anonymous' ? undefined : { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Card style={{ padding: 24, width: '100%', maxWidth: 760, textAlign: 'center' }}>
          <h1 className="font-display" style={{ fontSize: 'var(--font-size-title-1)', color: 'var(--text)', margin: '0 0 12px' }}>Demande envoyée</h1>
          <p style={{ fontSize: 'var(--font-size-body-sm)', color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 8px' }}>Ton dossier a été transmis à l&apos;équipe LIVEINBLACK.</p>
          <p style={{ fontSize: 'var(--font-size-body-sm)', color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 8px' }}>
            Tu seras contacté à <strong style={{ color: 'var(--text)' }}>{submitted.email}</strong> une fois ton compte validé.
          </p>
          <p style={{ fontSize: 'var(--font-size-callout)', color: 'var(--text-faint)', lineHeight: 1.6, margin: '0 0 24px' }}>La validation prend généralement moins de 24 h.</p>
          <a href={`/login?next=${encodeURIComponent('/offer-services')}`} style={{ display: 'inline-block', ...primaryBtn(false), textDecoration: 'none' }}>
            Accéder à mon espace prestataire
          </a>
        </Card>
      </Shell>
    )
  }

  const progress = Math.round(((step + 1) / STEPS.length) * 100)
  const types = form.prestataireTypes

  return (
    <Shell className={mode === 'anonymous' ? 'lb-auth-wizard' : undefined} style={mode === 'anonymous' ? undefined : { minHeight: '100vh', padding: '32px 16px 60px' }}>
      <div style={{ maxWidth: mode === 'anonymous' ? 560 : 1320, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: mode === 'anonymous' ? 12 : 20 }}>
        <div style={{ textAlign: mode === 'anonymous' ? 'center' : 'left' }}>
          <p style={{ fontSize: 'var(--font-size-body-sm)', fontWeight: 400, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '3.2px', fontFamily: 'var(--font-display), sans-serif', margin: '0 0 4px' }}>Demande d&apos;espace</p>
          <h1 className="font-display" style={{ fontSize: 'var(--font-size-large-title)', color: 'var(--text)', margin: '0 0 4px' }}>Compte Prestataire</h1>
          <p style={{ fontSize: 'var(--font-size-callout)', color: 'var(--text-muted)', margin: 0 }}>Complète ton dossier. Tu peux sauvegarder et revenir plus tard.</p>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: mode === 'anonymous' ? 'center' : 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 'var(--font-size-caption)', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase' }}>
              Étape {step + 1} / {STEPS.length} — {STEPS[step]}
            </span>
          </div>
          <div style={{ height: 5, borderRadius: 999, background: 'var(--fill-secondary)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, borderRadius: 999, background: 'var(--gold)' }} />
          </div>
        </div>

        <Card style={{ padding: mode === 'anonymous' ? '12px 16px' : 24 }}>
          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: mode === 'anonymous' ? 8 : 14 }}>
              <h2 style={{ fontSize: 'var(--font-size-body-sm)', fontWeight: 400, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '3.2px', fontFamily: 'var(--font-display), sans-serif', margin: 0 }}>Tes informations</h2>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <Label style={labelStyle}>Prénom</Label>
                  <Input aria-label="Prénom" style={inputStyle} value={form.prenom} onChange={(e) => set('prenom', e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <Label style={labelStyle}>Nom</Label>
                  <Input aria-label="Nom" style={inputStyle} value={form.nom} onChange={(e) => set('nom', e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ minWidth: 105, flexShrink: 0 }}>
                  <Select
                    aria-label="Indicatif téléphonique"
                    value={form.telephoneCode}
                    onChange={(value) => set('telephoneCode', value)}
                    options={regions.map((r) => ({ value: r.dial, label: `${r.flag} ${r.dial}` }))}
                    style={{ minHeight: 38, padding: '0 8px' }}
                  />
                </div>
                <Input aria-label="Téléphone" style={{ ...inputStyle, flex: 1 }} value={form.telephone} onChange={(e) => set('telephone', e.target.value)} placeholder="Téléphone" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: mode === 'anonymous' ? '6px 10px' : 14 }}>
                <div>
                  <Label style={labelStyle}>Ville</Label>
                  <Input aria-label="Ville" style={inputStyle} value={form.ville} onChange={(e) => set('ville', e.target.value)} placeholder="Paris, Lomé, Cotonou…" />
                </div>
                <div>
                  <Label style={labelStyle}>Pays</Label>
                  <Select
                    aria-label="Pays"
                    value={form.pays}
                    onChange={(value) => set('pays', value)}
                    options={regions.map((r) => ({ value: r.country, label: `${r.flag} ${r.country}` }))}
                  />
                </div>
              </div>

              {mode === 'anonymous' && (
                <>
                  <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <Label style={labelStyle}>Adresse e-mail (identifiant de connexion)</Label>
                      <Input aria-label="Adresse e-mail de connexion" style={inputStyle} type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} />
                    </div>
                    <div>
                      <Label style={labelStyle}>Mot de passe</Label>
                      <div style={{ position: 'relative' }}>
                        <Input
                          aria-label="Mot de passe"
                          style={{ ...inputStyle, paddingRight: 56 }}
                          type={showRegPwd ? 'text' : 'password'}
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                          placeholder="Minimum 8 caractères"
                        />
                        <Button
                          variant="ghost"
                          type="button"
                          aria-label={showRegPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                          onClick={() => setShowRegPwd((v) => !v)}
                          style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', padding: 4, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <IconEye open={showRegPwd} size={15} />
                        </Button>
                      </div>
                    </div>
                    <div>
                      <Label style={labelStyle}>Confirmer le mot de passe</Label>
                      <Input aria-label="Confirmation du mot de passe" style={inputStyle} type="password" value={regPasswordConfirm} onChange={(e) => setRegPasswordConfirm(e.target.value)} />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h2 style={{ fontSize: 'var(--font-size-body-sm)', fontWeight: 400, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '3.2px', fontFamily: 'var(--font-display), sans-serif', margin: 0 }}>Ton activité</h2>
              <div>
                <Label style={labelStyle}>Que proposes-tu ? (plusieurs choix possibles)</Label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {PROVIDER_CATEGORIES.map((cat) => (
                    <Button key={cat.id} variant="secondary" type="button" onClick={() => toggleProviderType(cat.id)} style={chip(types.includes(cat.id))}>
                      {cat.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <Label style={labelStyle}>Nom de ta page / nom commercial</Label>
                <Input style={inputStyle} value={form.nomCommercial} onChange={(e) => set('nomCommercial', e.target.value)} />
              </div>
              {types.includes('artiste') && (
                <div style={{ padding: 10, borderRadius: 10, background: 'var(--primary-a06)', border: '1px solid var(--primary-a20)' }}>
                  <Label style={labelStyle}>Nom de scène (visible car « Artiste » est sélectionné)</Label>
                  <Input style={inputStyle} value={form.nomScene} onChange={(e) => set('nomScene', e.target.value)} />
                </div>
              )}
              <div>
                <Label style={labelStyle}>Précise librement tes spécialités</Label>
                <Textarea style={{ ...inputStyle, minHeight: 60 }} value={form.specialitesLibre} onChange={(e) => set('specialitesLibre', e.target.value)} />
              </div>
              <div>
                <Label style={labelStyle}>Description courte</Label>
                <Textarea style={{ ...inputStyle, minHeight: 80 }} value={form.description} onChange={(e) => set('description', e.target.value)} />
              </div>
              <div>
                <Label style={labelStyle}>Zones d&apos;intervention</Label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <Button variant="secondary" type="button" onClick={() => toggleZone('international')} style={{ ...chip(form.zonesIntervention.includes('international')), display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Globe size={14} /> International
                  </Button>
                  {regions.map((r) => (
                    <Button key={r.id} variant="secondary" type="button" onClick={() => toggleZone(r.id)} style={chip(form.zonesIntervention.includes(r.id))}>
                      {r.flag} {r.name}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <Label style={labelStyle}>Numéro SIRET / SIREN (optionnel)</Label>
                <Input style={inputStyle} value={form.siret} onChange={(e) => set('siret', e.target.value)} placeholder="14 chiffres, ou 9 pour un SIREN" />
              </div>
            </div>
          )}

          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h2 style={{ fontSize: 'var(--font-size-body-sm)', fontWeight: 400, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '3.2px', fontFamily: 'var(--font-display), sans-serif', margin: 0 }}>Détails de ton activité</h2>

              {types.includes('artiste') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ fontSize: 'var(--font-size-body-sm)', fontWeight: 400, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '3.2px', fontFamily: 'var(--font-display), sans-serif', margin: 0 }}>Artiste / DJ / animation</p>
                  <Select
                    value={form.typeArtiste}
                    onChange={(value) => set('typeArtiste', value)}
                    options={[
                      { value: '', label: "Type d'artiste —" },
                      { value: 'dj', label: 'DJ' },
                      { value: 'musicien_live', label: 'Musicien live' },
                      { value: 'danseur', label: 'Danseur' },
                      { value: 'performeur', label: 'Performeur' },
                      { value: 'dj_sax', label: 'DJ + Saxophoniste' },
                      { value: 'orchestre', label: 'Orchestre' },
                      { value: 'animateur', label: 'Animateur' },
                      { value: 'humoriste', label: 'Humoriste' },
                      { value: 'autre', label: 'Autre' },
                    ]}
                  />
                  <Input style={inputStyle} value={form.styles} onChange={(e) => set('styles', e.target.value)} placeholder="Styles / genres" />
                  <Select
                    value={form.anneesExperience}
                    onChange={(value) => set('anneesExperience', value)}
                    options={[
                      { value: '', label: "Années d'expérience —" },
                      { value: 'moins_1', label: "Moins d'1 an" },
                      { value: '1_3', label: '1 à 3 ans' },
                      { value: '3_5', label: '3 à 5 ans' },
                      { value: '5_10', label: '5 à 10 ans' },
                      { value: 'plus_10', label: 'Plus de 10 ans' },
                    ]}
                  />
                  <Input style={inputStyle} value={form.portfolio} onChange={(e) => set('portfolio', e.target.value)} placeholder="Lien portfolio / mix" />
                  <Input style={inputStyle} value={form.instagram} onChange={(e) => set('instagram', e.target.value)} placeholder="Instagram" />
                  <Select
                    value={form.statutFacturation}
                    onChange={(value) => set('statutFacturation', value)}
                    options={[
                      { value: '', label: 'Statut de facturation —' },
                      { value: 'auto_entrepreneur', label: 'Auto-entrepreneur' },
                      { value: 'artiste_auteur', label: 'Artiste-auteur' },
                      { value: 'salarie_intermittent', label: 'Salarié intermittent' },
                      { value: 'structure', label: 'Structure / société' },
                      { value: 'autre', label: 'Autre' },
                    ]}
                  />
                  <Textarea style={{ ...inputStyle, minHeight: 60 }} value={form.besoinstechniques} onChange={(e) => set('besoinstechniques', e.target.value)} placeholder="Besoins techniques (optionnel)" />
                </div>
              )}

              {types.includes('salle') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ fontSize: 'var(--font-size-body-sm)', fontWeight: 400, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '3.2px', fontFamily: 'var(--font-display), sans-serif', margin: 0 }}>Salle / lieu</p>
                  <Input style={inputStyle} value={form.adresseLieu} onChange={(e) => set('adresseLieu', e.target.value)} placeholder="Adresse du lieu" />
                  <Input style={inputStyle} type="number" min={0} value={form.capaciteLieu ?? ''} onChange={(e) => set('capaciteLieu', e.target.value ? Number(e.target.value) : null)} placeholder="Capacité d'accueil" />
                  <Select
                    value={form.typeLieu}
                    onChange={(value) => set('typeLieu', value)}
                    options={[
                      { value: '', label: 'Type de lieu —' },
                      { value: 'salle_reception', label: 'Salle de réception' },
                      { value: 'loft', label: 'Loft' },
                      { value: 'rooftop', label: 'Rooftop' },
                      { value: 'club', label: 'Club' },
                      { value: 'chateau', label: 'Château' },
                      { value: 'warehouse', label: 'Warehouse' },
                      { value: 'plein_air', label: 'Plein air' },
                      { value: 'autre', label: 'Autre' },
                    ]}
                  />
                  <Input style={inputStyle} value={form.equipements} onChange={(e) => set('equipements', e.target.value)} placeholder="Équipements inclus" />
                  <Input style={inputStyle} value={form.horairesAutorises} onChange={(e) => set('horairesAutorises', e.target.value)} placeholder="Horaires autorisés" />
                  <Textarea style={{ ...inputStyle, minHeight: 60 }} value={form.reglesDuLieu} onChange={(e) => set('reglesDuLieu', e.target.value)} placeholder="Règles du lieu" />
                </div>
              )}

              {types.includes('materiel') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ fontSize: 'var(--font-size-body-sm)', fontWeight: 400, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '3.2px', fontFamily: 'var(--font-display), sans-serif', margin: 0 }}>Technique / matériel</p>
                  <Input style={inputStyle} value={form.categoriesMateriel} onChange={(e) => set('categoriesMateriel', e.target.value)} placeholder="Catégories de matériel" />
                  <Textarea style={{ ...inputStyle, minHeight: 60 }} value={form.inventaire} onChange={(e) => set('inventaire', e.target.value)} placeholder="Inventaire" />
                  <Textarea style={{ ...inputStyle, minHeight: 60 }} value={form.conditionsLocation} onChange={(e) => set('conditionsLocation', e.target.value)} placeholder="Conditions de location" />
                  <Input style={inputStyle} value={form.politiqueCaution} onChange={(e) => set('politiqueCaution', e.target.value)} placeholder="Politique de caution" />
                </div>
              )}

              {types.includes('food') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ fontSize: 'var(--font-size-body-sm)', fontWeight: 400, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '3.2px', fontFamily: 'var(--font-display), sans-serif', margin: 0 }}>Food / boissons</p>
                  <Select
                    value={form.typeActiviteFood}
                    onChange={(value) => set('typeActiviteFood', value)}
                    options={[
                      { value: '', label: "Type d'activité —" },
                      { value: 'traiteur', label: 'Traiteur' },
                      { value: 'boissons', label: 'Boissons' },
                      { value: 'cocktail', label: 'Bar / cocktails' },
                      { value: 'food_truck', label: 'Food truck' },
                      { value: 'desserts', label: 'Pâtisserie / desserts' },
                      { value: 'autre', label: 'Autre' },
                    ]}
                  />
                  <Textarea style={{ ...inputStyle, minHeight: 60 }} value={form.menuBase} onChange={(e) => set('menuBase', e.target.value)} placeholder="Menu de base" />
                  <Checkbox
                    label="Alcool proposé"
                    checked={form.alcoolFood}
                    onChange={(e) => set('alcoolFood', e.target.checked)}
                  />
                  {form.alcoolFood && (
                    <Checkbox
                      checked={form.alcoolFoodAtteste}
                      onChange={(e) => set('alcoolFoodAtteste', e.target.checked)}
                      style={{ alignItems: 'flex-start' }}
                      label={
                        <span style={{ fontSize: 'var(--font-size-footnote-lg)', color: 'var(--text-muted)', lineHeight: 1.5, fontWeight: 400 }}>
                          J&apos;atteste respecter la réglementation locale sur la vente d&apos;alcool et en assumer l&apos;entière responsabilité.
                        </span>
                      }
                    />
                  )}
                </div>
              )}

              {types.filter((t) => !['artiste', 'salle', 'materiel', 'food'].includes(t)).length > 0 && (
                <p style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--text-faint)', lineHeight: 1.5, margin: 0 }}>
                  Pas de champs spécifiques pour{' '}
                  {types
                    .filter((t) => !['artiste', 'salle', 'materiel', 'food'].includes(t))
                    .map((t) => PROVIDER_CATEGORIES.find((c) => c.id === t)?.label || t)
                    .join(', ')}{' '}
                  — la description libre renseignée à l&apos;étape précédente suffit.
                </p>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ fontSize: 'var(--font-size-body-sm)', fontWeight: 400, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '3.2px', fontFamily: 'var(--font-display), sans-serif', margin: 0 }}>Tarifs</p>
                <Checkbox
                  label="Sur devis uniquement"
                  checked={form.tarifDevis}
                  onChange={(e) => set('tarifDevis', e.target.checked)}
                />
                {!form.tarifDevis && (
                  <>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <Input style={inputStyle} type="number" min={0} value={form.tarifMin ?? ''} onChange={(e) => set('tarifMin', e.target.value ? Number(e.target.value) : null)} placeholder="Tarif min" />
                      <Input style={inputStyle} type="number" min={0} value={form.tarifMax ?? ''} onChange={(e) => set('tarifMax', e.target.value ? Number(e.target.value) : null)} placeholder="Tarif max" />
                    </div>
                    <Select
                      value={form.tarifType}
                      onChange={(value) => set('tarifType', value)}
                      options={[
                        { value: '', label: 'Type de tarif —' },
                        { value: 'soiree', label: 'Par soirée' },
                        { value: 'heure', label: 'Par heure' },
                        { value: 'journee', label: 'Par journée' },
                        { value: 'forfait', label: 'Forfait' },
                        { value: 'personne', label: 'Par personne' },
                      ]}
                    />
                  </>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h2 style={{ fontSize: 'var(--font-size-body-sm)', fontWeight: 400, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '3.2px', fontFamily: 'var(--font-display), sans-serif', margin: 0 }}>Comment ça marche</h2>
              {[
                ['01', 'Page publiée', 'Ta page prestataire est visible dans l’annuaire LIVEINBLACK.'],
                ['02', 'Catalogue consulté', 'Les organisateurs et clients consultent ton catalogue de services.'],
                ['03', 'Mise en relation directe', 'Ils te contactent par messagerie pour organiser la prestation.'],
              ].map(([n, title, body]) => (
                <div key={n} style={{ display: 'flex', gap: 12 }}>
                  <span style={{ fontSize: 'var(--font-size-callout)', fontWeight: 800, color: 'var(--gold)' }}>{n}</span>
                  <div>
                    <p style={{ fontSize: 'var(--font-size-body)', fontWeight: 700, color: 'var(--text)', margin: 0 }}>{title}</p>
                    <p style={{ fontSize: 'var(--font-size-footnote-lg)', color: 'var(--text-faint)', margin: '2px 0 0' }}>{body}</p>
                  </div>
                </div>
              ))}
              <p style={{ fontSize: 'var(--font-size-caption-lg)', color: 'var(--text-faint)', margin: 0 }}>
                LIVEINBLACK ne collecte pas le paiement de tes prestations et ne prélève aucune commission dessus.
              </p>
            </div>
          )}

          {step === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h2 style={{ fontSize: 'var(--font-size-body-sm)', fontWeight: 400, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '3.2px', fontFamily: 'var(--font-display), sans-serif', margin: 0 }}>Documents justificatifs</h2>
              <p style={{ fontSize: 'var(--font-size-footnote-lg)', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                Ces documents nous permettent de vérifier ton identité et la légitimité de ton activité. Ils sont stockés de façon privée et accessibles uniquement à
                l&apos;équipe LIVEINBLACK.
              </p>
              {requiredDocs.map((key) => (
                <DocUpload key={key} label={DOC_LABELS[key] || key} required docKey={key} documents={documents} onChange={handleFileChange} onRemove={removeDoc} />
              ))}
              {!requiredDocs.includes('insurance') && (
                <DocUpload label="Attestation d’assurance RC Pro (optionnel)" docKey="rc_pro" documents={documents} onChange={handleFileChange} onRemove={removeDoc} />
              )}
              {types.includes('food') && form.alcoolFood && (
                <DocUpload label="Licence / justificatif de débit de boissons" docKey="alcohol_license" documents={documents} onChange={handleFileChange} onRemove={removeDoc} />
              )}
            </div>
          )}

          {step === 5 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h2 style={{ fontSize: 'var(--font-size-body-sm)', fontWeight: 400, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '3.2px', fontFamily: 'var(--font-display), sans-serif', margin: 0 }}>Finaliser</h2>
              {missingDocs.length > 0 ? (
                <p style={{ fontSize: 'var(--font-size-footnote-lg)', color: 'var(--danger)', margin: 0 }}>
                  Documents manquants : {missingDocs.map((k) => DOC_LABELS[k] || k).join(', ')}
                </p>
              ) : (
                <p style={{ fontSize: 'var(--font-size-footnote-lg)', color: 'var(--primary)', margin: 0 }}>Tous les documents obligatoires sont fournis.</p>
              )}
              <p style={{ fontSize: 'var(--font-size-callout)', color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
                Une fois validé, ton compte est créé. Pour rendre ton profil visible publiquement, tu activeras ton abonnement depuis ton espace prestataire —{' '}
                {candidateCurrency === 'XOF'
                  ? `${fmtMoney(PROVIDER_SUB.price, 'XOF')} / ${PROVIDER_SUB.periodDays} j · Mobile Money`
                  : '9,99 € / mois · carte bancaire'}
                .
              </p>
              <div>
                <Label style={labelStyle}>Message pour l&apos;équipe (optionnel)</Label>
                <Textarea style={{ ...inputStyle, minHeight: 70 }} value={candidateNote} onChange={(e) => setCandidateNote(e.target.value)} />
              </div>
            </div>
          )}

          {error && <p style={{ fontSize: 'var(--font-size-footnote-lg)', color: 'var(--danger)', marginTop: 14 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
            {step > 0 && (
              <Button variant="secondary" onClick={back} style={{ padding: '13px 20px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text)' }}>
                Retour
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button onClick={next} style={{ ...primaryBtn(false), flex: 1 }}>
                Continuer
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={missingDocs.length > 0}
                loading={busy || uploadingDocs}
                loadingText={uploadingDocs ? 'Envoi des documents…' : 'Envoi…'}
                style={{ ...primaryBtn(busy || uploadingDocs || missingDocs.length > 0), flex: 1 }}
              >
                {mode === 'anonymous' ? 'Envoyer ma demande' : 'Soumettre mon dossier'}
              </Button>
            )}
          </div>
        </Card>

        <p style={{ fontSize: 'var(--font-size-caption)', color: 'var(--text-faint)', textAlign: 'center', margin: 0 }}>
          {mode === 'anonymous'
            ? 'Rien n’est encore enregistré : termine et envoie ta demande pour ne rien perdre.'
            : autosaveState === 'error'
              ? 'Échec de la dernière sauvegarde — vérifie ta connexion.'
              : autosaveState === 'saving'
                ? 'Sauvegarde du brouillon…'
                : autosaveState === 'saved'
                  ? 'Brouillon sauvegardé.'
                  : 'Le brouillon sera sauvegardé quand tu cliqueras sur Continuer.'}
        </p>
      </div>
    </Shell>
  )
}

function DocUpload({
  label,
  required,
  docKey,
  documents,
  onChange,
  onRemove,
}: {
  label: string
  required?: boolean
  docKey: string
  documents: Record<string, DocState[]>
  onChange: (key: string, files: File[]) => void
  onRemove: (key: string, index: number) => void
}) {
  const files = documents[docKey] || []
  const inputId = `doc-upload-${docKey}`
  return (
    <div>
      <Label style={labelStyle}>
        {label} {required && <span style={{ color: 'var(--gold)' }}>*</span>}
      </Label>
      <label
        htmlFor={inputId}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '9px 16px',
          borderRadius: 10,
          border: '1px solid var(--border-strong)',
          background: 'var(--surface-2)',
          color: 'var(--text-muted)',
          fontSize: 'var(--font-size-footnote-lg)',
          cursor: 'pointer',
        }}
      >
        Choisir un fichier
      </label>
      <input
        id={inputId}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        multiple
        onChange={(e) => {
          const selected = Array.from(e.currentTarget.files || [])
          e.currentTarget.value = ''
          void onChange(docKey, selected)
        }}
        style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', border: 0 }}
      />
      {files.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
          {files.map((f, i) => (
            <div key={f.publicId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--font-size-footnote)', color: 'var(--text-muted)' }}>
              <span>{f.name}</span>
              <Button variant="link" onClick={() => onRemove(docKey, i)} style={{ color: 'var(--danger)', fontSize: 'var(--font-size-footnote)', textDecoration: 'none' }}>
                Retirer
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
