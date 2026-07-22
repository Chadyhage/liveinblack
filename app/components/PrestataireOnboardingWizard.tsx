'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { regions } from '@/lib/shared/regions'
import { PROVIDER_CATEGORIES, getPrimaryProviderType } from '@/lib/shared/providerCategories'
import { regionToCurrency } from '@/lib/shared/money'
import { fmtMoney } from '@/lib/shared/money'
import { PROVIDER_SUB } from '@/lib/shared/providerSubscription'
import { validatePrestataireStep0, validatePrestataireStep2, getRequiredDocs, type PrestataireFormData } from '@/lib/shared/applicationValidation'

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
const chip = (active: boolean): React.CSSProperties => ({
  padding: '8px 14px',
  borderRadius: 999,
  border: `1px solid ${active ? 'var(--gold)' : 'var(--border-strong)'}`,
  background: active ? 'rgba(200,169,110,0.14)' : 'transparent',
  color: active ? 'var(--gold)' : '#fff',
  fontSize: 12.5,
  cursor: 'pointer',
})

const DOC_LABELS: Record<string, string> = {
  identity: "Pièce d'identité",
  billing_proof: 'Justificatif de facturation (auto-entrepreneur, statut artiste…)',
  business_doc: "Document officiel de l'entreprise (KBIS, statuts, récépissé INSEE…)",
  insurance: 'Attestation d’assurance responsabilité civile professionnelle',
  exploitation_proof: "Justificatif d'exploitation du lieu (bail, autorisation…)",
}

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
  const [submitted, setSubmitted] = useState<{ email: string } | null>(null)

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
      const result = validatePrestataireStep0(form)
      if (!result.ok) return setError(result.error)
      if (mode === 'anonymous') {
        if (!regEmail.trim() || !regEmail.includes('@')) return setError('Adresse e-mail invalide.')
        if (regPassword.length < 8) return setError('Le mot de passe doit faire au moins 8 caractères.')
        if (regPassword !== regPasswordConfirm) return setError('Les mots de passe ne correspondent pas.')
      }
    }
    if (step === 2) {
      const result = validatePrestataireStep2(form)
      if (!result.ok) return setError(result.error)
    }
    if (mode === 'loggedIn') {
      fetch('/api/applications/prestataire/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }).catch(() => {
        // Autosave best-effort — voir OrganizerOnboardingWizard.tsx.
      })
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

    setBusy(true)
    try {
      if (mode === 'anonymous') {
        const res = await fetch('/api/applications/prestataire/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: regEmail.trim().toLowerCase(), password: regPassword, formData: form, documents, candidateNote }),
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
        setSubmitted({ email: regEmail.trim().toLowerCase() })
      } else {
        const res = await fetch('/api/applications/prestataire/submit', {
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
            Tu seras contacté à <strong style={{ color: '#fff' }}>{submitted.email}</strong> une fois ton compte validé.
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
  const types = form.prestataireTypes

  return (
    <main style={{ minHeight: '100vh', padding: '32px 16px 60px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>Demande d&apos;espace</p>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 0 6px' }}>Compte Prestataire</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Complète ton dossier. Tu peux sauvegarder et revenir plus tard.</p>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase' }}>
              Étape {step + 1} / {STEPS.length} — {STEPS[step]}
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, borderRadius: 999, background: 'var(--gold)' }} />
          </div>
        </div>

        <div style={cardStyle}>
          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: 0 }}>Tes informations</h2>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Prénom</label>
                  <input style={inputStyle} value={form.prenom} onChange={(e) => set('prenom', e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Nom</label>
                  <input style={inputStyle} value={form.nom} onChange={(e) => set('nom', e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <select style={{ ...inputStyle, maxWidth: 110 }} value={form.telephoneCode} onChange={(e) => set('telephoneCode', e.target.value)}>
                  {regions.map((r) => (
                    <option key={r.id} value={r.dial}>
                      {r.flag} {r.dial}
                    </option>
                  ))}
                </select>
                <input style={inputStyle} value={form.telephone} onChange={(e) => set('telephone', e.target.value)} placeholder="Téléphone" />
              </div>
              <div>
                <label style={labelStyle}>Ville</label>
                <input style={inputStyle} value={form.ville} onChange={(e) => set('ville', e.target.value)} placeholder="Paris, Lomé, Cotonou…" />
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

              {mode === 'anonymous' && (
                <>
                  <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                  <div>
                    <label style={labelStyle}>Adresse e-mail (identifiant de connexion)</label>
                    <input style={inputStyle} type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Mot de passe</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        style={{ ...inputStyle, paddingRight: 56 }}
                        type={showRegPwd ? 'text' : 'password'}
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="Minimum 8 caractères"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPwd((v) => !v)}
                        style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        {showRegPwd ? 'Cacher' : 'Voir'}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Confirmer le mot de passe</label>
                    <input style={inputStyle} type="password" value={regPasswordConfirm} onChange={(e) => setRegPasswordConfirm(e.target.value)} />
                  </div>
                </>
              )}
            </div>
          )}

          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: 0 }}>Ton activité</h2>
              <div>
                <label style={labelStyle}>Que proposes-tu ? (plusieurs choix possibles)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {PROVIDER_CATEGORIES.map((cat) => (
                    <button key={cat.id} type="button" onClick={() => toggleProviderType(cat.id)} style={chip(types.includes(cat.id))}>
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Nom de ta page / nom commercial</label>
                <input style={inputStyle} value={form.nomCommercial} onChange={(e) => set('nomCommercial', e.target.value)} />
              </div>
              {types.includes('artiste') && (
                <div style={{ padding: 10, borderRadius: 10, background: 'rgba(200,169,110,0.06)', border: '1px solid rgba(200,169,110,0.2)' }}>
                  <label style={labelStyle}>Nom de scène (visible car « Artiste » est sélectionné)</label>
                  <input style={inputStyle} value={form.nomScene} onChange={(e) => set('nomScene', e.target.value)} />
                </div>
              )}
              <div>
                <label style={labelStyle}>Précise librement tes spécialités</label>
                <textarea style={{ ...inputStyle, minHeight: 60 }} value={form.specialitesLibre} onChange={(e) => set('specialitesLibre', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Description courte</label>
                <textarea style={{ ...inputStyle, minHeight: 80 }} value={form.description} onChange={(e) => set('description', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Zones d&apos;intervention</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button type="button" onClick={() => toggleZone('international')} style={chip(form.zonesIntervention.includes('international'))}>
                    🌍 International
                  </button>
                  {regions.map((r) => (
                    <button key={r.id} type="button" onClick={() => toggleZone(r.id)} style={chip(form.zonesIntervention.includes(r.id))}>
                      {r.flag} {r.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Numéro SIRET / SIREN (optionnel)</label>
                <input style={inputStyle} value={form.siret} onChange={(e) => set('siret', e.target.value)} placeholder="14 chiffres, ou 9 pour un SIREN" />
              </div>
            </div>
          )}

          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: 0 }}>Détails de ton activité</h2>

              {types.includes('artiste') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', margin: 0 }}>Artiste / DJ / animation</p>
                  <select style={inputStyle} value={form.typeArtiste} onChange={(e) => set('typeArtiste', e.target.value)}>
                    <option value="">Type d&apos;artiste —</option>
                    <option value="dj">DJ</option>
                    <option value="musicien_live">Musicien live</option>
                    <option value="danseur">Danseur</option>
                    <option value="performeur">Performeur</option>
                    <option value="dj_sax">DJ + Saxophoniste</option>
                    <option value="orchestre">Orchestre</option>
                    <option value="animateur">Animateur</option>
                    <option value="humoriste">Humoriste</option>
                    <option value="autre">Autre</option>
                  </select>
                  <input style={inputStyle} value={form.styles} onChange={(e) => set('styles', e.target.value)} placeholder="Styles / genres" />
                  <select style={inputStyle} value={form.anneesExperience} onChange={(e) => set('anneesExperience', e.target.value)}>
                    <option value="">Années d&apos;expérience —</option>
                    <option value="moins_1">Moins d&apos;1 an</option>
                    <option value="1_3">1 à 3 ans</option>
                    <option value="3_5">3 à 5 ans</option>
                    <option value="5_10">5 à 10 ans</option>
                    <option value="plus_10">Plus de 10 ans</option>
                  </select>
                  <input style={inputStyle} value={form.portfolio} onChange={(e) => set('portfolio', e.target.value)} placeholder="Lien portfolio / mix" />
                  <input style={inputStyle} value={form.instagram} onChange={(e) => set('instagram', e.target.value)} placeholder="Instagram" />
                  <select style={inputStyle} value={form.statutFacturation} onChange={(e) => set('statutFacturation', e.target.value)}>
                    <option value="">Statut de facturation —</option>
                    <option value="auto_entrepreneur">Auto-entrepreneur</option>
                    <option value="artiste_auteur">Artiste-auteur</option>
                    <option value="salarie_intermittent">Salarié intermittent</option>
                    <option value="structure">Structure / société</option>
                    <option value="autre">Autre</option>
                  </select>
                  <textarea style={{ ...inputStyle, minHeight: 60 }} value={form.besoinstechniques} onChange={(e) => set('besoinstechniques', e.target.value)} placeholder="Besoins techniques (optionnel)" />
                </div>
              )}

              {types.includes('salle') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', margin: 0 }}>Salle / lieu</p>
                  <input style={inputStyle} value={form.adresseLieu} onChange={(e) => set('adresseLieu', e.target.value)} placeholder="Adresse du lieu" />
                  <input style={inputStyle} type="number" min={0} value={form.capaciteLieu ?? ''} onChange={(e) => set('capaciteLieu', e.target.value ? Number(e.target.value) : null)} placeholder="Capacité d'accueil" />
                  <select style={inputStyle} value={form.typeLieu} onChange={(e) => set('typeLieu', e.target.value)}>
                    <option value="">Type de lieu —</option>
                    <option value="salle_reception">Salle de réception</option>
                    <option value="loft">Loft</option>
                    <option value="rooftop">Rooftop</option>
                    <option value="club">Club</option>
                    <option value="chateau">Château</option>
                    <option value="warehouse">Warehouse</option>
                    <option value="plein_air">Plein air</option>
                    <option value="autre">Autre</option>
                  </select>
                  <input style={inputStyle} value={form.equipements} onChange={(e) => set('equipements', e.target.value)} placeholder="Équipements inclus" />
                  <input style={inputStyle} value={form.horairesAutorises} onChange={(e) => set('horairesAutorises', e.target.value)} placeholder="Horaires autorisés" />
                  <textarea style={{ ...inputStyle, minHeight: 60 }} value={form.reglesDuLieu} onChange={(e) => set('reglesDuLieu', e.target.value)} placeholder="Règles du lieu" />
                </div>
              )}

              {types.includes('materiel') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', margin: 0 }}>Technique / matériel</p>
                  <input style={inputStyle} value={form.categoriesMateriel} onChange={(e) => set('categoriesMateriel', e.target.value)} placeholder="Catégories de matériel" />
                  <textarea style={{ ...inputStyle, minHeight: 60 }} value={form.inventaire} onChange={(e) => set('inventaire', e.target.value)} placeholder="Inventaire" />
                  <textarea style={{ ...inputStyle, minHeight: 60 }} value={form.conditionsLocation} onChange={(e) => set('conditionsLocation', e.target.value)} placeholder="Conditions de location" />
                  <input style={inputStyle} value={form.politiqueCaution} onChange={(e) => set('politiqueCaution', e.target.value)} placeholder="Politique de caution" />
                </div>
              )}

              {types.includes('food') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', margin: 0 }}>Food / boissons</p>
                  <select style={inputStyle} value={form.typeActiviteFood} onChange={(e) => set('typeActiviteFood', e.target.value)}>
                    <option value="">Type d&apos;activité —</option>
                    <option value="traiteur">Traiteur</option>
                    <option value="boissons">Boissons</option>
                    <option value="cocktail">Bar / cocktails</option>
                    <option value="food_truck">Food truck</option>
                    <option value="desserts">Pâtisserie / desserts</option>
                    <option value="autre">Autre</option>
                  </select>
                  <textarea style={{ ...inputStyle, minHeight: 60 }} value={form.menuBase} onChange={(e) => set('menuBase', e.target.value)} placeholder="Menu de base" />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#fff' }}>
                    <input type="checkbox" checked={form.alcoolFood} onChange={(e) => set('alcoolFood', e.target.checked)} />
                    Alcool proposé
                  </label>
                  {form.alcoolFood && (
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                      <input type="checkbox" checked={form.alcoolFoodAtteste} onChange={(e) => set('alcoolFoodAtteste', e.target.checked)} style={{ marginTop: 2 }} />
                      J&apos;atteste respecter la réglementation locale sur la vente d&apos;alcool et en assumer l&apos;entière responsabilité.
                    </label>
                  )}
                </div>
              )}

              {types.filter((t) => !['artiste', 'salle', 'materiel', 'food'].includes(t)).length > 0 && (
                <p style={{ fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.5, margin: 0 }}>
                  Pas de champs spécifiques pour{' '}
                  {types
                    .filter((t) => !['artiste', 'salle', 'materiel', 'food'].includes(t))
                    .map((t) => PROVIDER_CATEGORIES.find((c) => c.id === t)?.label || t)
                    .join(', ')}{' '}
                  — la description libre renseignée à l&apos;étape précédente suffit.
                </p>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', margin: 0 }}>Tarifs</p>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#fff' }}>
                  <input type="checkbox" checked={form.tarifDevis} onChange={(e) => set('tarifDevis', e.target.checked)} />
                  Sur devis uniquement
                </label>
                {!form.tarifDevis && (
                  <>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <input style={inputStyle} type="number" min={0} value={form.tarifMin ?? ''} onChange={(e) => set('tarifMin', e.target.value ? Number(e.target.value) : null)} placeholder="Tarif min" />
                      <input style={inputStyle} type="number" min={0} value={form.tarifMax ?? ''} onChange={(e) => set('tarifMax', e.target.value ? Number(e.target.value) : null)} placeholder="Tarif max" />
                    </div>
                    <select style={inputStyle} value={form.tarifType} onChange={(e) => set('tarifType', e.target.value)}>
                      <option value="">Type de tarif —</option>
                      <option value="soiree">Par soirée</option>
                      <option value="heure">Par heure</option>
                      <option value="journee">Par journée</option>
                      <option value="forfait">Forfait</option>
                      <option value="personne">Par personne</option>
                    </select>
                  </>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: 0 }}>Comment ça marche</h2>
              {[
                ['01', 'Page publiée', 'Ta page prestataire est visible dans l’annuaire LIVEINBLACK.'],
                ['02', 'Catalogue consulté', 'Les organisateurs et clients consultent ton catalogue de services.'],
                ['03', 'Mise en relation directe', 'Ils te contactent par messagerie pour organiser la prestation.'],
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
                LIVEINBLACK ne collecte pas le paiement de tes prestations et ne prélève aucune commission dessus.
              </p>
            </div>
          )}

          {step === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: 0 }}>Documents justificatifs</h2>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
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
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: 0 }}>Finaliser</h2>
              {missingDocs.length > 0 ? (
                <p style={{ fontSize: 12.5, color: '#e05aaa', margin: 0 }}>
                  Documents manquants : {missingDocs.map((k) => DOC_LABELS[k] || k).join(', ')}
                </p>
              ) : (
                <p style={{ fontSize: 12.5, color: 'var(--teal)', margin: 0 }}>Tous les documents obligatoires sont fournis.</p>
              )}
              <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
                Une fois validé, ton compte est créé. Pour rendre ton profil visible publiquement, tu activeras ton abonnement depuis ton espace prestataire —{' '}
                {candidateCurrency === 'XOF'
                  ? `${fmtMoney(PROVIDER_SUB.price, 'XOF')} / ${PROVIDER_SUB.periodDays} j · Mobile Money`
                  : '9,99 € / mois · carte bancaire'}
                .
              </p>
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
              <button onClick={handleSubmit} disabled={busy || missingDocs.length > 0} style={{ ...primaryBtn(busy || missingDocs.length > 0), flex: 1 }}>
                {busy ? 'Envoi…' : mode === 'anonymous' ? 'Envoyer ma demande' : 'Soumettre mon dossier'}
              </button>
            )}
          </div>
        </div>

        <p style={{ fontSize: 11, color: 'var(--text-faint)', textAlign: 'center', margin: 0 }}>
          {mode === 'anonymous' ? 'Rien n’est encore enregistré : termine et envoie ta demande pour ne rien perdre.' : 'Sauvegarde automatique activée'}
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
  const inputId = `doc-upload-${docKey}`
  return (
    <div>
      <label style={labelStyle}>
        {label} {required && <span style={{ color: 'var(--gold)' }}>*</span>}
      </label>
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
          fontSize: 12.5,
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
        onChange={(e) => onChange(docKey, e.target.files)}
        style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', border: 0 }}
      />
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
