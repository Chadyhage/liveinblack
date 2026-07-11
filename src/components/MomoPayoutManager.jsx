// Gestionnaire des numéros Mobile Money d'encaissement — UN numéro par pays UEMOA.
// Un organisateur peut encaisser dans plusieurs pays d'Afrique de l'Ouest : chaque
// événement est payé sur le numéro du PAYS de l'événement (FedaPay est lié au pays).
// Source de vérité : users/{uid}.payoutMomos = { tg:{number,country}, bj:{…}, … }.
// L'ancien numéro unique (payoutMomo) est migré ici puis effacé.
import { useState, useEffect } from 'react'
import { MOMO_REGIONS } from '../data/regions'

const FONT = 'Inter, sans-serif'
const card = { background: '#0e0f16', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 16, padding: 18, boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }
const label = { fontFamily: FONT, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)', margin: 0 }
const input = { width: '100%', boxSizing: 'border-box', background: '#12131c', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '11px 13px', color: '#fff', fontFamily: FONT, fontSize: 14, outline: 'none' }

export default function MomoPayoutManager({ uid, eventCountries = [] }) {
  const [rows, setRows] = useState({})          // { momoCountry: number }
  const [openCountries, setOpenCountries] = useState([]) // pays affichés
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [addSel, setAddSel] = useState('')

  useEffect(() => {
    if (!uid) return
    let cancelled = false
    ;(async () => {
      try {
        const { db } = await import('../firebase')
        const { doc, getDoc } = await import('firebase/firestore')
        const snap = await getDoc(doc(db, 'users', uid))
        const u = snap.exists() ? snap.data() : {}
        const map = {}
        for (const [c, v] of Object.entries(u.payoutMomos || {})) { if (v?.number) map[c] = v.number }
        // Migration douce de l'ancien numéro unique.
        if (u.payoutMomo?.number && u.payoutMomo?.country && !map[u.payoutMomo.country]) {
          map[u.payoutMomo.country] = u.payoutMomo.number
        }
        if (cancelled) return
        setRows(map)
        // Afficher : pays avec numéro + pays où l'orga a déjà des événements.
        setOpenCountries([...new Set([...Object.keys(map), ...eventCountries.filter(Boolean)])])
        setLoading(false)
      } catch { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [uid]) // eslint-disable-line react-hooks/exhaustive-deps

  const remaining = MOMO_REGIONS.filter(r => !openCountries.includes(r.momoCountry))

  function addCountry(c) { if (c) { setOpenCountries(o => [...new Set([...o, c])]); setAddSel('') } }
  function removeCountry(c) {
    setOpenCountries(o => o.filter(x => x !== c))
    setRows(r => { const n = { ...r }; delete n[c]; return n })
  }

  async function save() {
    setSaving(true); setMsg(null)
    const payoutMomos = {}
    for (const c of openCountries) {
      const raw = String(rows[c] || '').replace(/[\s.-]/g, '').trim()
      if (!raw) continue
      const region = MOMO_REGIONS.find(r => r.momoCountry === c)
      if (!region || !raw.startsWith(region.dial) || !/^\+\d{3}\d{7,10}$/.test(raw)) {
        setMsg({ type: 'error', text: `Numéro invalide pour ${region?.name || c}. Format international, ex. ${region?.dial || '+228'} 90 00 00 00.` })
        setSaving(false); return
      }
      payoutMomos[c] = { number: raw, country: c }
    }
    try {
      const { updateAccount } = await import('../utils/accounts')
      const { syncDocAwaitable } = await import('../utils/firestore-sync')
      // payoutMomos = SOURCE UNIQUE désormais → on efface l'ancien numéro unique.
      updateAccount(uid, { payoutMomos, payoutMomo: null })
      const result = await syncDocAwaitable(`users/${uid}`, { payoutMomos, payoutMomo: null })
      if (!result.ok) throw new Error(result.error || 'sync')
      const n = Object.keys(payoutMomos).length
      setMsg({ type: 'success', text: n
        ? 'Numéros enregistrés. Chaque événement est payé sur le numéro de son pays.'
        : 'Aucun numéro enregistré — tes recettes FCFA seront en attente jusqu\'à ce que tu en ajoutes un.' })
    } catch { setMsg({ type: 'error', text: 'Enregistrement impossible — vérifie ta connexion et réessaie.' }) }
    setSaving(false)
  }

  if (!uid) return null
  if (loading) return <div style={card}><p style={{ ...label, color: 'rgba(255,255,255,0.5)' }}>Chargement des numéros…</p></div>

  const evSet = new Set(eventCountries.filter(Boolean))

  return (
    <div style={card}>
      <p style={label}>Mobile Money — un numéro par pays</p>
      <p style={{ fontFamily: FONT, fontSize: 12.5, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, margin: '10px 0 4px' }}>
        Chaque événement est payé automatiquement sur le numéro du <strong style={{ color: '#c8a96e' }}>pays de l'événement</strong> (à la fin de la soirée). Ajoute un numéro pour chaque pays où tu organises.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
        {openCountries.length === 0 && (
          <p style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(255,255,255,0.45)', margin: 0 }}>Aucun pays encore. Ajoute-en un ci-dessous.</p>
        )}
        {openCountries.map(c => {
          const region = MOMO_REGIONS.find(r => r.momoCountry === c)
          if (!region) return null
          const empty = !String(rows[c] || '').trim()
          const hasEventNoNumber = evSet.has(c) && empty
          return (
            <div key={c} style={{ border: hasEventNoNumber ? '1px solid rgba(245,158,11,0.5)' : '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12, background: hasEventNoNumber ? 'rgba(245,158,11,0.05)' : 'rgba(255,255,255,0.02)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: '#fff' }}>{region.flag} {region.name}{evSet.has(c) && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: '#c8a96e' }}>· tu y organises</span>}</span>
                <button onClick={() => removeCountry(c)} aria-label="Retirer" style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 0 }}>×</button>
              </div>
              <input style={input} type="tel" placeholder={`${region.dial} 90 00 00 00`} value={rows[c] || ''} onChange={e => setRows(r => ({ ...r, [c]: e.target.value }))} />
              {hasEventNoNumber && (
                <p style={{ fontFamily: FONT, fontSize: 11, color: '#f59e0b', margin: '6px 0 0' }}>Tu as un événement dans ce pays — ajoute le numéro pour être payé.</p>
              )}
            </div>
          )
        })}
      </div>

      {remaining.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <select value={addSel} onChange={e => setAddSel(e.target.value)} style={{ ...input, flex: 1 }}>
            <option value="">Ajouter un pays…</option>
            {remaining.map(r => <option key={r.momoCountry} value={r.momoCountry}>{r.flag} {r.name}</option>)}
          </select>
          <button onClick={() => addCountry(addSel)} disabled={!addSel} style={{ padding: '0 16px', borderRadius: 10, cursor: addSel ? 'pointer' : 'not-allowed', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', color: '#fff', fontFamily: FONT, fontSize: 13, fontWeight: 600 }}>Ajouter</button>
        </div>
      )}

      {msg && (
        <p style={{ fontFamily: FONT, fontSize: 12.5, lineHeight: 1.6, marginTop: 12, padding: '10px 13px', borderRadius: 10, color: msg.type === 'error' ? '#e05aaa' : '#4ee8c8', background: 'rgba(12,12,22,0.96)', border: `1px solid ${msg.type === 'error' ? 'rgba(224,90,170,0.5)' : 'rgba(78,232,200,0.5)'}` }}>{msg.text}</p>
      )}

      <button onClick={save} disabled={saving} style={{ width: '100%', marginTop: 14, padding: '13px 0', borderRadius: 12, cursor: saving ? 'wait' : 'pointer', background: 'linear-gradient(180deg,#d8b878,#c8a96e)', border: '1px solid rgba(0,0,0,0.15)', color: '#1a1305', fontFamily: FONT, fontSize: 14, fontWeight: 700 }}>
        {saving ? 'Enregistrement…' : 'Enregistrer mes numéros'}
      </button>
    </div>
  )
}
