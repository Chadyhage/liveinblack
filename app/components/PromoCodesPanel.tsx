'use client'

// Port de src/components/PromoCodesPanel.jsx (Phase 7, #78) — codes promo d'un
// événement (organisateur) : création, liste, activation/désactivation,
// suppression. Modèle Shotgun : réduction % ou montant fixe PAR BILLET.
//
// Divergence volontaire vs. legacy : le legacy calcule côté client le prix du
// billet le moins cher (event.places) pour anticiper l'erreur "fixed_covers_
// cheapest_ticket" AVANT soumission, avec le montant exact dans le message
// (`La réduction (X €) couvre le prix du billet le moins cher (Y €)`). Ce
// composant ne reçoit que { id, name, currency } (pas le catalogue de places),
// donc cette vérification ne peut être faite que côté serveur — l'erreur
// 'fixed_covers_cheapest_ticket' est mappée après soumission, sans les
// montants exacts (que l'API ne renvoie pas).

import { useEffect, useState } from 'react'
import { fmtMoney, currencySymbol } from '@/lib/shared/money'

const FONT = 'Inter, sans-serif'
const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '11px 13px',
  borderRadius: 9,
  border: '1px solid rgba(255,255,255,.13)',
  background: '#0b0c12',
  color: 'rgba(255,255,255,.92)',
  outline: 'none',
  fontFamily: FONT,
  fontSize: 13.5,
}
const labelStyle: React.CSSProperties = {
  font: `600 10.5px ${FONT}`,
  letterSpacing: '.05em',
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,.55)',
  display: 'block',
  marginBottom: 6,
}

const normalizeCode = (raw: string): string => raw.trim().toUpperCase().replace(/\s+/g, '')

type PromoType = 'percent' | 'fixed'

interface PromoCode {
  code: string
  type: PromoType
  value: number
  maxUses: number
  usedCount: number
  active: boolean
  expiresAt: string | null
  createdAt: string
}

interface ListResponse {
  ok: true
  promos: PromoCode[]
}
interface CreateResponse {
  ok: true
  promo: PromoCode
}
interface ToggleResponse {
  ok: true
  active: boolean
}
interface DeleteResponse {
  ok: true
}
interface ErrorResponse {
  ok?: false
  error: string
}

interface PromoCodesPanelProps {
  event: { id: string; name: string; currency: 'EUR' | 'XOF' }
  onClose: () => void
}

interface FormState {
  code: string
  type: PromoType
  value: string
  maxUses: string
  expiresAt: string
}

const CREATE_ERROR_MESSAGES: Record<string, string> = {
  code_too_short: 'Le code doit faire au moins 3 caractères (lettres/chiffres).',
  code_taken: 'Ce code existe déjà sur cet événement.',
  invalid_value: 'Indique la valeur de la réduction.',
  percent_too_high: 'Maximum 99 % — pour offrir des places, utilise la guestlist (billets gratuits).',
  fixed_covers_cheapest_ticket: "La réduction couvre le prix du billet le moins cher — pour offrir des places, utilise la guestlist.",
}
const GENERIC_ERROR = "Enregistrement impossible — vérifie ta connexion (ou droits organisateur)."

