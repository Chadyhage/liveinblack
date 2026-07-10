// ─── Codes promo d'un événement (panneau organisateur) ────────────────────────
// Modèle Shotgun : l'organisateur crée des codes (% ou montant fixe PAR BILLET,
// limite d'utilisations, expiration) que l'acheteur saisit dans le récap d'achat.
// Stockage event_promos/{eventId} (règles : organisateur/agent uniquement — les
// acheteurs ne peuvent PAS lister les codes, ils les valident via le serveur).
// La réduction 100 % est refusée à la création : pour offrir des places,
// l'organisateur passe par la guestlist (billets gratuits réels).

import { useEffect, useState } from 'react'
import { fmtMoney } from '../utils/money'

const FONT = 'Inter, sans-serif'
const input = { width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: 9, border: '1px solid rgba(255,255,255,.13)', background: '#0b0c12', color: 'rgba(255,255,255,.92)', outline: 'none', fontFamily: FONT, fontSize: 13.5 }
const label = { font: `600 10.5px ${FONT}`, letterSpacing: '.05em', textTransform: 'uppercase', color: 'rgba(255,255,255,.55)', display: 'block', marginBottom: 6 }

const normalizeCode = raw => String(raw || '').trim().toUpperCase().replace(/\s+/g, '')

export default function PromoCodesPanel({ event, onClose }) {
  const eventId = event?.id
  const currency = String(event?.currency || '').toUpperCase() === 'XOF' ? 'XOF' : 'EUR'
  const curLabel = currency === 'XOF' ? 'FCFA' : '€'
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ code: '', type: 'percent', value: '', maxUses: '', expiresAt: '' })

  useEffect(() => {
    if (!eventId) return
    setLoading(true)
    import('../utils/firestore-sync').then(async ({ loadDoc }) => {
      const doc = await loadDoc(`event_promos/${eventId}`)
      setItems(Array.isArray(doc?.items) ? doc.items : [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [eventId])

  // Écritures TRANSACTIONNELLES par code (mergeItemsById) — jamais d'overwrite
  // du tableau complet : le webhook incrémente usedCount à chaque encaissement,
  // et un overwrite depuis l'état local du panneau écraserait ce compteur
  // (règle projet « jamais de merge union sans reconcile »). insertOnly n'écrase
  // jamais un code existant ; patches ne touche QUE les champs passés (active…)
  // en préservant le usedCount serveur.
  async function mutate(op) {
    setSaving(true); setError('')
    try {
      const { mergeItemsById } = await import('../utils/firestore-sync')
      const result = await mergeItemsById(`event_promos/${eventId}`, { idKey: 'code', ...op })
      if (!result) throw new Error('Enregistrement impossible — vérifie ta connexion (ou droits organisateur).')
      setItems(result)
      setSaving(false)
      return result
    } catch (e) {
      setError(e.message || 'Enregistrement impossible.')
      setSaving(false)
      return null
    }
  }

  async function addCode() {
    setError('')
    const code = normalizeCode(form.code)
    const value = Number(form.value)
    if (!code || code.length < 3) return setError('Le code doit faire au moins 3 caractères (lettres/chiffres).')
    if (items.some(p => normalizeCode(p.code) === code)) return setError('Ce code existe déjà sur cet événement.')
    if (!Number.isFinite(value) || value <= 0) return setError('Indique la valeur de la réduction.')
    if (form.type === 'percent' && value >= 100) return setError('Maximum 99 % — pour offrir des places, utilise la guestlist (billets gratuits).')
    if (form.type === 'fixed') {
      const minPrice = Math.min(...(event.places || []).map(p => Number(p.price) || 0).filter(v => v > 0))
      if (Number.isFinite(minPrice) && value >= minPrice) {
        return setError(`La réduction (${value} ${curLabel}) couvre le prix du billet le moins cher (${fmtMoney(minPrice, currency)}) — pour offrir des places, utilise la guestlist.`)
      }
    }
    const item = {
      code,
      type: form.type,
      value,
      maxUses: Math.max(0, Math.floor(Number(form.maxUses)) || 0), // 0 = illimité
      usedCount: 0,
      expiresAt: form.expiresAt ? new Date(form.expiresAt + 'T23:59:59').toISOString() : null,
      active: true,
      createdAt: Date.now(),
    }
    const result = await mutate({ insertOnly: [item] })
    if (!result) return
    // insertOnly n'écrase jamais : si un code du même nom existait déjà côté
    // serveur (créé depuis un autre appareil), c'est LUI qui est resté.
    const kept = result.find(p => normalizeCode(p.code) === code)
    if (kept && kept.createdAt !== item.createdAt) return setError('Ce code existe déjà sur cet événement.')
    setForm({ code: '', type: form.type, value: '', maxUses: '', expiresAt: '' })
  }

  const toggleActive = p => mutate({ patches: [{ id: p.code, set: { active: p.active === false } }] })
  const removeCode = p => mutate({ removeIds: [p.code] })

  if (!event) return null
  return (
    <div role="dialog" aria-modal="true" aria-label="Codes promo" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(3,4,8,.85)', backdropFilter: 'blur(8px)', display: 'grid', placeItems: 'center', padding: 18 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(560px,100%)', maxHeight: '88vh', overflowY: 'auto', borderRadius: 18, background: '#12131c', border: '1px solid rgba(255,255,255,.11)', boxShadow: '0 24px 64px rgba(0,0,0,.6)', padding: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <h2 style={{ font: '28px Bebas Neue, Impact, sans-serif', letterSpacing: '.03em', margin: 0 }}>Codes promo</h2>
            <p style={{ font: `500 12px ${FONT}`, color: 'rgba(255,255,255,.5)', margin: '5px 0 0' }}>{event.name} · réduction appliquée <strong style={{ color: 'rgba(255,255,255,.75)' }}>par billet</strong></p>
          </div>
          <button onClick={onClose} aria-label="Fermer" style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', color: '#fff', fontSize: 19, cursor: 'pointer', flexShrink: 0 }}>×</button>
        </div>

        {/* ── Création ── */}
        <div style={{ marginTop: 18, padding: 15, borderRadius: 12, background: '#0e0f16', border: '1px solid rgba(255,255,255,.08)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 10 }}>
            <div><span style={label}>Code</span><input style={{ ...input, textTransform: 'uppercase', letterSpacing: '.06em' }} placeholder="Ex. SOIREE20" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} /></div>
            <div><span style={label}>Type</span>
              <select style={input} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                <option value="percent">Pourcentage (%)</option>
                <option value="fixed">Montant fixe ({curLabel})</option>
              </select>
            </div>
            <div><span style={label}>{form.type === 'percent' ? 'Réduction (%)' : `Réduction (${curLabel})`}</span><input style={input} type="number" min="1" placeholder={form.type === 'percent' ? 'Ex. 20' : 'Ex. 1000'} value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} /></div>
            <div><span style={label}>Utilisations max (vide = illimité)</span><input style={input} type="number" min="0" placeholder="Ex. 50" value={form.maxUses} onChange={e => setForm(f => ({ ...f, maxUses: e.target.value }))} /></div>
            <div style={{ gridColumn: '1 / -1' }}><span style={label}>Expire le (optionnel)</span><input style={input} type="date" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} /></div>
          </div>
          {error && <p style={{ margin: '10px 0 0', color: '#ff9ed2', font: `500 12.5px ${FONT}` }}>{error}</p>}
          <button onClick={addCode} disabled={saving} style={{ marginTop: 12, width: '100%', minHeight: 44, borderRadius: 10, border: 'none', background: saving ? 'rgba(255,255,255,.08)' : '#c8a96e', color: saving ? 'rgba(255,255,255,.4)' : '#04040b', font: `700 13px ${FONT}`, letterSpacing: '.03em', cursor: saving ? 'wait' : 'pointer' }}>
            {saving ? 'Enregistrement…' : 'Créer le code'}
          </button>
        </div>

        {/* ── Liste ── */}
        <div style={{ marginTop: 16 }}>
          {loading ? <p style={{ color: 'rgba(255,255,255,.45)', font: `500 13px ${FONT}` }}>Chargement…</p>
            : items.length === 0 ? <p style={{ color: 'rgba(255,255,255,.45)', font: `500 13px ${FONT}` }}>Aucun code promo sur cet événement pour l'instant.</p>
            : items.map(p => {
              const expired = p.expiresAt && new Date(p.expiresAt).getTime() < Date.now()
              const exhausted = (Number(p.maxUses) || 0) > 0 && (Number(p.usedCount) || 0) >= Number(p.maxUses)
              const off = p.active === false || expired || exhausted
              return (
                <div key={p.code} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 11, background: '#0e0f16', border: '1px solid rgba(255,255,255,.08)', marginBottom: 8, opacity: off ? .55 : 1 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, font: `700 14px ${FONT}`, letterSpacing: '.05em', color: '#fff' }}>{p.code}
                      <span style={{ marginLeft: 9, font: `700 12px ${FONT}`, color: '#4ee8c8' }}>{p.type === 'percent' ? `-${p.value} %` : `-${fmtMoney(p.value, currency)}`} / billet</span>
                    </p>
                    <p style={{ margin: '3px 0 0', font: `500 11.5px ${FONT}`, color: 'rgba(255,255,255,.45)' }}>
                      {Number(p.usedCount) || 0}{(Number(p.maxUses) || 0) > 0 ? ` / ${p.maxUses}` : ''} utilisation{(Number(p.usedCount) || 0) > 1 ? 's' : ''}
                      {p.expiresAt ? ` · expire le ${new Date(p.expiresAt).toLocaleDateString('fr-FR')}` : ''}
                      {expired ? ' · EXPIRÉ' : exhausted ? ' · ÉPUISÉ' : p.active === false ? ' · DÉSACTIVÉ' : ''}
                    </p>
                  </div>
                  <button onClick={() => toggleActive(p)} disabled={saving} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.8)', font: `600 11.5px ${FONT}`, cursor: 'pointer', flexShrink: 0 }}>
                    {p.active === false ? 'Réactiver' : 'Désactiver'}
                  </button>
                  <button onClick={() => removeCode(p)} disabled={saving} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(224,90,170,.4)', background: 'rgba(224,90,170,.10)', color: '#ff9ed2', font: `600 11.5px ${FONT}`, cursor: 'pointer', flexShrink: 0 }}>
                    Supprimer
                  </button>
                </div>
              )
            })}
        </div>
        <p style={{ margin: '12px 0 0', font: `500 11.5px ${FONT}`, color: 'rgba(255,255,255,.38)', lineHeight: 1.6 }}>
          L'acheteur saisit le code dans le récap de réservation — la réduction s'applique au prix de chaque billet (une table = une fois sur le prix de la table). Les utilisations se comptent à l'encaissement.
        </p>
      </div>
    </div>
  )
}
