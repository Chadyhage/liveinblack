import { useState } from 'react'
import Layout from '../components/Layout'

const STEPS = ['Infos boîte', 'Options', 'Louer ma salle', 'Confirmation']

const OPTION_DEFAULTS = {
  auction: true,
  playlist: true,
  preorder: true,
  qr: true,
  featured: false,
}

export default function JeSuisUneBoitePage() {
  const [step, setStep] = useState(0)
  const [wantsToRent, setWantsToRent] = useState(null)
  const [submitted, setSubmitted] = useState(false)

  // Controlled form state
  const [boiteForm, setBoiteForm] = useState({
    name: '',
    siret: '',
    manager: '',
    email: '',
    phone: '',
    address: '',
    website: '',
  })

  // Controlled toggles
  const [toggles, setToggles] = useState(OPTION_DEFAULTS)

  // Rental form
  const [rentForm, setRentForm] = useState({
    capacity: '',
    priceMon: '',
    priceFri: '',
    priceSun: '',
    conditions: '',
  })

  const features = [
    { icon: '🎟', label: 'Vendre des places', desc: 'Billetterie intégrée avec tous types de places' },
    { icon: '🔨', label: "Système d'enchères", desc: 'Mets aux enchères tes carrés et VIP' },
    { icon: '🎵', label: 'Playlist interactive', desc: 'Laisse tes clients voter pour les sons' },
    { icon: '📊', label: 'Dashboard analytics', desc: 'Suis tes ventes et ta performance en temps réel' },
    { icon: '🌟', label: 'Mise en avant', desc: 'Passe en top 3 de ta région (payant)' },
    { icon: '🛒', label: 'Précommande de conso', desc: "Tes clients commandent à l'avance" },
  ]

  function handleSubmit() {
    const registration = {
      ...boiteForm,
      options: toggles,
      wantsToRent,
      rentDetails: wantsToRent ? rentForm : null,
      submittedAt: new Date().toISOString(),
    }
    try {
      localStorage.setItem('lib_boite_registration', JSON.stringify(registration))
    } catch {}
    setSubmitted(true)
  }

  return (
    <Layout>
      <div className="px-4 py-6 space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-3xl font-black uppercase" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            Je suis <span className="text-[#d4af37]">une boîte</span>
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Pour les organisateurs d'événements, sociétés d'événementiel, discothèques.
          </p>
        </div>

        {!submitted ? (
          <>
            {/* Progress */}
            <div className="flex gap-1">
              {STEPS.map((s, i) => (
                <div key={s} className="flex-1">
                  <div className="h-1 rounded-full mb-1" style={{ background: i <= step ? '#d4af37' : '#1a1a1a' }} />
                  <p className={`text-[10px] truncate ${i === step ? 'text-[#d4af37]' : 'text-gray-700'}`}>{s}</p>
                </div>
              ))}
            </div>

            {/* Step 0: Infos boîte */}
            {step === 0 && (
              <div className="space-y-5 animate-fade-in">
                <div>
                  <h3 className="text-gray-500 text-xs uppercase tracking-widest mb-3">Ce qu'on t'offre</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {features.map((f) => (
                      <div key={f.label} className="glass p-3 rounded-xl">
                        <span className="text-xl">{f.icon}</span>
                        <p className="text-white text-xs font-semibold mt-1">{f.label}</p>
                        <p className="text-gray-600 text-[10px] mt-0.5">{f.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-white font-semibold">Informations de la structure</h3>
                  {[
                    { key: 'name', label: 'Nom de la boîte / société', placeholder: 'Ex: Club Neon, SARL Events...' },
                    { key: 'siret', label: "SIRET / Numéro d'entreprise", placeholder: 'Ex: 123 456 789 00012' },
                    { key: 'manager', label: 'Nom du responsable légal', placeholder: 'Prénom Nom' },
                    { key: 'email', label: 'Email professionnel', placeholder: 'contact@maboite.fr' },
                    { key: 'phone', label: 'Téléphone', placeholder: '+33 6 00 00 00 00' },
                    { key: 'address', label: 'Adresse du siège', placeholder: 'Adresse complète' },
                    { key: 'website', label: 'Site web (optionnel)', placeholder: 'https://...' },
                  ].map((f) => (
                    <div key={f.key}>
                      <label className="text-gray-500 text-xs mb-1.5 block">{f.label}</label>
                      <input
                        className="input-dark"
                        placeholder={f.placeholder}
                        value={boiteForm[f.key]}
                        onChange={e => setBoiteForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>

                <div className="glass p-3 rounded-xl border border-blue-500/20">
                  <p className="text-blue-400 text-xs">
                    ℹ Tu peux t'inscrire maintenant et compléter les autres informations plus tard.
                  </p>
                </div>

                <button onClick={() => setStep(1)} className="btn-gold w-full">
                  Continuer →
                </button>
              </div>
            )}

            {/* Step 1: Options */}
            {step === 1 && (
              <div className="space-y-5 animate-fade-in">
                <div>
                  <h3 className="text-white font-semibold">Configuration de ta page</h3>
                  <p className="text-gray-500 text-xs mt-1">Tu pourras tout modifier après inscription.</p>
                </div>

                {[
                  { label: "Système d'enchères sur les places VIP", key: 'auction' },
                  { label: 'Playlist interactive pour les acheteurs', key: 'playlist' },
                  { label: 'Précommande de consommations', key: 'preorder' },
                  { label: 'QR Code billet automatique', key: 'qr' },
                  { label: 'Mise en avant (Top 3 région)', key: 'featured' },
                ].map((opt) => (
                  <div key={opt.key} className="flex items-center justify-between p-3 glass rounded-xl">
                    <p className="text-gray-300 text-sm pr-4">{opt.label}</p>
                    <div
                      onClick={() => setToggles(t => ({ ...t, [opt.key]: !t[opt.key] }))}
                      className={`w-11 h-6 rounded-full relative cursor-pointer transition-all ${toggles[opt.key] ? 'bg-[#d4af37]' : 'bg-[#222]'}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${toggles[opt.key] ? 'left-6' : 'left-1'}`} />
                    </div>
                  </div>
                ))}

                <div className="flex gap-2">
                  <button onClick={() => setStep(0)} className="btn-outline flex-1">← Retour</button>
                  <button onClick={() => setStep(2)} className="btn-gold flex-1">Suivant →</button>
                </div>
              </div>
            )}

            {/* Step 2: Louer ma salle */}
            {step === 2 && (
              <div className="space-y-5 animate-fade-in">
                <div>
                  <h3 className="text-white font-semibold">Veux-tu louer ta salle ?</h3>
                  <p className="text-gray-500 text-xs mt-1">Propose ta boîte à la location pour des soirées privées.</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setWantsToRent(true)}
                    className={`p-4 rounded-2xl border text-center transition-all ${wantsToRent === true ? 'border-[#d4af37] bg-[#d4af37]/10' : 'border-[#222] hover:border-[#333]'}`}
                  >
                    <p className="text-2xl mb-2">✓</p>
                    <p className="text-white text-sm font-semibold">Oui</p>
                    <p className="text-gray-500 text-xs">Je veux louer ma salle</p>
                  </button>
                  <button
                    onClick={() => setWantsToRent(false)}
                    className={`p-4 rounded-2xl border text-center transition-all ${wantsToRent === false ? 'border-gray-500 bg-white/5' : 'border-[#222] hover:border-[#333]'}`}
                  >
                    <p className="text-2xl mb-2">✕</p>
                    <p className="text-white text-sm font-semibold">Non</p>
                    <p className="text-gray-500 text-xs">Pas pour l'instant</p>
                  </button>
                </div>

                {wantsToRent && (
                  <div className="space-y-3 animate-fade-in">
                    <h4 className="text-[#d4af37] text-xs uppercase tracking-widest">Infos de location</h4>
                    {[
                      { key: 'capacity', label: 'Capacité max pour location privée', placeholder: 'Ex: 200 personnes' },
                      { key: 'priceMon', label: 'Tarif lundi-jeudi (€/soir)', placeholder: 'Ex: 1500' },
                      { key: 'priceFri', label: 'Tarif vendredi-samedi (€/soir)', placeholder: 'Ex: 3000' },
                      { key: 'priceSun', label: 'Tarif dimanche (€/soir)', placeholder: 'Ex: 2000' },
                      { key: 'conditions', label: 'Conditions particulières', placeholder: 'Caution, délai minimum...' },
                    ].map((f) => (
                      <div key={f.key}>
                        <label className="text-gray-500 text-xs mb-1.5 block">{f.label}</label>
                        <input
                          className="input-dark"
                          placeholder={f.placeholder}
                          value={rentForm[f.key]}
                          onChange={e => setRentForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={() => setStep(1)} className="btn-outline flex-1">← Retour</button>
                  <button
                    onClick={() => setStep(3)}
                    disabled={wantsToRent === null}
                    className="btn-gold flex-1 disabled:opacity-40"
                  >
                    Finaliser →
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Confirm */}
            {step === 3 && (
              <div className="space-y-4 animate-fade-in">
                <h3 className="text-white font-semibold">Récapitulatif</h3>
                <div className="space-y-2">
                  {[
                    { label: 'Structure', val: boiteForm.name || '(non renseigné)' },
                    { label: 'Responsable', val: boiteForm.manager || '(non renseigné)' },
                    { label: 'Email', val: boiteForm.email || '(non renseigné)' },
                    { label: 'Système enchères', val: toggles.auction ? 'Activé' : 'Désactivé' },
                    { label: 'Playlist interactive', val: toggles.playlist ? 'Activée' : 'Désactivée' },
                    { label: 'Précommande conso', val: toggles.preorder ? 'Activée' : 'Désactivée' },
                    { label: 'Louer ma salle', val: wantsToRent ? 'Oui' : 'Non' },
                    { label: 'Statut', val: 'En attente de vérification' },
                  ].map((r) => (
                    <div key={r.label} className="flex justify-between p-3 glass rounded-xl">
                      <span className="text-gray-500 text-sm">{r.label}</span>
                      <span className="text-white text-sm font-semibold">{r.val}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setStep(2)} className="btn-outline flex-1">← Retour</button>
                  <button onClick={handleSubmit} className="btn-gold flex-1">
                    Valider l'inscription
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-10 space-y-4 animate-fade-in">
            <div className="w-24 h-24 rounded-full bg-[#d4af37]/10 border-2 border-[#d4af37] flex items-center justify-center text-4xl mx-auto">
              🏢
            </div>
            <h3 className="text-white text-xl font-bold">Bienvenue dans la famille !</h3>
            <p className="text-gray-400 text-sm">
              Ton compte boîte est en cours de validation. Notre équipe vérifie tes documents sous{' '}
              <strong className="text-white">48h</strong>.
            </p>
            <p className="text-gray-500 text-xs">
              Tu pourras créer ton premier événement dès validation.
            </p>
          </div>
        )}
      </div>
    </Layout>
  )
}
