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
import { Button, Input, Select, Label, Modal, Skeleton } from '@/app/components/ui'
const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '11px 13px',
  borderRadius: 9,
  border: '1px solid rgba(255,255,255,.13)',
  background: '#0b0c12',
  color: 'rgba(255,255,255,.92)',
  outline: 'none',
  fontSize: 13.5,
}
const labelStyle: React.CSSProperties = {
  font: `600 10.5px var(--font-open-sans)`,
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
  placeIds?: string[]
}

interface EventPlace {
  id: string
  type: string
  price: number
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
  event: { id: string; name: string; currency: 'EUR' | 'XOF'; places?: EventPlace[] }
  onClose: () => void
}

interface FormState {
  code: string
  type: PromoType
  value: string
  maxUses: string
  expiresAt: string
  // Vide = s'applique à toutes les places (comportement historique) — jamais
  // pré-coché, l'organisateur choisit explicitement de restreindre.
  placeIds: string[]
}

const CREATE_ERROR_MESSAGES: Record<string, string> = {
  code_too_short: 'Le code doit faire au moins 3 caractères (lettres/chiffres).',
  code_taken: 'Ce code existe déjà sur cet événement.',
  invalid_value: 'Indique la valeur de la réduction.',
  percent_too_high: 'Maximum 99 % — pour offrir des places, utilise la guestlist (billets gratuits).',
  fixed_covers_cheapest_ticket: "La réduction couvre le prix du billet le moins cher (parmi les places sélectionnées) — pour offrir des places, utilise la guestlist.",
  invalid_place_ids: 'Sélection de places invalide — recharge la page et réessaie.',
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
  const [form, setForm] = useState<FormState>({ code: '', type: 'percent', value: '', maxUses: '', expiresAt: '', placeIds: [] })
  const places = event.places || []
  const [confirmRemove, setConfirmRemove] = useState<PromoCode | null>(null)
  const [confirmToggle, setConfirmToggle] = useState<PromoCode | null>(null)
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
          placeIds: form.placeIds,
        }),
      })
      const data = (await res.json()) as CreateResponse | ErrorResponse
      if (!res.ok || !('ok' in data) || !data.ok) {
        const err = 'error' in data ? data.error : ''
        setError(CREATE_ERROR_MESSAGES[err] || GENERIC_ERROR)
        return
      }
      setItems((prev) => [data.promo, ...prev])
      setForm({ code: '', type: form.type, value: '', maxUses: '', expiresAt: '', placeIds: [] })
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

  async function doConfirmToggle() {
    if (!confirmToggle) return
    const p = confirmToggle
    setConfirmToggle(null)
    await toggleActive(p)
  }

  return (
    <>
    <Modal
      onClose={onClose}
      maxWidth={560}
      ariaLabel="Codes promo"
      contentStyle={{ border: '1px solid rgba(255,255,255,.11)', boxShadow: '0 24px 64px rgba(0,0,0,.6)' }}
    >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <h2 style={{ font: `700 28px var(--font-open-sans)`, letterSpacing: '.03em', margin: 0, color: '#fff' }}>Codes promo</h2>
            <p style={{ font: `500 12px var(--font-open-sans)`, color: 'rgba(255,255,255,.5)', margin: '5px 0 0' }}>
              {event.name} · réduction appliquée <strong style={{ color: 'rgba(255,255,255,.75)' }}>par billet</strong>
            </p>
          </div>
        </div>

        {loading ? (
          <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width={16} height={16} viewBox="0 0 24 24" style={{ display: 'inline-block' }} aria-hidden="true">
              <circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={3} />
              <path d="M21 12a9 9 0 00-9-9" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={3} strokeLinecap="round">
                <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite" />
              </path>
            </svg>
            <Skeleton width={180} height={13} />
          </div>
        ) : loadError ? (
          <p style={{ marginTop: 18, color: '#ff9ed2', font: `500 13px var(--font-open-sans)` }}>Impossible de charger les codes promo — vérifie ta connexion.</p>
        ) : (
          <>
            {/* Création */}
            <div style={{ marginTop: 18, padding: 15, borderRadius: 12, background: '#0e0f16', border: '1px solid rgba(255,255,255,.08)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 10 }}>
                <div>
                  <Label style={labelStyle}>Code</Label>
                  <Input
                    style={{ ...inputStyle, textTransform: 'uppercase', letterSpacing: '.06em' }}
                    placeholder="Ex. SOIREE20"
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  />
                </div>
                <div>
                  <Label style={labelStyle}>Type</Label>
                  <Select
                    value={form.type}
                    onChange={(value) => setForm((f) => ({ ...f, type: value as PromoType }))}
                    options={[
                      { value: 'percent', label: 'Pourcentage (%)' },
                      { value: 'fixed', label: `Montant fixe (${curLabel})` },
                    ]}
                  />
                </div>
                <div>
                  <Label style={labelStyle}>{form.type === 'percent' ? 'Réduction (%)' : `Réduction (${curLabel})`}</Label>
                  <Input
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
                  <Label style={labelStyle}>Utilisations max (vide = illimité)</Label>
                  <Input style={inputStyle} type="number" min="0" placeholder="Ex. 50" value={form.maxUses} onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Label style={labelStyle}>Expire le (optionnel)</Label>
                  <Input style={inputStyle} type="date" value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} />
                </div>
                {places.length > 0 && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <Label style={labelStyle}>Types de place concernés (vide = toutes les places)</Label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                      {places.map((p) => {
                        const active = form.placeIds.includes(p.id)
                        return (
                          <Button
                            key={p.id}
                            type="button"
                            variant="ghost"
                            onClick={() =>
                              setForm((f) => ({
                                ...f,
                                placeIds: f.placeIds.includes(p.id) ? f.placeIds.filter((id) => id !== p.id) : [...f.placeIds, p.id],
                              }))
                            }
                            style={{
                              padding: '7px 11px',
                              borderRadius: 8,
                              fontSize: 11.5,
                              fontWeight: 700,
                              border: active ? '1px solid var(--teal)' : '1px solid rgba(255,255,255,.14)',
                              background: active ? 'rgba(184, 243, 74,0.14)' : 'rgba(255,255,255,.05)',
                              color: active ? 'var(--teal)' : 'rgba(255,255,255,.7)',
                            }}
                          >
                            {p.type}
                          </Button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
              {error && <p style={{ margin: '10px 0 0', color: '#ff9ed2', font: `500 12.5px var(--font-open-sans)` }}>{error}</p>}
              <Button
                onClick={addCode}
                loading={saving}
                loadingText="Enregistrement…"
                style={{
                  marginTop: 12,
                  width: '100%',
                  minHeight: 44,
                  borderRadius: 10,
                  background: saving ? 'rgba(255,255,255,.08)' : 'var(--gold)',
                  color: saving ? 'rgba(255,255,255,.4)' : '#04040b',
                  font: `700 13px var(--font-open-sans)`,
                  letterSpacing: '.03em',
                }}
              >
                Créer le code
              </Button>
            </div>

            {/* Liste */}
            <div style={{ marginTop: 16 }}>
              {items.length === 0 ? (
                <p style={{ color: 'rgba(255,255,255,.45)', font: `500 13px var(--font-open-sans)` }}>Aucun code promo sur cet événement pour l&apos;instant.</p>
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
                        <p style={{ margin: 0, font: `700 14px var(--font-open-sans)`, letterSpacing: '.05em', color: '#fff' }}>
                          {p.code}
                          <span style={{ marginLeft: 9, font: `700 12px var(--font-open-sans)`, color: 'var(--teal)' }}>
                            {p.type === 'percent' ? `-${p.value} %` : `-${fmtMoney(p.value, currency)}`} / billet
                          </span>
                        </p>
                        <p style={{ margin: '3px 0 0', font: `500 11.5px var(--font-open-sans)`, color: 'rgba(255,255,255,.45)' }}>
                          {Number(p.usedCount) || 0}
                          {(Number(p.maxUses) || 0) > 0 ? ` / ${p.maxUses}` : ''} utilisation{(Number(p.usedCount) || 0) > 1 ? 's' : ''}
                          {p.expiresAt ? ` · expire le ${new Date(p.expiresAt).toLocaleDateString('fr-FR')}` : ''}
                          {expired ? ' · EXPIRÉ' : exhausted ? ' · ÉPUISÉ' : p.active === false ? ' · DÉSACTIVÉ' : ''}
                        </p>
                        {p.placeIds && p.placeIds.length > 0 && (
                          <p style={{ margin: '3px 0 0', font: `600 11px var(--font-open-sans)`, color: 'var(--gold)' }}>
                            Limité à : {p.placeIds.map((id) => places.find((pl) => pl.id === id)?.type || id).join(', ')}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="secondary"
                        onClick={() => setConfirmToggle(p)}
                        disabled={rowBusy || saving}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: '1px solid rgba(255,255,255,.14)',
                          background: 'rgba(255,255,255,.06)',
                          color: 'rgba(255,255,255,.8)',
                          font: `600 11.5px var(--font-open-sans)`,
                          flexShrink: 0,
                        }}
                      >
                        {p.active === false ? 'Réactiver' : 'Désactiver'}
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => askRemove(p)}
                        disabled={rowBusy || saving}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: '1px solid rgba(224,90,170,.4)',
                          background: 'rgba(224,90,170,.10)',
                          color: '#ff9ed2',
                          font: `600 11.5px var(--font-open-sans)`,
                          flexShrink: 0,
                        }}
                      >
                        Supprimer
                      </Button>
                    </div>
                  )
                })
              )}
            </div>
            <p style={{ margin: '12px 0 0', font: `500 11.5px var(--font-open-sans)`, color: 'rgba(255,255,255,.38)', lineHeight: 1.6 }}>
              L&apos;acheteur saisit le code dans le récap de réservation — la réduction s&apos;applique au prix de chaque billet (une table = une fois sur le prix de la table). Les utilisations se
              comptent à l&apos;encaissement.
            </p>
          </>
        )}
    </Modal>
    {/* Confirmation de suppression */}
      {confirmRemove && (
        <Modal onClose={() => setConfirmRemove(null)} maxWidth={360} hideClose zIndex={3010} ariaLabel="Supprimer le code promo" contentStyle={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ font: `700 17px var(--font-open-sans)`, color: '#fff', margin: 0 }}>Supprimer ce code promo ?</p>
            <p style={{ font: `500 13.5px var(--font-open-sans)`, color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.55 }}>
              <strong style={{ color: '#fff' }}>{confirmRemove.code}</strong> sera définitivement supprimé, y compris son historique d&apos;utilisation ({Number(confirmRemove.usedCount) || 0}{' '}
              utilisation{(Number(confirmRemove.usedCount) || 0) > 1 ? 's' : ''}). Pour le retirer sans perdre l&apos;historique, utilise plutôt « Désactiver ».
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
              <Button
                variant="secondary"
                onClick={() => setConfirmRemove(null)}
                style={{ flex: 1, padding: '11px', borderRadius: 12, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.9)', font: `600 13.5px var(--font-open-sans)` }}
              >
                Annuler
              </Button>
              <Button
                variant="danger"
                onClick={doConfirmRemove}
                style={{ flex: 1.4, padding: '11px', borderRadius: 12, background: 'var(--pink)', border: '1px solid transparent', color: '#fff', font: `700 13.5px var(--font-open-sans)` }}
              >
                Supprimer
              </Button>
            </div>
        </Modal>
      )}
      {confirmToggle && (
        <Modal onClose={() => setConfirmToggle(null)} maxWidth={360} hideClose zIndex={3010} ariaLabel={confirmToggle.active === false ? 'Réactiver le code promo' : 'Désactiver le code promo'} contentStyle={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ font: `700 17px var(--font-open-sans)`, color: '#fff', margin: 0 }}>
              {confirmToggle.active === false ? 'Réactiver ce code promo ?' : 'Désactiver ce code promo ?'}
            </p>
            <p style={{ font: `500 13.5px var(--font-open-sans)`, color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.55 }}>
              <strong style={{ color: '#fff' }}>{confirmToggle.code}</strong>{' '}
              {confirmToggle.active === false
                ? 'redeviendra immédiatement disponible lors de la réservation.'
                : 'ne pourra plus être utilisé pour de nouvelles réservations tant que tu ne le réactives pas.'}
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
              <Button
                variant="secondary"
                onClick={() => setConfirmToggle(null)}
                style={{ flex: 1, padding: '11px', borderRadius: 12, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.9)', font: `600 13.5px var(--font-open-sans)` }}
              >
                Annuler
              </Button>
              <Button
                variant="danger"
                onClick={doConfirmToggle}
                style={{ flex: 1.4, padding: '11px', borderRadius: 12, background: 'var(--pink)', border: '1px solid transparent', color: '#fff', font: `700 13.5px var(--font-open-sans)` }}
              >
                {confirmToggle.active === false ? 'Réactiver' : 'Désactiver'}
              </Button>
            </div>
        </Modal>
      )}
    </>
  )
}
