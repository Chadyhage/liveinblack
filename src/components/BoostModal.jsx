import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { isBoostSlotTaken } from '../utils/ticket'
import { getUserId } from '../utils/messaging'
import { startStripeBoostCheckout } from '../utils/stripe'
import { getEventEndTimestamp } from '../utils/eventUrgency'
import { BOOST_PLANS } from '../../lib/boosts.js'

const mono = "'DM Mono', monospace"
const regionOf = event => event?.regionId || event?.country || event?.region || ''

function RankIcon({ position, size = 20 }) {
  const color = position === 1 ? '#c8a96e' : position === 2 ? 'rgba(255,255,255,.72)' : 'rgba(200,169,110,.65)'
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" fill={color}/>
    <text x="12" y="15" textAnchor="middle" fontSize="8" fill="#090a10" fontFamily="monospace" fontWeight="bold">{position}</text>
  </svg>
}

function CloseButton({ onClick }) {
  return <button onClick={onClick} aria-label="Fermer" className="boost-close">×</button>
}

export default function BoostModal({ event, onClose, onBoostDone }) {
  const { user } = useAuth()
  const [activePosition, setActivePosition] = useState(1)
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [step, setStep] = useState('pick')
  const [paying, setPaying] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [globalBoosts, setGlobalBoosts] = useState([])

  useEffect(() => {
    let unsub = () => {}
    import('../utils/firestore-sync').then(({ listenBoosts }) => { unsub = listenBoosts(setGlobalBoosts) }).catch(() => {})
    return () => unsub()
  }, [])

  const activePlan = useMemo(() => BOOST_PLANS.find(plan => plan.position === activePosition), [activePosition])
  const chosen = selectedPlan ? BOOST_PLANS.find(plan => plan.position === selectedPlan.position) : null
  const chosenTier = chosen ? chosen.tiers[selectedPlan.tierIdx] : null
  if (!event) return null

  const positionTaken = position => isBoostSlotTaken(position, regionOf(event), event.id, globalBoosts)

  async function confirmBoost() {
    if (!chosen || !chosenTier) return
    const uid = getUserId(user)
    if (!uid) return
    setPaying(true)
    const random = new Uint32Array(2)
    crypto.getRandomValues(random)
    const boostId = `${random[0].toString(36)}${random[1].toString(36)}`.slice(0, 16).toUpperCase()
    const result = await startStripeBoostCheckout({
      eventId: event.id, eventName: event.name, position: chosen.position,
      days: chosenTier.days, priceEUR: chosenTier.price, region: regionOf(event),
      userId: uid, userEmail: user?.email, boostId,
    })
    if (!result.ok) {
      setPaying(false)
      setErrorMsg(result.error || 'Impossible de réserver ce créneau de boost.')
      setStep('error')
    }
  }

  const eventEnd = getEventEndTimestamp(event)
  return <div className="boost-shell" role="dialog" aria-modal="true" aria-label="Booster mon événement">
    <style>{`
      .boost-shell{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:18px}
      .boost-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.82);backdrop-filter:blur(5px)}
      .boost-panel{position:relative;width:100%;max-width:660px;max-height:calc(100vh - 36px);overflow:auto;background:rgba(4,5,12,.98);border:1px solid rgba(255,255,255,.11);border-radius:20px;box-shadow:0 30px 100px rgba(0,0,0,.72)}
      .boost-content{padding:24px;display:flex;flex-direction:column;gap:22px}
      .boost-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}
      .boost-title{font:600 25px Inter,sans-serif;color:#fff;margin:0;letter-spacing:-.02em}
      .boost-kicker{font:8px ${mono};letter-spacing:.22em;text-transform:uppercase;color:#c8a96e;margin:7px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:430px}
      .boost-close{width:38px;height:38px;border-radius:50%;border:1px solid rgba(255,255,255,.11);background:rgba(255,255,255,.055);color:rgba(255,255,255,.65);font:20px Inter;cursor:pointer;flex:none}
      .boost-label{font:8px ${mono};letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.4);margin:0 0 10px}
      .boost-position-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}
      .boost-position{min-height:76px;padding:12px 11px;border-radius:12px;text-align:left;color:#fff;cursor:pointer}
      .boost-position-top{display:flex;align-items:center;gap:8px;font:600 12px ${mono}}
      .boost-position-state{display:block;font:8px ${mono};letter-spacing:.12em;text-transform:uppercase;margin-top:9px}
      .boost-duration-head{display:flex;justify-content:space-between;align-items:end;gap:12px;margin-bottom:10px}
      .boost-description{font:10px ${mono};color:rgba(255,255,255,.38);margin:0}
      .boost-duration-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}
      .boost-duration{min-height:96px;padding:14px 12px;border-radius:12px;text-align:left}
      .boost-duration span{display:block;font:8px ${mono};letter-spacing:.1em;text-transform:uppercase}
      .boost-duration strong{display:block;font:500 22px Inter,sans-serif;margin-top:10px;white-space:nowrap}
      .boost-primary{min-height:52px;width:100%;border-radius:12px;border:1px solid rgba(200,169,110,.5);background:linear-gradient(135deg,rgba(200,169,110,.25),rgba(200,169,110,.08));color:#e0c68e;font:700 10px ${mono};letter-spacing:.15em;text-transform:uppercase;cursor:pointer}
      .boost-primary:disabled{opacity:.38;cursor:not-allowed}
      .boost-summary{padding:18px;border:1px solid rgba(200,169,110,.22);border-radius:14px;background:rgba(200,169,110,.055)}
      .boost-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0;font:11px ${mono};color:rgba(255,255,255,.45)}
      .boost-row strong{color:#fff;font-weight:500}.boost-total{border-top:1px solid rgba(255,255,255,.08);margin-top:5px;padding-top:14px}.boost-total strong{font:500 25px Inter;color:#c8a96e}
      .boost-pay-actions{display:grid;grid-template-columns:1fr 2fr;gap:9px}.boost-ghost{min-height:50px;border-radius:12px;border:1px solid rgba(255,255,255,.13);background:transparent;color:rgba(255,255,255,.55);font:9px ${mono};text-transform:uppercase;cursor:pointer}
      @media(max-width:620px){.boost-shell{align-items:flex-end;padding:0}.boost-panel{max-height:92vh;border-radius:18px 18px 0 0}.boost-content{padding:20px 18px 28px}.boost-title{font-size:22px}.boost-duration-grid{grid-template-columns:repeat(2,1fr)}.boost-position{min-height:70px;padding:10px 8px}.boost-position-state{font-size:7px}.boost-kicker{max-width:260px}}
    `}</style>
    <div className="boost-backdrop" onClick={onClose}/>
    <section className="boost-panel">
      <div className="boost-content">
        <header className="boost-head"><div><h2 className="boost-title">Booster mon événement</h2><p className="boost-kicker">{event.name}</p></div><CloseButton onClick={onClose}/></header>

        {step === 'error' ? <div style={{textAlign:'center',padding:'28px 0'}}>
          <p style={{font:`11px ${mono}`,color:'#ee9bb7',lineHeight:1.7}}>{errorMsg}</p>
          <button className="boost-ghost" style={{padding:'0 22px'}} onClick={() => setStep('pick')}>Retour aux options</button>
        </div> : step === 'pay' ? <>
          <div className="boost-summary">
            <p className="boost-label" style={{color:'#c8a96e'}}>Récapitulatif avant paiement</p>
            <div className="boost-row"><span>Position</span><strong style={{display:'flex',alignItems:'center',gap:7}}><RankIcon position={chosen.position} size={17}/>{chosen.label}</strong></div>
            <div className="boost-row"><span>Durée</span><strong>{chosenTier.label}</strong></div>
            <div className="boost-row boost-total"><span>Total</span><strong>{chosenTier.price.toFixed(2).replace('.', ',')} €</strong></div>
          </div>
          <p style={{font:`9px ${mono}`,color:'rgba(255,255,255,.38)',lineHeight:1.7,margin:0}}>Paiement sécurisé via Stripe. Le créneau est confirmé uniquement après validation du paiement.</p>
          <div className="boost-pay-actions"><button className="boost-ghost" onClick={() => setStep('pick')}>Retour</button><button className="boost-primary" onClick={confirmBoost} disabled={paying}>{paying ? 'Redirection vers Stripe…' : `Payer ${chosenTier.price.toFixed(2).replace('.', ',')} €`}</button></div>
        </> : <>
          <div><p className="boost-label">1. Choisis ta position</p><div className="boost-position-grid">
            {BOOST_PLANS.map(plan => { const taken = positionTaken(plan.position); const active = activePosition === plan.position; return <button key={plan.position} className="boost-position" onClick={() => {setActivePosition(plan.position);setSelectedPlan(null)}} style={{border:active?'1px solid rgba(200,169,110,.65)':'1px solid rgba(255,255,255,.09)',background:active?'linear-gradient(145deg,rgba(200,169,110,.18),rgba(200,169,110,.04))':'rgba(255,255,255,.025)'}}><span className="boost-position-top"><RankIcon position={plan.position}/>{plan.label}</span><span className="boost-position-state" style={{color:taken?'#ee8faf':'rgba(78,232,200,.72)'}}>{taken?'Occupé':'Disponible'}</span></button> })}
          </div></div>
          <div><div className="boost-duration-head"><div><p className="boost-label" style={{marginBottom:5}}>2. Choisis la durée</p><p className="boost-description">{activePlan.description}</p></div>{positionTaken(activePosition)&&<span style={{font:`8px ${mono}`,color:'#ee8faf',textTransform:'uppercase'}}>Créneau occupé</span>}</div>
            <div className="boost-duration-grid">{activePlan.tiers.map((tier,index) => { const selected=selectedPlan?.position===activePosition&&selectedPlan?.tierIdx===index; const exceeds=eventEnd>0&&Date.now()+tier.days*86400000>eventEnd; const disabled=positionTaken(activePosition)||exceeds; return <button key={tier.days} className="boost-duration" disabled={disabled} title={exceeds?'Cette durée dépasse la date de l’événement':positionTaken(activePosition)?'Emplacement occupé':''} onClick={()=>setSelectedPlan({position:activePosition,tierIdx:index})} style={{border:selected?'1px solid rgba(78,232,200,.7)':'1px solid rgba(255,255,255,.09)',background:selected?'rgba(78,232,200,.09)':'rgba(255,255,255,.025)',cursor:disabled?'not-allowed':'pointer',opacity:disabled?.38:1}}><span style={{color:selected?'#4ee8c8':'rgba(255,255,255,.48)'}}>{tier.label}</span><strong style={{color:selected?'#fff':activePlan.color}}>{tier.price.toFixed(2).replace('.', ',')} €</strong>{exceeds&&<small style={{display:'block',font:`7px ${mono}`,color:'rgba(255,255,255,.5)',marginTop:5}}>Après l’événement</small>}</button>})}</div>
            {positionTaken(activePosition)&&<p style={{font:`9px ${mono}`,lineHeight:1.6,color:'rgba(255,255,255,.38)',margin:'10px 0 0'}}>Cette place est déjà réservée dans la région. Choisis une autre position.</p>}
          </div>
          <button className="boost-primary" disabled={!selectedPlan} onClick={()=>selectedPlan&&setStep('pay')}>{selectedPlan?`Continuer · ${chosenTier.price.toFixed(2).replace('.', ',')} €`:'Sélectionne une durée'}</button>
        </>}
      </div>
    </section>
  </div>
}
