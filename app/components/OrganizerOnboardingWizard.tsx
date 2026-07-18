'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { regions } from '@/lib/shared/regions'
import { validateOrganizerStep0, validateOrganizerStep1, type OrganizerFormData } from '@/lib/shared/applicationValidation'

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
  background: disabled ? 'rgba(200,169,110,0.3)' : 'linear-gradient(180deg,#d8bd8a,#c8a96e)',
  color: '#1a1508',
  fontWeight: 700,
  fontSize: 14,
  cursor: disabled ? 'default' : 'pointer',
})

function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

interface DocState {
  name: string
  dataUri: string
}

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
  const [documents, setDocuments] = useState<Record<string, DocState[]>>({})
  const [candidateNote, setCandidateNote] = useState(initialCandidateNote ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState<{ emailPro: string } | null>(null)

  function set<K extends keyof OrganizerFormData>(key: K, value: OrganizerFormData[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleFileChange(key: string, fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    const entries: DocState[] = []
    for (const file of Array.from(fileList)) {
      entries.push({ name: file.name, dataUri: await fileToDataUri(file) })
    }
    setDocuments((d) => ({ ...d, [key]: [...(d[key] || []), ...entries] }))
  }
  function removeDoc(key: string, index: number) {
    setDocuments((d) => ({ ...d, [key]: (d[key] || []).filter((_, i) => i !== index) }))
  }

  function next() {
    setError(null)
    if (step === 0) {
      const result = validateOrganizerStep0(form)
      if (!result.ok) return setError(result.error)
      if (mode === 'anonymous') {
        if (!regEmail.trim() || !regEmail.includes('@')) return setError('Adresse e-mail invalide.')
        if (regPassword.length < 8) return setError('Le mot de passe doit faire au moins 8 caractères.')
        if (regPassword !== regPasswordConfirm) return setError('Les mots de passe ne correspondent pas.')
      }
    }
    if (step === 1) {
      const result = validateOrganizerStep1(form)
      if (!result.ok) return setError(result.error)
    }
    if (mode === 'loggedIn') {
      fetch('/api/applications/organisateur/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }).catch(() => {
        // Autosave best-effort — une étape perdue en cas de coupure réseau
        // n'empêche pas de continuer le wizard, seule la soumission finale
        // (handleSubmit) doit réellement aboutir.
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
            setError('Cet email est déjà associé à un compte. Connecte-toi à ce compte, puis débloque l’interface organisateur depuis ton profil.')
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
          <a href="/home" style={{ display: 'inline-block', ...primaryBtn(false), textDecoration: 'none' }}>
            Retour à l&apos;accueil
          </a>
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
                <label style={labelStyle}>Nom de l&apos;établissement / commercial</label>
                <input style={inputStyle} value={form.nomCommercial} onChange={(e) => set('nomCommercial', e.target.value)} placeholder="Ex : Club Neon, L|VE Events…" />
              </div>
              <div>
                <label style={labelStyle}>Numéro SIRET / SIREN</label>
                <input style={inputStyle} value={form.siret} onChange={(e) => set('siret', e.target.value)} placeholder="14 chiffres, ou des zéros si tu n'en as pas" />
              </div>
              <div>
                <label style={labelStyle}>Email professionnel</label>
                <input
                  style={inputStyle}
                  type="email"
                  value={form.emailPro}
                  onChange={(e) => set('emailPro', e.target.value)}
                  placeholder="contact@monclub.com"
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <select style={{ ...inputStyle, maxWidth: 110 }} value={form.telephoneProCode} onChange={(e) => set('telephoneProCode', e.target.value)}>
                  {regions.map((r) => (
                    <option key={r.id} value={r.dial}>
                      {r.flag} {r.dial}
                    </option>
                  ))}
                </select>
                <input style={inputStyle} value={form.telephonePro} onChange={(e) => set('telephonePro', e.target.value)} placeholder="Téléphone professionnel" />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#fff' }}>
                <input type="checkbox" checked={form.noFixedAddress} onChange={(e) => set('noFixedAddress', e.target.checked)} />
                Pas de lieu fixe (établissement en ligne / itinérant)
              </label>
              {!form.noFixedAddress && (
                <div>
                  <label style={labelStyle}>Adresse de l&apos;établissement</label>
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
                  <div>
                    <label style={labelStyle}>Adresse e-mail (identifiant de connexion)</label>
                    <input style={inputStyle} type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Mot de passe</label>
                    <input style={inputStyle} type="password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} placeholder="Minimum 8 caractères" />
                  </div>
                  <div>
                    <label style={labelStyle}>Confirmer le mot de passe</label>
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
                <label style={labelStyle}>Type d&apos;établissement</label>
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
                    <label style={labelStyle}>Ville</label>
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
                <textarea style={{ ...inputStyle, minHeight: 80 }} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Décris en quelques lignes ton activité, ton public, l'ambiance…" />
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
                l&apos;équipe LIVEINBLACK.
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

          {error && <p style={{ fontSize: 12.5, color: '#e05aaa', marginTop: 14 }}>{error}</p>}

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
              <button onClick={handleSubmit} disabled={busy} style={{ ...primaryBtn(busy), flex: 1 }}>
                {busy ? 'Envoi…' : mode === 'anonymous' ? 'Envoyer ma demande' : 'Soumettre mon dossier'}
              </button>
            )}
          </div>
        </div>

        <p style={{ fontSize: 11, color: 'var(--text-faint)', textAlign: 'center', margin: 0 }}>
          {mode === 'anonymous' ? 'Brouillon enregistré sur cet appareil' : 'Sauvegarde automatique activée'}
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
  onChange: (key: string, files: FileList | null) => void
  onRemove: (key: string, index: number) => void
}) {
  const files = documents[docKey] || []
  return (
    <div>
      <label style={labelStyle}>
        {label} {required && <span style={{ color: 'var(--gold)' }}>*</span>}
      </label>
      <input type="file" accept=".pdf,.jpg,.jpeg,.png" multiple onChange={(e) => onChange(docKey, e.target.files)} style={{ fontSize: 12.5, color: 'var(--text-muted)' }} />
      {files.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
          {files.map((f, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
              <span>{f.name}</span>
              <button onClick={() => onRemove(docKey, i)} style={{ background: 'transparent', border: 'none', color: '#e05aaa', cursor: 'pointer', fontSize: 12 }}>
                Retirer
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