export default function PromoCodesPanel({ event, onClose }: PromoCodesPanelProps) {
  const eventId = event.id
  const currency: 'EUR' | 'XOF' = event.currency === 'XOF' ? 'XOF' : 'EUR'
  const curLabel = currencySymbol(currency)

  const [items, setItems] = useState<PromoCode[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyCode, setBusyCode] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState<FormState>({ code: '', type: 'percent', value: '', maxUses: '', expiresAt: '' })
  const [confirmRemove, setConfirmRemove] = useState<PromoCode | null>(null)
  // L'horloge murale (Date.now()) ne doit jamais être lue pendant le rendu
  // (impur) — lecture unique via l'initialiseur paresseux de useState (même
  // pattern que ProfilClient.tsx:onCooldown), suffisant le temps d'une
  // session du panneau (pas besoin de faire progresser EXPIRÉ en direct).
  const [nowMs] = useState(() => Date.now())

  useEffect(() => {
    let cancelled = false
    fetch(`/api/organizer-events/${eventId}/promo-codes`)
      .then(async (res) => {
        const data = (await res.json()) as ListResponse | ErrorResponse
        if (cancelled) return
        if (!res.ok || !('ok' in data) || !data.ok) {
          setLoadError(('error' in data && data.error) || 'load_failed')
          setLoading(false)
          return
        }
        setItems(data.promos)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError('network_error')
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [eventId])

  async function addCode() {
    setError('')
    const code = normalizeCode(form.code)
    const value = Number(form.value)

    if (!code || code.length < 3) return setError(CREATE_ERROR_MESSAGES.code_too_short)
    if (items.some((p) => normalizeCode(p.code) === code)) return setError(CREATE_ERROR_MESSAGES.code_taken)
    if (!Number.isFinite(value) || value <= 0) return setError(CREATE_ERROR_MESSAGES.invalid_value)
    if (form.type === 'percent' && value >= 100) return setError(CREATE_ERROR_MESSAGES.percent_too_high)

    setSaving(true)
    try {
      const res = await fetch(`/api/organizer-events/${eventId}/promo-codes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          type: form.type,
          value,
          maxUses: Math.max(0, Math.floor(Number(form.maxUses)) || 0),
          expiresAt: form.expiresAt || null,
        }),
      })
      const data = (await res.json()) as CreateResponse | ErrorResponse
      if (!res.ok || !('ok' in data) || !data.ok) {
        const err = 'error' in data ? data.error : ''
        setError(CREATE_ERROR_MESSAGES[err] || GENERIC_ERROR)
        return
      }
      setItems((prev) => [data.promo, ...prev])
      setForm({ code: '', type: form.type, value: '', maxUses: '', expiresAt: '' })
    } catch {
      setError(GENERIC_ERROR)
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(p: PromoCode) {
    setBusyCode(p.code)
    setError('')
    try {
      const res = await fetch(`/api/organizer-events/${eventId}/promo-codes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: p.code }),
      })
      const data = (await res.json()) as ToggleResponse | ErrorResponse
      if (!res.ok || !('ok' in data) || !data.ok) {
        setError(GENERIC_ERROR)
        return
      }
      setItems((prev) => prev.map((it) => (it.code === p.code ? { ...it, active: data.active } : it)))
    } catch {
      setError(GENERIC_ERROR)
    } finally {
      setBusyCode(null)
    }
  }

  async function removeCode(p: PromoCode) {
    setBusyCode(p.code)
    setError('')
    try {
      const res = await fetch(`/api/organizer-events/${eventId}/promo-codes`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: p.code }),
      })
      const data = (await res.json()) as DeleteResponse | ErrorResponse
      if (!res.ok || !('ok' in data) || !data.ok) {
        setError(GENERIC_ERROR)
        return
      }
      setItems((prev) => prev.filter((it) => it.code !== p.code))
    } catch {
      setError(GENERIC_ERROR)
    } finally {
      setBusyCode(null)
    }
  }

  function askRemove(p: PromoCode) {
    setConfirmRemove(p)
  }

  async function doConfirmRemove() {
    if (!confirmRemove) return
    const p = confirmRemove
    setConfirmRemove(null)
    await removeCode(p)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Codes promo"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(3,4,8,.85)', backdropFilter: 'blur(8px)', display: 'grid', placeItems: 'center', padding: 18 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(560px,100%)', maxHeight: '88vh', overflowY: 'auto', borderRadius: 18, background: '#12131c', border: '1px solid rgba(255,255,255,.11)', boxShadow: '0 24px 64px rgba(0,0,0,.6)', padding: 22 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <h2 style={{ font: `700 28px ${FONT}`, letterSpacing: '.03em', margin: 0, color: '#fff' }}>Codes promo</h2>
            <p style={{ font: `500 12px ${FONT}`, color: 'rgba(255,255,255,.5)', margin: '5px 0 0' }}>
              {event.name} · réduction appliquée <strong style={{ color: 'rgba(255,255,255,.75)' }}>par billet</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            style={{ flexShrink: 0, background: 'none', border: 0, color: 'rgba(255,255,255,0.5)', fontSize: 26, cursor: 'pointer', lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {loading ? (
          <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width={16} height={16} viewBox="0 0 24 24" style={{ display: 'inline-block' }} aria-hidden="true">
              <circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={3} />
              <path d="M21 12a9 9 0 00-9-9" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={3} strokeLinecap="round">
                <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite" />
              </path>
            </svg>
            <p style={{ color: 'rgba(255,255,255,.45)', font: `500 13px ${FONT}`, margin: 0 }}>Chargement…</p>
          </div>
        ) : loadError ? (
          <p style={{ marginTop: 18, color: '#ff9ed2', font: `500 13px ${FONT}` }}>Impossible de charger les codes promo — vérifie ta connexion.</p>
        ) : (
          <>
            {/* Création */}
            <div style={{ marginTop: 18, padding: 15, borderRadius: 12, background: '#0e0f16', border: '1px solid rgba(255,255,255,.08)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 10 }}>
                <div>
                  <span style={labelStyle}>Code</span>
                  <input
                    style={{ ...inputStyle, textTransform: 'uppercase', letterSpacing: '.06em' }}
                    placeholder="Ex. SOIREE20"
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  />
                </div>
                <div>
                  <span style={labelStyle}>Type</span>
                  <select style={inputStyle} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as PromoType }))}>
                    <option value="percent">Pourcentage (%)</option>
                    <option value="fixed">Montant fixe ({curLabel})</option>
                  </select>
                </div>
                <div>
                  <span style={labelStyle}>{form.type === 'percent' ? 'Réduction (%)' : `Réduction (${curLabel})`}</span>
                  <input
                    style={inputStyle}
                    type="number"
                    min="1"
                    max={form.type === 'percent' ? '99' : undefined}
                    placeholder={form.type === 'percent' ? 'Ex. 20' : 'Ex. 1000'}
                    value={form.value}
                    onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                  />
                </div>
                <div>
                  <span style={labelStyle}>Utilisations max (vide = illimité)</span>
                  <input style={inputStyle} type="number" min="0" placeholder="Ex. 50" value={form.maxUses} onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <span style={labelStyle}>Expire le (optionnel)</span>
                  <input style={inputStyle} type="date" value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} />
                </div>
              </div>
              {error && <p style={{ margin: '10px 0 0', color: '#ff9ed2', font: `500 12.5px ${FONT}` }}>{error}</p>}
              <button
                onClick={addCode}
                disabled={saving}
                style={{
                  marginTop: 12,
                  width: '100%',
                  minHeight: 44,
                  borderRadius: 10,
                  border: 'none',
                  background: saving ? 'rgba(255,255,255,.08)' : '#c8a96e',
                  color: saving ? 'rgba(255,255,255,.4)' : '#04040b',
                  font: `700 13px ${FONT}`,
                  letterSpacing: '.03em',
                  cursor: saving ? 'wait' : 'pointer',
                }}
              >
                {saving ? 'Enregistrement…' : 'Créer le code'}
              </button>
            </div>

            {/* Liste */}
            <div style={{ marginTop: 16 }}>
              {items.length === 0 ? (
                <p style={{ color: 'rgba(255,255,255,.45)', font: `500 13px ${FONT}` }}>Aucun code promo sur cet événement pour l&apos;instant.</p>
              ) : (
                items.map((p) => {
                  const expired = !!p.expiresAt && new Date(p.expiresAt).getTime() < nowMs
                  const exhausted = (Number(p.maxUses) || 0) > 0 && (Number(p.usedCount) || 0) >= Number(p.maxUses)
                  const off = p.active === false || expired || exhausted
                  const rowBusy = busyCode === p.code
                  return (
                    <div
                      key={p.code}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 14px',
                        borderRadius: 11,
                        background: '#0e0f16',
                        border: '1px solid rgba(255,255,255,.08)',
                        marginBottom: 8,
                        opacity: off ? 0.55 : 1,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, font: `700 14px ${FONT}`, letterSpacing: '.05em', color: '#fff' }}>
                          {p.code}
                          <span style={{ marginLeft: 9, font: `700 12px ${FONT}`, color: '#4ee8c8' }}>
                            {p.type === 'percent' ? `-${p.value} %` : `-${fmtMoney(p.value, currency)}`} / billet
                          </span>
                        </p>
                        <p style={{ margin: '3px 0 0', font: `500 11.5px ${FONT}`, color: 'rgba(255,255,255,.45)' }}>
                          {Number(p.usedCount) || 0}
                          {(Number(p.maxUses) || 0) > 0 ? ` / ${p.maxUses}` : ''} utilisation{(Number(p.usedCount) || 0) > 1 ? 's' : ''}
                          {p.expiresAt ? ` · expire le ${new Date(p.expiresAt).toLocaleDateString('fr-FR')}` : ''}
                          {expired ? ' · EXPIRÉ' : exhausted ? ' · ÉPUISÉ' : p.active === false ? ' · DÉSACTIVÉ' : ''}
                        </p>
                      </div>
                      <button
                        onClick={() => toggleActive(p)}
                        disabled={rowBusy || saving}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: '1px solid rgba(255,255,255,.14)',
                          background: 'rgba(255,255,255,.06)',
                          color: 'rgba(255,255,255,.8)',
                          font: `600 11.5px ${FONT}`,
                          cursor: rowBusy || saving ? 'not-allowed' : 'pointer',
                          flexShrink: 0,
                        }}
                      >
                        {p.active === false ? 'Réactiver' : 'Désactiver'}
                      </button>
                      <button
                        onClick={() => askRemove(p)}
                        disabled={rowBusy || saving}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: '1px solid rgba(224,90,170,.4)',
                          background: 'rgba(224,90,170,.10)',
                          color: '#ff9ed2',
                          font: `600 11.5px ${FONT}`,
                          cursor: rowBusy || saving ? 'not-allowed' : 'pointer',
                          flexShrink: 0,
                        }}
                      >
                        Supprimer
                      </button>
                    </div>
                  )
                })
              )}
            </div>
            <p style={{ margin: '12px 0 0', font: `500 11.5px ${FONT}`, color: 'rgba(255,255,255,.38)', lineHeight: 1.6 }}>
              L&apos;acheteur saisit le code dans le récap de réservation — la réduction s&apos;applique au prix de chaque billet (une table = une fois sur le prix de la table). Les utilisations se
              comptent à l&apos;encaissement.
            </p>
          </>
        )}
      </div>

      {/* Confirmation de suppression */}
      {confirmRemove && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            e.stopPropagation()
            setConfirmRemove(null)
          }}
          style={{ position: 'fixed', inset: 0, zIndex: 3010, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }} />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 360,
              background: '#12131c',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 16,
              padding: 22,
              boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <p style={{ font: `700 17px ${FONT}`, color: '#fff', margin: 0 }}>Supprimer ce code promo ?</p>
            <p style={{ font: `500 13.5px ${FONT}`, color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.55 }}>
              <strong style={{ color: '#fff' }}>{confirmRemove.code}</strong> sera définitivement supprimé, y compris son historique d&apos;utilisation ({Number(confirmRemove.usedCount) || 0}{' '}
              utilisation{(Number(confirmRemove.usedCount) || 0) > 1 ? 's' : ''}). Pour le retirer sans perdre l&apos;historique, utilise plutôt « Désactiver ».
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
              <button
                onClick={() => setConfirmRemove(null)}
                style={{ flex: 1, padding: '11px', borderRadius: 12, cursor: 'pointer', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.9)', font: `600 13.5px ${FONT}` }}
              >
                Annuler
              </button>
              <button
                onClick={doConfirmRemove}
                style={{ flex: 1.4, padding: '11px', borderRadius: 12, cursor: 'pointer', background: 'var(--pink)', border: '1px solid transparent', color: '#fff', font: `700 13.5px ${FONT}` }}
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
