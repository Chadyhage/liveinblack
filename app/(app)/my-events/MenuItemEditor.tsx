'use client'

import Image from 'next/image'
import { useState } from 'react'
import { currencySymbol } from '@/lib/shared/money'
import type { ShowOption } from '@/lib/shared/showOptions'
import { Button, Input, Textarea, Label } from '@/app/components/ui'

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
        <p style={{ fontSize: 14, fontWeight: 400, letterSpacing: '3.2px', textTransform: 'uppercase', color: 'var(--teal)', fontFamily: 'var(--font-display), sans-serif' }}>
          Article {index + 1}
        </p>
        {onRemove && (
          <Button
            variant="ghost"
            aria-label="Supprimer l'article"
            onClick={onRemove}
            disabled={disabled}
            style={{ display: 'flex', alignItems: 'center', padding: 2 }}
          >
            <IconClose size={12} color="rgba(220,100,100,0.9)" />
          </Button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {item.imageUrl ? (
          <div style={{ position: 'relative', width: 56, height: 46, flexShrink: 0 }}>
            <Image src={item.imageUrl} alt="" fill style={{ borderRadius: 9, objectFit: 'cover' }} sizes="56px" />
            <Button
              variant="ghost"
              onClick={() => set('imageUrl', null)}
              aria-label="Retirer la photo"
              style={{ position: 'absolute', top: -7, right: -7, width: 21, height: 21, minHeight: 21, minWidth: 21, borderRadius: '50%', border: 0, background: 'var(--pink)', color: '#fff', padding: 0 }}
            >
              ×
            </Button>
          </div>
        ) : (
          <Input style={{ width: 56, textAlign: 'center', flexShrink: 0, padding: '8px 6px' }} placeholder="Icône" value={item.emoji} maxLength={4} disabled={disabled} onChange={(e) => set('emoji', e.target.value)} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Input
            placeholder="Nom de l'article"
            value={item.name}
            disabled={disabled}
            onChange={(e) => set('name', e.target.value)}
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
          <Label>Prix ({currencySymbol(currency)})</Label>
          <Input
            type="number"
            placeholder="0"
            min={0}
            value={item.price}
            disabled={disabled}
            onChange={(e) => set('price', Math.max(0, parseFloat(e.target.value) || 0))}
          />
        </div>
        <div>
          <Label>Catégorie</Label>
          <Input
            placeholder="Ex: Boissons, VIP, Snacks…"
            value={item.category}
            disabled={disabled}
            onChange={(e) => set('category', e.target.value)}
          />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.9)', margin: 0 }}>Disponible à la commande</p>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', margin: '2px 0 0' }}>Masque temporairement cet article sans le supprimer.</p>
        </div>
        <Toggle value={item.available !== false} disabled={disabled} onChange={() => set('available', item.available === false)} />
      </div>

      {!showDesc ? (
        <Button
          variant="ghost"
          onClick={() => setShowDesc(true)}
          disabled={disabled}
          style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', textAlign: 'left', padding: 0, justifyContent: 'flex-start' }}
        >
          + Ajouter une description
        </Button>
      ) : (
        <div>
          <Label>Description (optionnelle)</Label>
          <Textarea
            style={{ resize: 'none' }}
            rows={2}
            placeholder="Ex: Bouteille 75cl servie avec glaçons et pailles dorées..."
            value={item.description}
            disabled={disabled}
            onChange={(e) => set('description', e.target.value)}
          />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.93)' }}>Option show</p>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>Mise en scène spéciale à la livraison</p>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 8, borderLeft: '2px solid rgba(184,243,74,0.18)' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', margin: 0 }}>Shows disponibles pour cet article</p>
          {item.showOptions.map((option, optionIndex) => (
            <div key={option.id} style={{ ...cardStyle, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Input style={{ flex: 1, fontSize: 12 }} placeholder={`Show ${optionIndex + 1} — ex: pancartes + étincelles`} value={option.label} disabled={disabled} onChange={(e) => updateShowOption(option.id, { label: e.target.value })} />
                <Button variant="ghost" disabled={disabled} onClick={() => set('showOptions', item.showOptions.filter((entry) => entry.id !== option.id))} aria-label={`Supprimer le show ${optionIndex + 1}`} style={{ padding: 5 }}><IconClose size={13} color="rgba(220,100,100,.9)" /></Button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,.55)' }}>Demander une information au client</span>
                <Toggle value={option.requiresInfo} disabled={disabled} onChange={() => updateShowOption(option.id, { requiresInfo: !option.requiresInfo, ...(!option.requiresInfo ? {} : { infoPrompt: '' }) })} />
              </div>
              {option.requiresInfo && <Input style={{ fontSize: 12 }} placeholder="Ex: Prénom à écrire sur la pancarte ?" value={option.infoPrompt} disabled={disabled} onChange={(e) => updateShowOption(option.id, { infoPrompt: e.target.value })} />}
              {placeTypes.length > 1 && (
                <div style={{ paddingTop: 5, borderTop: '1px solid rgba(255,255,255,.05)' }}>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', margin: '0 0 6px' }}>Masquer ce show pour :</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {placeTypes.map((placeType) => {
                      const excluded = option.excludedPlaces.includes(placeType)
                      return (
                        <Button
                          key={placeType}
                          variant="ghost"
                          disabled={disabled}
                          onClick={() => updateShowOption(option.id, { excludedPlaces: excluded ? option.excludedPlaces.filter((value) => value !== placeType) : [...option.excludedPlaces, placeType] })}
                          style={{ fontSize: 10.5, fontWeight: 700, padding: '5px 8px', borderRadius: 8, border: excluded ? '1px solid rgba(224,90,170,.5)' : '1px solid rgba(255,255,255,.1)', background: excluded ? 'rgba(224,90,170,.14)' : '#0b0c12', color: excluded ? '#ff9ed2' : 'rgba(255,255,255,.55)' }}
                        >
                          {excluded ? '× ' : ''}{placeType}
                        </Button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
          <Button variant="secondary" disabled={disabled || item.showOptions.length >= 20} onClick={addShowOption} style={{ fontSize: 12, color: 'var(--gold)', border: '1px solid rgba(184,243,74,.35)', borderRadius: 9, background: 'rgba(184,243,74,.08)' }}>+ Ajouter un show</Button>
        </div>
      )}

      {placeTypes.length > 1 && (
        <div style={{ paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>Exclure de certaines places :</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {placeTypes.map((pt) => {
              const isExcluded = item.excludedPlaces.includes(pt)
              return (
                <Button
                  key={pt}
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => set('excludedPlaces', isExcluded ? item.excludedPlaces.filter((x) => x !== pt) : [...item.excludedPlaces, pt])}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '5px 10px',
                    borderRadius: 8,
                    border: isExcluded ? '1px solid rgba(224,90,170,0.5)' : '1px solid rgba(255,255,255,0.10)',
                    background: isExcluded ? 'rgba(224,90,170,0.14)' : '#0b0c12',
                    color: isExcluded ? '#ff9ed2' : 'rgba(255,255,255,0.55)',
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
                </Button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
