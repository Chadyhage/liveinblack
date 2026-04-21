import { useState } from 'react'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'

const STEPS = ['Infos boîte', 'Options', 'Louer ma salle', 'Confirmation']

const OPTION_DEFAULTS = {
  playlist: true,
  preorder: true,
  qr: true,
  featured: false,
}

// ── Shared inline style constants ──────────────────────────────────────────────
const S = {
  card: {
    background: 'rgba(8,10,20,0.55)',
    backdropFilter: 'blur(22px) saturate(1.6)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 12,
  },
  inputBase: {
    background: 'rgba(6,8,16,0.6)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 4,
    fontFamily: "'DM Mono', monospace",
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    padding: '10px 14px',
    width: '100%',
    outline: 'none',
    boxSizing: 'border-box',
  },
  label: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 9,
    letterSpacing: '0.35em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.28)',
    display: 'block',
    marginBottom: 6,
  },
  btnGold: {
    padding: '13px 28px',
    background: 'linear-gradient(135deg, rgba(200,169,110,0.22), rgba(200,169,110,0.06))',
    border: '1px solid rgba(200,169,110,0.45)',
    borderRadius: 4,
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    letterSpacing: '0.25em',
    textTransform: 'uppercase',
    color: '#c8a96e',
    cursor: 'pointer',
    width: '100%',
  },
  btnGhost: {
    padding: '13px 28px',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: 4,
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    letterSpacing: '0.25em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.5)',
    cursor: 'pointer',
    width: '100%',
  },
  btnPrimary: {
    padding: '13px 28px',
    background: 'linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.06) 50%, rgba(78,232,200,0.12) 100%)',
    border: '1px solid rgba(255,255,255,0.28)',
    borderRadius: 4,
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    letterSpacing: '0.25em',
    textTransform: 'uppercase',
    color: 'white',
    cursor: 'pointer',
    width: '100%',
  },
}

// ── Eyebrow heading helper ──────────────────────────────────────────────────────
function Eyebrow({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <div style={{ width: 28, height: 1, background: '#4ee8c8', flexShrink: 0 }} />
      <span style={{
        fontFamily: "'DM Mono', monospace",
        fontSize: 9,
        letterSpacing: '0.4em',
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.25)',
      }}>{children}</span>
    </div>
  )
}

