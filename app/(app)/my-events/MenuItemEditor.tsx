'use client'

import { useState } from 'react'
import { currencySymbol } from '@/lib/shared/money'
import type { ShowOption } from '@/lib/shared/showOptions'

// Sous-composant du wizard événement (EventWizard.tsx) — port de
// MenuItemEditor (MesEvenementsPage.jsx lignes ~3281-3542).
//
// NB style : les constantes S/Toggle/IconClose sont dupliquées ici plutôt
// qu'importées depuis EventWizard.tsx pour éviter un import circulaire entre
// les deux fichiers (EventWizard importe ce composant) — chaque fichier
// reste autonome, au prix d'une petite duplication de constantes de style.

export interface MenuItemRow {
  name: string
  emoji: string
  imageUrl: string | null
  price: number
  category: string
  description: string
  available: boolean
  hasShow: boolean
  showOptions: ShowOption[]
  excludedPlaces: string[]
}

export function emptyMenuItem(): MenuItemRow {
  return {
    name: '',
    emoji: '',
    imageUrl: null,
    price: 0,
    category: 'Boissons',
    description: '',
    available: true,
    hasShow: false,
    showOptions: [],
    excludedPlaces: [],
  }
}

const inputBase: React.CSSProperties = {
  background: '#0b0c12',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 10,
  fontFamily: 'Inter, sans-serif',
  fontSize: 14,
  fontWeight: 500,
  color: 'rgba(255,255,255,0.92)',
  padding: '12px 14px',
  width: '100%',
  outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'Inter, sans-serif',
  fontSize: 12,
  fontWeight: 600,
  color: 'rgba(255,255,255,0.6)',
  display: 'block',
  marginBottom: 6,
}

const cardStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
}

function IconClose({ size = 12, color = 'rgba(255,255,255,0.5)' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function Toggle({ value, onChange, disabled = false }: { value: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <div
      onClick={disabled ? undefined : onChange}
      onKeyDown={(e) => {
        if (disabled) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onChange()
        }
      }}
      role="switch"
      aria-checked={value}
      tabIndex={disabled ? -1 : 0}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        background: value ? 'var(--teal)' : 'rgba(255,255,255,0.08)',
        position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.2s',
        flexShrink: 0,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 4,
          width: 16,
          height: 16,
          background: 'white',
          borderRadius: '50%',
          transition: 'left 0.2s',
          left: value ? 24 : 4,
          boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
        }}
      />
    </div>
  )
}

function focusTeal(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.target.style.borderColor = 'var(--teal)'
  e.target.style.boxShadow = '0 0 0 3px rgba(78,232,200,0.06)'
}
function blurDefault(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.target.style.borderColor = 'rgba(255,255,255,0.10)'
  e.target.style.boxShadow = 'none'
}

export interface MenuItemEditorProps {
  item: MenuItemRow
  index: number
  currency: 'EUR' | 'XOF'
  placeTypes: string[]
  disabled?: boolean
  onChange: (item: MenuItemRow) => void
  onRemove?: () => void
  onUploadImage?: (file: File) => Promise<string>
}

