'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { regions } from '@/lib/shared/regions'
import { getPasswordPolicyErrors } from '@/lib/shared/passwordPolicy'
import { validateOrganizerStep0, validateOrganizerStep1, type OrganizerFormData } from '@/lib/shared/applicationValidation'
import { uploadApplicationDocument } from '@/lib/client/applicationDocumentUpload'
import type { ApplicationDocumentUploadReference } from '@/lib/shared/applicationDocuments'

// Port de src/pages/OnboardingOrganisateur.jsx (#7 phase organisateur) — 4
// étapes (Établissement/Activité/Revenus/Documents), utilisé À LA FOIS par
// /inscription-organisateur (mode anonyme, pas de session) et
// /onboarding-organisateur (mode connecté, dossier déjà rattaché au compte).
// Contrairement au legacy (brouillon anonyme en localStorage, autosave
// cross-device en mode connecté via Firestore), ce port garde tout l'état du
// formulaire en mémoire React le temps du wizard ; le mode connecté persiste
// un brouillon serveur à chaque étape franchie (autosave), le mode anonyme
// ne persiste RIEN avant la soumission finale (voir lib/server/applications.ts).

const STEPS = ['Établissement', 'Activité', 'Revenus', 'Documents']

const EMPTY_FORM: OrganizerFormData = {
  nomCommercial: '',
  siret: '',
  emailPro: '',
  telephoneProCode: '+33',
  telephonePro: '',
  adresseEtablissement: '',
  noFixedAddress: false,
  siteWeb: '',
  typeEtablissement: '',
  typeEtablissementCustom: '',
  itinerant: false,
  ville: '',
  pays: 'France',
  zonesActivite: [],
  capacite: null,
  horaires: '',
  alcool: false,
  alcoolAtteste: false,
  description: '',
}

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24 }
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: '#fff', fontSize: 14, outline: 'none' }
const labelStyle: React.CSSProperties = { fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }
const primaryBtn = (disabled: boolean): React.CSSProperties => ({
  padding: '13px 26px',
  borderRadius: 10,
  border: 'none',
  background: 'linear-gradient(180deg,#d8bd8a,#c8a96e)',
  opacity: disabled ? 0.4 : 1,
  color: '#1a1508',
  fontWeight: 700,
  fontSize: 14,
  cursor: disabled ? 'default' : 'pointer',
})

const requiredMark = <span style={{ color: 'var(--gold)' }}>*</span>

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

type DocState = ApplicationDocumentUploadReference