export default function JeSuisUneBoitePage() {
  const { user } = useAuth()
  const [step, setStep] = useState(0)
  const [wantsToRent, setWantsToRent] = useState(null)
  const [submitted, setSubmitted] = useState(false)

  const [boiteForm, setBoiteForm] = useState({
    name: '',
    siret: '',
    manager: '',
    email: '',
    phone: '',
    address: '',
    noFixedAddress: false,
    website: '',
  })

  const [toggles, setToggles] = useState(OPTION_DEFAULTS)

  const [rentForm, setRentForm] = useState({
    capacity: '',
    priceMon: '',
    priceFri: '',
    priceSun: '',
    conditions: '',
  })

  const features = [
    { icon: 'ticket', label: 'Vendre des places', desc: 'Billetterie intégrée avec tous types de places' },
    { icon: 'music', label: 'Playlist interactive', desc: 'Laisse tes clients voter pour les sons' },
    { icon: 'chart', label: 'Dashboard analytics', desc: 'Suis tes ventes et ta performance en temps réel' },
    { icon: 'star', label: 'Mise en avant', desc: 'Passe en top 3 de ta région (payant)' },
    { icon: 'cart', label: 'Précommande de conso', desc: "Tes clients commandent à l'avance" },
  ]

  const featureIcons = {
    ticket: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c8a96e" strokeWidth="1.5">
        <path d="M2 9a1 1 0 011-1h1a2 2 0 100-4H3a1 1 0 01-1-1V4a2 2 0 012-2h14a2 2 0 012 2v1a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v1a2 2 0 01-2 2H4a2 2 0 01-2-2V9z"/>
      </svg>
    ),
    music: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c8a96e" strokeWidth="1.5">
        <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
      </svg>
    ),
    chart: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c8a96e" strokeWidth="1.5">
        <path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 4-6"/>
      </svg>
    ),
    star: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c8a96e" strokeWidth="1.5">
        <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
      </svg>
    ),
    cart: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c8a96e" strokeWidth="1.5">
        <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
        <path d="M1 1h4l2.68 13.39a2 2 0 001.99 1.61h9.72a2 2 0 001.99-1.61L23 6H6"/>
      </svg>
    ),
  }

  async function handleSubmit() {
    const registration = {
      id: 'boite-' + Date.now(),
      ...boiteForm,
      address: boiteForm.noFixedAddress ? null : boiteForm.address,
      options: toggles,
      wantsToRent,
      rentDetails: wantsToRent ? rentForm : null,
      submittedAt: new Date().toISOString(),
      userId: user?.uid || null,
      userEmail: user?.email || boiteForm.email || null,
    }
    try {
      localStorage.setItem('lib_boite_registration', JSON.stringify(registration))
    } catch {}

    // If user is logged in, also create a formal application dossier
    if (user?.uid) {
      try {
        const { createApplication, submitApplication } = await import('../utils/applications')
        const app = createApplication(user.uid, user.email || boiteForm.email, user.name || boiteForm.manager, 'organisateur')
        if (app) {
          await submitApplication(app.id, {
            nomCommercial: boiteForm.name,
            emailPro: boiteForm.email,
            telephonePro: boiteForm.phone,
            siret: boiteForm.siret,
            adresse: boiteForm.address,
            responsableNom: boiteForm.manager,
            website: boiteForm.website,
            options: toggles,
            wantsToRent,
            rentDetails: wantsToRent ? rentForm : null,
          })
        }
      } catch {}
    }

    // Sync boite_registration to Firestore
    import('../firebase').then(({ USE_REAL_FIREBASE, db }) => {
      if (!USE_REAL_FIREBASE) return
      import('firebase/firestore').then(({ doc, setDoc }) => {
        setDoc(doc(db, 'boite_registrations', registration.id), registration).catch(() => {})
      }).catch(() => {})
    }).catch(() => {})

    setSubmitted(true)
  }

  return (
    <Layout>
      <div style={{ position: 'relative', zIndex: 1, background: 'transparent', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Header */}
        <div>
          <p style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 9,
            letterSpacing: '0.4em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.25)',
            marginBottom: 8,
          }}>Inscription professionnelle</p>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 38, fontWeight: 300, color: 'rgba(255,255,255,0.90)', margin: 0, letterSpacing: '0.02em', lineHeight: 1.1 }}>
            Je suis <span style={{ color: '#c8a96e' }}>une boîte</span>
          </h2>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.42)', marginTop: 8, letterSpacing: '0.04em', lineHeight: 1.6 }}>
            Pour les organisateurs d'événements, sociétés d'événementiel, discothèques.
          </p>
        </div>

        {!submitted ? (
          <>
            {/* Progress */}
            <div style={{ display: 'flex', gap: 6 }}>
              {STEPS.map((s, i) => (
                <div key={s} style={{ flex: 1 }}>
                  <div style={{ height: 2, borderRadius: 2, marginBottom: 5, background: i <= step ? '#c8a96e' : 'rgba(255,255,255,0.06)', transition: 'background 0.3s' }} />
                  <p style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 9,
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    color: i === step ? '#c8a96e' : 'rgba(255,255,255,0.18)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    margin: 0,
                  }}>{s}</p>
                </div>
              ))}
            </div>

            {/* Step 0: Infos boîte */}
            {step === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

                {/* Features grid */}
                <div>
                  <Eyebrow>Ce qu'on t'offre</Eyebrow>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {features.map((f) => (
                      <div key={f.label} style={{ ...S.card, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {featureIcons[f.icon]}
                        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.90)', letterSpacing: '0.03em', margin: 0 }}>{f.label}</p>
                        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.32)', lineHeight: 1.5, margin: 0 }}>{f.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Form */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <Eyebrow>Informations de l'établissement</Eyebrow>
                  <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 400, color: 'rgba(255,255,255,0.90)', margin: '0 0 4px' }}>
                    Informations de l'établissement
                  </p>

                  {/* Nom de l'établissement */}
                  <div>
                    <label style={S.label}>Nom de l'établissement / commercial</label>
                    <input
                      style={S.inputBase}
                      placeholder="Ex: Club Neon, L|VE Events..."
                      value={boiteForm.name}
                      onChange={e => setBoiteForm(prev => ({ ...prev, name: e.target.value }))}
                      onFocus={e => { e.target.style.borderColor = '#4ee8c8'; e.target.style.boxShadow = '0 0 0 3px rgba(78,232,200,0.06)' }}
                      onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.10)'; e.target.style.boxShadow = 'none' }}
                    />
                  </div>

                  {/* Numéro SIRET avec note 000.000 */}
                  <div>
                    <label style={S.label}>
                      Numéro SIRET / SIREN
                      <span style={{ color: 'rgba(255,255,255,0.22)', marginLeft: 6, letterSpacing: '0.15em', fontStyle: 'normal' }}>
                        — si pas de numéro, écrivez <span style={{ color: '#c8a96e' }}>000.000</span>
                      </span>
                    </label>
                    <input
                      style={S.inputBase}
                      placeholder="Ex: 123 456 789 00012 — ou 000.000"
                      value={boiteForm.siret}
                      onChange={e => setBoiteForm(prev => ({ ...prev, siret: e.target.value }))}
                      onFocus={e => { e.target.style.borderColor = '#4ee8c8'; e.target.style.boxShadow = '0 0 0 3px rgba(78,232,200,0.06)' }}
                      onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.10)'; e.target.style.boxShadow = 'none' }}
                    />
                  </div>

                  {/* Responsable + email + phone */}
                  {[
                    { key: 'manager', label: 'Nom du responsable', placeholder: 'Prénom Nom' },
                    { key: 'email',   label: 'Email professionnel', placeholder: 'contact@monclub.fr' },
                    { key: 'phone',   label: 'Téléphone',           placeholder: '+33 6 00 00 00 00' },
                  ].map((f) => (
                    <div key={f.key}>
                      <label style={S.label}>{f.label}</label>
                      <input
                        style={S.inputBase}
                        placeholder={f.placeholder}
                        value={boiteForm[f.key]}
                        onChange={e => setBoiteForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                        onFocus={e => { e.target.style.borderColor = '#4ee8c8'; e.target.style.boxShadow = '0 0 0 3px rgba(78,232,200,0.06)' }}
                        onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.10)'; e.target.style.boxShadow = 'none' }}
                      />
                    </div>
                  ))}

                  {/* Adresse de l'établissement + case "pas de lieu fixe" */}
                  <div>
                    <label style={S.label}>Adresse de l'établissement — lieu principal</label>

                    {/* Toggle "Pas de lieu fixe" */}
                    <div
                      onClick={() => setBoiteForm(prev => ({ ...prev, noFixedAddress: !prev.noFixedAddress, address: prev.noFixedAddress ? prev.address : '' }))}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, cursor: 'pointer', userSelect: 'none' }}
                    >
                      <div style={{
                        width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                        border: `1.5px solid ${boiteForm.noFixedAddress ? '#4ee8c8' : 'rgba(255,255,255,0.20)'}`,
                        background: boiteForm.noFixedAddress ? 'rgba(78,232,200,0.15)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.2s',
                      }}>
                        {boiteForm.noFixedAddress && (
                          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                            <polyline points="2,6 5,9 10,3" stroke="#4ee8c8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: boiteForm.noFixedAddress ? '#4ee8c8' : 'rgba(255,255,255,0.45)', letterSpacing: '0.05em' }}>
                        Pas de lieu fixe (établissement en ligne / itinérant)
                      </span>
                    </div>

                    {!boiteForm.noFixedAddress && (
                      <input
                        style={S.inputBase}
                        placeholder="Adresse complète de l'établissement"
                        value={boiteForm.address}
                        onChange={e => setBoiteForm(prev => ({ ...prev, address: e.target.value }))}
                        onFocus={e => { e.target.style.borderColor = '#4ee8c8'; e.target.style.boxShadow = '0 0 0 3px rgba(78,232,200,0.06)' }}
                        onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.10)'; e.target.style.boxShadow = 'none' }}
                      />
                    )}

                    {boiteForm.noFixedAddress && (
                      <div style={{ padding: '10px 14px', background: 'rgba(78,232,200,0.06)', border: '1px solid rgba(78,232,200,0.18)', borderRadius: 4 }}>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(78,232,200,0.7)', letterSpacing: '0.04em' }}>
                          ✓ Aucune adresse physique — établissement dématérialisé ou sans lieu fixe
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Site web */}
                  <div>
                    <label style={S.label}>Site web (optionnel)</label>
                    <input
                      style={S.inputBase}
                      placeholder="https://..."
                      value={boiteForm.website}
                      onChange={e => setBoiteForm(prev => ({ ...prev, website: e.target.value }))}
                      onFocus={e => { e.target.style.borderColor = '#4ee8c8'; e.target.style.boxShadow = '0 0 0 3px rgba(78,232,200,0.06)' }}
                      onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.10)'; e.target.style.boxShadow = 'none' }}
                    />
                  </div>
                </div>

                <div style={{ ...S.card, padding: 14, borderColor: 'rgba(78,232,200,0.18)' }}>
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#4ee8c8', lineHeight: 1.6, letterSpacing: '0.03em', margin: 0 }}>
                    Tu peux t'inscrire maintenant et compléter les autres informations plus tard.
                  </p>
                </div>

                <button onClick={() => setStep(1)} style={S.btnGold}>
                  Continuer
                </button>
              </div>
            )}

            {/* Step 1: Options */}
            {step === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <Eyebrow>Configuration</Eyebrow>
                  <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 400, color: 'rgba(255,255,255,0.90)', margin: '0 0 4px' }}>
                    Configuration de ta page
                  </p>
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.42)', marginTop: 4, margin: 0 }}>
                    Tu pourras tout modifier après inscription.
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { label: 'Playlist interactive pour les acheteurs', key: 'playlist' },
                    { label: 'Précommande de consommations', key: 'preorder' },
                    { label: 'QR Code billet automatique', key: 'qr' },
                    { label: 'Mise en avant (Top 3 région)', key: 'featured' },
                  ].map((opt) => (
                    <div key={opt.key} style={{ ...S.card, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'rgba(255,255,255,0.7)', flex: 1, margin: 0 }}>{opt.label}</p>
                      <div
                        onClick={() => setToggles(t => ({ ...t, [opt.key]: !t[opt.key] }))}
                        style={{
                          width: 44,
                          height: 24,
                          borderRadius: 12,
                          background: toggles[opt.key] ? '#4ee8c8' : 'rgba(255,255,255,0.08)',
                          position: 'relative',
                          cursor: 'pointer',
                          transition: 'background 0.2s',
                          flexShrink: 0,
                        }}
                      >
                        <div style={{
                          position: 'absolute',
                          top: 4,
                          width: 16,
                          height: 16,
                          background: 'white',
                          borderRadius: '50%',
                          transition: 'left 0.2s',
                          left: toggles[opt.key] ? 24 : 4,
                          boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                        }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setStep(0)} style={{ ...S.btnGhost, flex: 1 }}>Retour</button>
                  <button onClick={() => setStep(2)} style={{ ...S.btnGold, flex: 1 }}>Suivant</button>
                </div>
              </div>
            )}

            {/* Step 2: Louer ma salle */}
            {step === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <Eyebrow>Location</Eyebrow>
                  <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 400, color: 'rgba(255,255,255,0.90)', margin: '0 0 4px' }}>
                    Veux-tu louer ta salle ?
                  </p>
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.42)', marginTop: 4, margin: 0 }}>
                    Propose ta boîte à la location pour des soirées privées.
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <button
                    onClick={() => setWantsToRent(true)}
                    style={{
                      ...S.card,
                      padding: 18,
                      textAlign: 'center',
                      cursor: 'pointer',
                      borderColor: wantsToRent === true ? 'rgba(200,169,110,0.6)' : 'rgba(255,255,255,0.08)',
                      background: wantsToRent === true ? 'rgba(200,169,110,0.08)' : 'rgba(8,10,20,0.55)',
                      transition: 'all 0.2s',
                    }}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#c8a96e" strokeWidth="1.5" style={{ margin: '0 auto 10px', display: 'block' }}>
                      <polyline points="20,6 9,17 4,12"/>
                    </svg>
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'rgba(255,255,255,0.90)', fontWeight: 600, margin: 0 }}>Oui</p>
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.42)', marginTop: 4, margin: '4px 0 0' }}>Je veux louer ma salle</p>
                  </button>
                  <button
                    onClick={() => setWantsToRent(false)}
                    style={{
                      ...S.card,
                      padding: 18,
                      textAlign: 'center',
                      cursor: 'pointer',
                      borderColor: wantsToRent === false ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)',
                      background: wantsToRent === false ? 'rgba(255,255,255,0.04)' : 'rgba(8,10,20,0.55)',
                      transition: 'all 0.2s',
                    }}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.42)" strokeWidth="1.5" style={{ margin: '0 auto 10px', display: 'block' }}>
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'rgba(255,255,255,0.90)', fontWeight: 600, margin: 0 }}>Non</p>
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.42)', marginTop: 4, margin: '4px 0 0' }}>Pas pour l'instant</p>
                  </button>
                </div>

                {wantsToRent && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <Eyebrow>Infos de location</Eyebrow>
                    {[
                      { key: 'capacity', label: 'Capacité max pour location privée', placeholder: 'Ex: 200 personnes' },
                      { key: 'priceMon', label: 'Tarif lundi-jeudi (€/soir)', placeholder: 'Ex: 1500' },
                      { key: 'priceFri', label: 'Tarif vendredi-samedi (€/soir)', placeholder: 'Ex: 3000' },
                      { key: 'priceSun', label: 'Tarif dimanche (€/soir)', placeholder: 'Ex: 2000' },
                      { key: 'conditions', label: 'Conditions particulières', placeholder: 'Caution, délai minimum...' },
                    ].map((f) => (
                      <div key={f.key}>
                        <label style={S.label}>{f.label}</label>
                        <input
                          style={S.inputBase}
                          placeholder={f.placeholder}
                          value={rentForm[f.key]}
                          onChange={e => setRentForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                          onFocus={e => { e.target.style.borderColor = '#4ee8c8'; e.target.style.boxShadow = '0 0 0 3px rgba(78,232,200,0.06)' }}
                          onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.10)'; e.target.style.boxShadow = 'none' }}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setStep(1)} style={{ ...S.btnGhost, flex: 1 }}>Retour</button>
                  <button
                    onClick={() => setStep(3)}
                    disabled={wantsToRent === null}
                    style={{ ...S.btnGold, flex: 1, opacity: wantsToRent === null ? 0.4 : 1, cursor: wantsToRent === null ? 'not-allowed' : 'pointer' }}
                  >
                    Finaliser
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Confirm */}
            {step === 3 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <Eyebrow>Vérification</Eyebrow>
                  <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 400, color: 'rgba(255,255,255,0.90)', margin: 0 }}>
                    Récapitulatif
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {[
                    { label: 'Établissement', val: boiteForm.name || '(non renseigné)' },
                    { label: 'SIRET / SIREN', val: boiteForm.siret || '(non renseigné)' },
                    { label: 'Responsable', val: boiteForm.manager || '(non renseigné)' },
                    { label: 'Email', val: boiteForm.email || '(non renseigné)' },
                    { label: 'Adresse', val: boiteForm.noFixedAddress ? 'Aucun lieu fixe' : (boiteForm.address || '(non renseigné)') },
                    { label: 'Playlist interactive', val: toggles.playlist ? 'Activée' : 'Désactivée' },
                    { label: 'Précommande conso', val: toggles.preorder ? 'Activée' : 'Désactivée' },
                    { label: 'Louer ma salle', val: wantsToRent ? 'Oui' : 'Non' },
                    { label: 'Statut', val: 'En attente de vérification' },
                  ].map((r) => (
                    <div key={r.label} style={{ ...S.card, padding: '11px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)' }}>{r.label}</span>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'rgba(255,255,255,0.9)' }}>{r.val}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setStep(2)} style={{ ...S.btnGhost, flex: 1 }}>Retour</button>
                  <button onClick={handleSubmit} style={{ ...S.btnGold, flex: 1 }}>
                    Valider l'inscription
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          /* Success state */
          <div style={{ textAlign: 'center', padding: '48px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
            <div style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: 'rgba(200,169,110,0.08)',
              border: '2px solid rgba(200,169,110,0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#c8a96e" strokeWidth="1">
                <rect x="1" y="3" width="22" height="18" rx="2"/><path d="M1 9h22"/>
                <path d="M8 3v6"/><path d="M16 3v6"/>
              </svg>
            </div>
            <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 300, color: 'rgba(255,255,255,0.90)', margin: 0 }}>
              Bienvenue dans la famille !
            </p>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'rgba(255,255,255,0.42)', lineHeight: 1.7, maxWidth: 280, margin: 0 }}>
              Ton compte boîte est en cours de validation. Notre équipe vérifie tes documents sous{' '}
              <strong style={{ color: 'rgba(255,255,255,0.90)' }}>48h</strong>.
            </p>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.05em', margin: 0 }}>
              Tu pourras créer ton premier événement dès validation.
            </p>
          </div>
        )}
      </div>
    </Layout>
  )
}