export default function MenuItemEditor({ item, index, currency, placeTypes, disabled = false, onChange, onRemove, onUploadImage }: MenuItemEditorProps) {
  const [showDesc, setShowDesc] = useState(!!item.description)
  const [imageUploading, setImageUploading] = useState(false)
  const [imageError, setImageError] = useState('')

  function set<K extends keyof MenuItemRow>(field: K, value: MenuItemRow[K]) {
    onChange({ ...item, [field]: value })
  }

  function addShowOption() {
    const option: ShowOption = {
      id: `show-${globalThis.crypto.randomUUID()}`,
      label: '',
      requiresInfo: false,
      infoPrompt: '',
      excludedPlaces: [],
    }
    set('showOptions', [...item.showOptions, option])
  }

  function updateShowOption(id: string, patch: Partial<ShowOption>) {
    set('showOptions', item.showOptions.map((option) => (option.id === id ? { ...option, ...patch } : option)))
  }

  return (
    <div style={{ ...cardStyle, padding: 12, marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 10, opacity: disabled ? 0.55 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>
          Article {index + 1}
        </p>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            style={{ background: 'none', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', padding: 2 }}
          >
            <IconClose size={12} color="rgba(220,100,100,0.9)" />
          </button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {item.imageUrl ? (
          <div style={{ position: 'relative', width: 56, height: 46, flexShrink: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.imageUrl} alt="" style={{ width: '100%', height: '100%', borderRadius: 9, objectFit: 'cover' }} />
            <button type="button" onClick={() => set('imageUrl', null)} aria-label="Retirer la photo" style={{ position: 'absolute', top: -7, right: -7, width: 21, height: 21, borderRadius: '50%', border: 0, background: 'var(--pink)', color: '#fff', cursor: 'pointer' }}>×</button>
          </div>
        ) : (
          <input style={{ ...inputBase, width: 56, textAlign: 'center', flexShrink: 0, padding: '8px 6px' }} placeholder="Icône" value={item.emoji} maxLength={4} disabled={disabled} onChange={(e) => set('emoji', e.target.value)} onFocus={focusTeal} onBlur={blurDefault} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <input
            style={{ ...inputBase }}
            placeholder="Nom de l'article"
            value={item.name}
            disabled={disabled}
            onChange={(e) => set('name', e.target.value)}
            onFocus={focusTeal}
            onBlur={blurDefault}
          />
        </div>
      </div>
      {onUploadImage && (
        <label style={{ alignSelf: 'flex-start', padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.05)', color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, cursor: disabled || imageUploading ? 'not-allowed' : 'pointer' }}>
          {imageUploading ? 'Envoi de la photo…' : item.imageUrl ? 'Changer la photo' : 'Ajouter une photo'}
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || imageUploading} style={{ display: 'none' }} onChange={async (event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) return
            setImageError('')
            setImageUploading(true)
            try { set('imageUrl', await onUploadImage(file)) } catch { setImageError("L'envoi de la photo a échoué.") } finally { setImageUploading(false) }
          }} />
        </label>
      )}
      {imageError && <p role="alert" style={{ margin: '-4px 0 0', color: 'var(--pink)', fontSize: 11 }}>{imageError}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label style={labelStyle}>Prix ({currencySymbol(currency)})</label>
          <input
            style={{ ...inputBase }}
            type="number"
            placeholder="0"
            min={0}
            value={item.price}
            disabled={disabled}
            onChange={(e) => set('price', Math.max(0, parseFloat(e.target.value) || 0))}
            onFocus={focusTeal}
            onBlur={blurDefault}
          />
        </div>
        <div>
          <label style={labelStyle}>Catégorie</label>
          <input
            style={{ ...inputBase }}
            placeholder="Ex: Boissons, VIP, Snacks…"
            value={item.category}
            disabled={disabled}
            onChange={(e) => set('category', e.target.value)}
            onFocus={focusTeal}
            onBlur={blurDefault}
          />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 }}>
        <div>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.9)', margin: 0 }}>Disponible à la commande</p>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.45)', margin: '2px 0 0' }}>Masque temporairement cet article sans le supprimer.</p>
        </div>
        <Toggle value={item.available !== false} disabled={disabled} onChange={() => set('available', item.available === false)} />
      </div>

      {!showDesc ? (
        <button
          type="button"
          onClick={() => setShowDesc(true)}
          disabled={disabled}
          style={{ background: 'none', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.65)', textAlign: 'left', padding: 0 }}
        >
          + Ajouter une description
        </button>
      ) : (
        <div>
          <label style={labelStyle}>Description (optionnelle)</label>
          <textarea
            style={{ ...inputBase, resize: 'none' }}
            rows={2}
            placeholder="Ex: Bouteille 75cl servie avec glaçons et pailles dorées..."
            value={item.description}
            disabled={disabled}
            onChange={(e) => set('description', e.target.value)}
            onFocus={focusTeal}
            onBlur={blurDefault}
          />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.93)' }}>Option show</p>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>Mise en scène spéciale à la livraison</p>
        </div>
        <Toggle
          value={item.hasShow}
          disabled={disabled}
          onChange={() => {
            const next = !item.hasShow
            if (!next) onChange({ ...item, hasShow: false, showOptions: [] })
            else if (item.showOptions.length) onChange({ ...item, hasShow: true })
            else onChange({ ...item, hasShow: true, showOptions: [{ id: `show-${globalThis.crypto.randomUUID()}`, label: '', requiresInfo: false, infoPrompt: '', excludedPlaces: [] }] })
          }}
        />
      </div>

      {item.hasShow && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 8, borderLeft: '2px solid rgba(200,169,110,0.18)' }}>
          <p style={{ ...labelStyle, margin: 0 }}>Shows disponibles pour cet article</p>
          {item.showOptions.map((option, optionIndex) => (
            <div key={option.id} style={{ ...cardStyle, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input style={{ ...inputBase, flex: 1, fontSize: 12 }} placeholder={`Show ${optionIndex + 1} — ex: pancartes + étincelles`} value={option.label} disabled={disabled} onChange={(e) => updateShowOption(option.id, { label: e.target.value })} onFocus={focusTeal} onBlur={blurDefault} />
                <button type="button" disabled={disabled} onClick={() => set('showOptions', item.showOptions.filter((entry) => entry.id !== option.id))} aria-label={`Supprimer le show ${optionIndex + 1}`} style={{ background: 'none', border: 0, padding: 5, cursor: disabled ? 'not-allowed' : 'pointer' }}><IconClose size={13} color="rgba(220,100,100,.9)" /></button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11.5, color: 'rgba(255,255,255,.55)' }}>Demander une information au client</span>
                <Toggle value={option.requiresInfo} disabled={disabled} onChange={() => updateShowOption(option.id, { requiresInfo: !option.requiresInfo, ...(!option.requiresInfo ? {} : { infoPrompt: '' }) })} />
              </div>
              {option.requiresInfo && <input style={{ ...inputBase, fontSize: 12 }} placeholder="Ex: Prénom à écrire sur la pancarte ?" value={option.infoPrompt} disabled={disabled} onChange={(e) => updateShowOption(option.id, { infoPrompt: e.target.value })} onFocus={focusTeal} onBlur={blurDefault} />}
              {placeTypes.length > 1 && (
                <div style={{ paddingTop: 5, borderTop: '1px solid rgba(255,255,255,.05)' }}>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(255,255,255,.45)', margin: '0 0 6px' }}>Masquer ce show pour :</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {placeTypes.map((placeType) => {
                      const excluded = option.excludedPlaces.includes(placeType)
                      return <button key={placeType} type="button" disabled={disabled} onClick={() => updateShowOption(option.id, { excludedPlaces: excluded ? option.excludedPlaces.filter((value) => value !== placeType) : [...option.excludedPlaces, placeType] })} style={{ fontSize: 10.5, fontWeight: 700, padding: '5px 8px', borderRadius: 8, border: excluded ? '1px solid rgba(224,90,170,.5)' : '1px solid rgba(255,255,255,.1)', background: excluded ? 'rgba(224,90,170,.14)' : '#0b0c12', color: excluded ? '#ff9ed2' : 'rgba(255,255,255,.55)', cursor: disabled ? 'not-allowed' : 'pointer' }}>{excluded ? '× ' : ''}{placeType}</button>
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
          <button type="button" disabled={disabled || item.showOptions.length >= 20} onClick={addShowOption} style={{ padding: '8px 12px', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, color: 'var(--gold)', border: '1px solid rgba(200,169,110,.35)', borderRadius: 9, background: 'rgba(200,169,110,.08)', cursor: disabled ? 'not-allowed' : 'pointer' }}>+ Ajouter un show</button>
        </div>
      )}

      {placeTypes.length > 1 && (
        <div style={{ paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>Exclure de certaines places :</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {placeTypes.map((pt) => {
              const isExcluded = item.excludedPlaces.includes(pt)
              return (
                <button
                  key={pt}
                  type="button"
                  disabled={disabled}
                  onClick={() => set('excludedPlaces', isExcluded ? item.excludedPlaces.filter((x) => x !== pt) : [...item.excludedPlaces, pt])}
                  style={{
                    fontFamily: 'Inter, sans-serif',
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '5px 10px',
                    borderRadius: 8,
                    border: isExcluded ? '1px solid rgba(224,90,170,0.5)' : '1px solid rgba(255,255,255,0.10)',
                    background: isExcluded ? 'rgba(224,90,170,0.14)' : '#0b0c12',
                    color: isExcluded ? '#ff9ed2' : 'rgba(255,255,255,0.55)',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isExcluded ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                      {pt}
                    </span>
                  ) : (
                    pt
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