export default function OrganizerOnboardingWizard({
  mode,
  initialFormData,
  initialCandidateNote,
}: {
  mode: 'anonymous' | 'loggedIn'
  initialFormData?: Partial<OrganizerFormData>
  initialCandidateNote?: string
}) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<OrganizerFormData>({ ...EMPTY_FORM, ...initialFormData })
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regPasswordConfirm, setRegPasswordConfirm] = useState('')
  const [showRegPassword, setShowRegPassword] = useState(false)
  const [documents, setDocuments] = useState<Record<string, DocState[]>>({})
  const [candidateNote, setCandidateNote] = useState(initialCandidateNote ?? '')
  const [error, setError] = useState<string | null>(null)
  const [emailTaken, setEmailTaken] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uploadingDocs, setUploadingDocs] = useState(false)
  const [submitted, setSubmitted] = useState<{ emailPro: string } | null>(null)
  const [autosaveState, setAutosaveState] = useState<'idle' | 'saved' | 'error'>('idle')

  function set<K extends keyof OrganizerFormData>(key: K, value: OrganizerFormData[K]) {
    setForm((f) => ({ ...f, [key]: value }))
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
    setEmailTaken(false)
    if (step === 0) {
      const result = validateOrganizerStep0(form)
      if (!result.ok) return setError(result.error)
      if (mode === 'anonymous') {
        if (!regEmail.trim() || !regEmail.includes('@')) return setError('Adresse e-mail invalide.')
        const passwordErrors = getPasswordPolicyErrors(regPassword)
        if (passwordErrors.length > 0) return setError(passwordErrors[0])
        if (regPassword !== regPasswordConfirm) return setError('Les mots de passe ne correspondent pas.')
      }
    }
    if (step === 1) {
      const result = validateOrganizerStep1(form)
      if (!result.ok) return setError(result.error)
    }
    if (mode === 'loggedIn') {
      fetch('/api/applications/organisateur/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        .then((res) => setAutosaveState(res.ok ? 'saved' : 'error'))
        .catch(() => {
          // Autosave best-effort — une étape perdue en cas de coupure réseau
          // n'empêche pas de continuer le wizard, seule la soumission finale
          // (handleSubmit) doit réellement aboutir. On informe quand même
          // l'utilisateur de l'échec via autosaveState (pied de page).
          setAutosaveState('error')
        })
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }
  function back() {
    setError(null)
    setStep((s) => Math.max(0, s - 1))
  }

  async function handleSubmit() {
    setError(null)
    setEmailTaken(false)
    if (!(documents.identity?.length > 0)) return setError("La pièce d'identité est obligatoire.")

    setBusy(true)
    try {
      if (mode === 'anonymous') {
        const res = await fetch('/api/applications/organisateur/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: regEmail.trim().toLowerCase(), password: regPassword, formData: form, documents, candidateNote }),
        })
        const data = await res.json()
        if (!res.ok || !data.ok) {
          if (data.error === 'email_taken') {
            setEmailTaken(true)
            setError('Cet email est déjà associé à un compte.')
          } else {
            setError('Impossible d’envoyer ta demande. Réessaie.')
          }
          return
        }
        setSubmitted({ emailPro: form.emailPro })
      } else {
        const res = await fetch('/api/applications/organisateur/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ formData: form, documents, candidateNote }),
        })
        const data = await res.json()
        if (!res.ok || !data.ok) {
          setError('Impossible d’envoyer ton dossier. Réessaie.')
          return
        }
        router.push('/my-application')
      }
    } finally {
      setBusy(false)
    }
  }

  if (submitted) {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ ...cardStyle, maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', margin: '0 0 12px' }}>Demande envoyée</h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 8px' }}>Ton dossier a été transmis à l&apos;équipe LIVEINBLACK.</p>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 8px' }}>
            Tu seras contacté à <strong style={{ color: '#fff' }}>{submitted.emailPro}</strong> une fois ton compte validé.
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-faint)', lineHeight: 1.6, margin: '0 0 24px' }}>La validation prend généralement moins de 24 h.</p>
          <Link href="/home" style={{ display: 'inline-block', ...primaryBtn(false), textDecoration: 'none' }}>
            Retour à l&apos;accueil
          </Link>
        </div>
      </main>
    )
  }

  const progress = Math.round(((step + 1) / STEPS.length) * 100)

  return (
    <main style={{ minHeight: '100vh', padding: '32px 16px 60px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>Demande d&apos;espace</p>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 0 6px' }}>Compte Organisateur</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Complète ton dossier. Tu peux sauvegarder et revenir plus tard.</p>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase' }}>
              Étape {step + 1} / {STEPS.length} — {STEPS[step]}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{progress}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, borderRadius: 999, background: 'var(--gold)' }} />
          </div>
        </div>

        <div style={cardStyle}>
          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: 0 }}>Informations de l&apos;établissement</h2>
              <div>
                <label style={labelStyle}>Nom de l&apos;établissement / commercial {requiredMark}</label>
                <input style={inputStyle} value={form.nomCommercial} onChange={(e) => set('nomCommercial', e.target.value)} placeholder="Ex : Club Neon, L|VE Events…" />
              </div>
              <div>
                <label style={labelStyle}>Numéro SIRET / SIREN {requiredMark}</label>
                <input style={inputStyle} value={form.siret} onChange={(e) => set('siret', e.target.value)} placeholder="14 chiffres, ou au moins 3 zéros si tu n'en as pas" />
              </div>
              <div>
                <label style={labelStyle}>Email professionnel {requiredMark}</label>
                <input
                  style={inputStyle}
                  type="email"
                  value={form.emailPro}
                  onChange={(e) => set('emailPro', e.target.value)}
                  placeholder="contact@monclub.com"
                />
              </div>
              <div>
                <label style={labelStyle}>Téléphone professionnel {requiredMark}</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select style={{ ...inputStyle, maxWidth: 150 }} value={form.telephoneProCode} onChange={(e) => set('telephoneProCode', e.target.value)}>
                    {regions.map((r) => (
                      <option key={r.id} value={r.dial}>
                        {r.flag} {r.country} {r.dial}
                      </option>
                    ))}
                  </select>
                  <input style={inputStyle} value={form.telephonePro} onChange={(e) => set('telephonePro', e.target.value)} placeholder="Téléphone professionnel" />
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#fff' }}>
                <input type="checkbox" checked={form.noFixedAddress} onChange={(e) => set('noFixedAddress', e.target.checked)} />
                Pas de lieu fixe (établissement en ligne / itinérant)
              </label>
              {!form.noFixedAddress && (
                <div>
                  <label style={labelStyle}>Adresse de l&apos;établissement {requiredMark}</label>
                  <input style={inputStyle} value={form.adresseEtablissement} onChange={(e) => set('adresseEtablissement', e.target.value)} />
                </div>
              )}
              <div>
                <label style={labelStyle}>Site web / Instagram</label>
                <input style={inputStyle} value={form.siteWeb} onChange={(e) => set('siteWeb', e.target.value)} placeholder="https://… ou @nom" />
              </div>

              {mode === 'anonymous' && (
                <>
                  <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                  <h3 style={{ fontSize: 13, fontWeight: 800, color: '#fff', margin: 0 }}>Ton compte de connexion</h3>
                  <div>
                    <label style={labelStyle}>Adresse e-mail (identifiant de connexion) {requiredMark}</label>
                    <input style={inputStyle} type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Mot de passe {requiredMark}</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        style={{ ...inputStyle, paddingRight: 56 }}
                        type={showRegPassword ? 'text' : 'password'}
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="Minimum 8 caractères"
                      />
                      <button
                        type="button"
                        aria-pressed={showRegPassword}
                        aria-label={showRegPassword ? 'Cacher le mot de passe' : 'Afficher le mot de passe'}
                        onClick={() => setShowRegPassword((v) => !v)}
                        style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        <IconEye open={showRegPassword} />
                        {showRegPassword ? 'Cacher' : 'Voir'}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Confirmer le mot de passe {requiredMark}</label>
                    <input style={inputStyle} type="password" value={regPasswordConfirm} onChange={(e) => setRegPasswordConfirm(e.target.value)} />
                  </div>
                  <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: 0 }}>Tu te connecteras avec l&apos;email professionnel ci-dessus.</p>
                </>
              )}
            </div>
          )}

          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: 0 }}>Description de l&apos;activité</h2>
              <div>
                <label style={labelStyle}>Type d&apos;établissement {requiredMark}</label>
                <select style={inputStyle} value={form.typeEtablissement} onChange={(e) => set('typeEtablissement', e.target.value)}>
                  <option value="">—</option>
                  <option value="Boîte / Club">Boîte / Club</option>
                  <option value="Bar">Bar</option>
                  <option value="Autre">Autre</option>
                </select>
              </div>
              {form.typeEtablissement === 'Autre' && (
                <input style={inputStyle} value={form.typeEtablissementCustom} onChange={(e) => set('typeEtablissementCustom', e.target.value)} placeholder="Précise le type" />
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#fff' }}>
                <input type="checkbox" checked={form.itinerant} onChange={(e) => set('itinerant', e.target.checked)} />
                Itinérant — j&apos;organise dans plusieurs villes / pays
              </label>
              {!form.itinerant ? (
                <>
                  <div>
                    <label style={labelStyle}>Ville {requiredMark}</label>
                    <input style={inputStyle} value={form.ville} onChange={(e) => set('ville', e.target.value)} placeholder="Paris" />
                  </div>
                  <div>
                    <label style={labelStyle}>Pays</label>
                    <select style={inputStyle} value={form.pays} onChange={(e) => set('pays', e.target.value)}>
                      {regions.map((r) => (
                        <option key={r.id} value={r.country}>
                          {r.flag} {r.country}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Capacité d&apos;accueil</label>
                    <input style={inputStyle} type="number" min={0} value={form.capacite ?? ''} onChange={(e) => set('capacite', e.target.value ? Number(e.target.value) : null)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Horaires habituels</label>
                    <input style={inputStyle} value={form.horaires} onChange={(e) => set('horaires', e.target.value)} placeholder="Ven-Sam 23h-07h" />
                  </div>
                </>
              ) : (
                <div>
                  <label style={labelStyle}>Zones d&apos;activité</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {regions.map((r) => {
                      const active = form.zonesActivite.includes(r.id)
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => set('zonesActivite', active ? form.zonesActivite.filter((z) => z !== r.id) : [...form.zonesActivite, r.id])}
                          style={{
                            padding: '8px 14px',
                            borderRadius: 999,
                            border: `1px solid ${active ? 'var(--gold)' : 'var(--border-strong)'}`,
                            background: active ? 'rgba(200,169,110,0.14)' : 'transparent',
                            color: active ? 'var(--gold)' : '#fff',
                            fontSize: 12.5,
                            cursor: 'pointer',
                          }}
                        >
                          {r.flag} {r.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              <div>
                <label style={labelStyle}>Description courte</label>
                <textarea style={{ ...inputStyle, minHeight: 80 }} maxLength={500} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Décris en quelques lignes ton activité, ton public, l'ambiance…" />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#fff' }}>
                <input type="checkbox" checked={form.alcool} onChange={(e) => set('alcool', e.target.checked)} />
                Alcool vendu sur place
              </label>
              {form.alcool && (
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  <input type="checkbox" checked={form.alcoolAtteste} onChange={(e) => set('alcoolAtteste', e.target.checked)} style={{ marginTop: 2 }} />
                  J&apos;atteste respecter la réglementation locale sur la vente d&apos;alcool et en assumer l&apos;entière responsabilité. Cette responsabilité t&apos;incombe entièrement —
                  LIVEINBLACK n&apos;est pas responsable de la conformité de ton activité.
                </label>
              )}
            </div>
          )}

          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: 0 }}>Tes revenus</h2>
              <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>Comment tu seras payé</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
                LIVEINBLACK collecte les paiements de tes billets et te reverse ta part directement sur ton compte bancaire. Les reversements sont gérés de façon
                entièrement automatique — tu n&apos;as rien à faire manuellement.
              </p>
              {[
                ['01', 'Dossier approuvé', 'Ton dossier est examiné par notre équipe.'],
                ['02', 'Connexion Stripe', 'Tu relies ton compte bancaire via Stripe, notre partenaire de paiement.'],
                ['03', 'Reversements automatiques', 'Tes ventes te sont reversées automatiquement, après commission LIVEINBLACK.'],
              ].map(([n, title, body]) => (
                <div key={n} style={{ display: 'flex', gap: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--gold)' }}>{n}</span>
                  <div>
                    <p style={{ fontSize: 13.5, fontWeight: 700, color: '#fff', margin: 0 }}>{title}</p>
                    <p style={{ fontSize: 12.5, color: 'var(--text-faint)', margin: '2px 0 0' }}>{body}</p>
                  </div>
                </div>
              ))}
              <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: 0 }}>
                Tes coordonnées bancaires ne transitent jamais par LIVEINBLACK. Stripe est certifié PCI-DSS niveau 1. Aucune information bancaire n&apos;est demandée ici
                — tu configureras tout après approbation.
              </p>
            </div>
          )}

          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: 0 }}>Documents justificatifs</h2>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                Ces documents nous permettent de vérifier ton identité et la légitimité de ton activité. Ils sont stockés de façon privée et accessibles uniquement à
                l&apos;équipe LIVEINBLACK. Formats acceptés : PDF, JPG, PNG — 10 Mo max par fichier.
              </p>
              <DocUpload label="Pièce d'identité" required docKey="identity" documents={documents} onChange={handleFileChange} onRemove={removeDoc} />
              <DocUpload label="Document officiel de l'entreprise (KBIS, statuts, récépissé INSEE…)" docKey="business_doc" documents={documents} onChange={handleFileChange} onRemove={removeDoc} />
              {form.alcool && (
                <DocUpload label="Licence / justificatif de débit de boissons" docKey="alcohol_license" documents={documents} onChange={handleFileChange} onRemove={removeDoc} />
              )}
              <div>
                <label style={labelStyle}>Message pour l&apos;équipe (optionnel)</label>
                <textarea style={{ ...inputStyle, minHeight: 70 }} value={candidateNote} onChange={(e) => setCandidateNote(e.target.value)} />
              </div>
            </div>
          )}

          {error && (
            <p style={{ fontSize: 12.5, color: '#e05aaa', marginTop: 14 }}>
              {error}{' '}
              {emailTaken && (
                <>
                  Connecte-toi à ce compte, puis débloque l’interface organisateur depuis ton profil :{' '}
                  <Link href="/login" style={{ color: '#e05aaa', textDecoration: 'underline' }}>
                    se connecter
                  </Link>
                  .
                </>
              )}
            </p>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
            {step > 0 && (
              <button onClick={back} style={{ padding: '13px 20px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'transparent', color: '#fff', cursor: 'pointer' }}>
                Retour
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button onClick={next} style={{ ...primaryBtn(false), flex: 1 }}>
                Continuer
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={busy || uploadingDocs} style={{ ...primaryBtn(busy || uploadingDocs), flex: 1 }}>
                {uploadingDocs ? 'Envoi des documents…' : busy ? 'Envoi…' : mode === 'anonymous' ? 'Envoyer ma demande' : 'Soumettre mon dossier'}
              </button>
            )}
          </div>
        </div>

        <p style={{ fontSize: 11, color: 'var(--text-faint)', textAlign: 'center', margin: 0 }}>
          {mode === 'anonymous'
            ? 'Rien n’est encore enregistré : termine et envoie ta demande pour ne rien perdre.'
            : autosaveState === 'error'
              ? 'Échec de la dernière sauvegarde automatique — vérifie ta connexion.'
              : autosaveState === 'saved'
                ? 'Brouillon sauvegardé.'
                : 'Le brouillon sera sauvegardé quand tu cliqueras sur Continuer.'}
        </p>
      </div>
    </main>
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
  return (
    <div>
      <label style={labelStyle}>
        {label} {required && <span style={{ color: 'var(--gold)' }}>*</span>}
      </label>
      <label style={{ display: 'inline-block', padding: '9px 14px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: '#fff', fontSize: 12.5, cursor: 'pointer' }}>
        + Ajouter un fichier
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          multiple
          onChange={(e) => {
            const selected = Array.from(e.currentTarget.files || [])
            e.currentTarget.value = ''
            void onChange(docKey, selected)
          }}
          style={{ display: 'none' }}
        />
      </label>
      {files.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          {files.map((f, i) => (
            <div key={f.publicId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--surface-2)', display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase' }}>
                  {f.format}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              </span>
              <button onClick={() => onRemove(docKey, i)} style={{ background: 'transparent', border: 'none', color: '#e05aaa', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}>
                Retirer
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
