'use client'

import { useState } from 'react'
import { currencySymbol } from '@/lib/shared/money'

// Sous-composant du wizard événement (EventWizard.tsx) — port de
// MenuItemEditor (MesEvenementsPage.jsx lignes ~3281-3542).
//
// Deux simplifications assumées pour cette passe (voir rapport de la
// tâche #77) :
// - Icône EMOJI uniquement : pas d'upload photo par article (le champ
//   `imageUrl` existe toujours dans le type / la charge utile pour matcher
//   le schéma serveur, mais reste toujours `null` ici — aucune UI d'upload).
// - Une seule « option show » par article, stockée comme une chaîne unique
//   dans `showOptions` (`[label]` si activée, `[]` sinon), au lieu de la
//   sous-structure `showOptions[]` avec `requiresInfo`/`infoPrompt` et
//   exclusions de places PAR show de la legacy. Couvre le concept central
//   « cette conso a un show » sans le niveau de détail complet.
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
  hasShow: boolean
  showOptions: string[]
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
}

export default function MenuItemEditor({ item, index, currency, placeTypes, disabled = false, onChange, onRemove }: MenuItemEditorProps) {
  const [showDesc, setShowDesc] = useState(!!item.description)

  function set<K extends keyof MenuItemRow>(field: K, value: MenuItemRow[K]) {
    onChange({ ...item, [field]: value })
  }

  const showLabel = item.showOptions[0] || ''

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

      {/* Icône (emoji uniquement — voir note de simplification en tête de fichier) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          style={{ ...inputBase, width: 56, textAlign: 'center', flexShrink: 0, padding: '8px 6px' }}
          placeholder="Icône"
          value={item.emoji}
          maxLength={4}
          disabled={disabled}
          onChange={(e) => set('emoji', e.target.value)}
          onFocus={focusTeal}
          onBlur={blurDefault}
        />
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
            onChange({ ...item, hasShow: next, showOptions: next ? item.showOptions : [] })
          }}
        />
      </div>

      {item.hasShow && (
        <div style={{ paddingLeft: 8, borderLeft: '2px solid rgba(200,169,110,0.18)' }}>
          <label style={labelStyle}>Intitulé du show</label>
          <input
            style={{ ...inputBase, fontSize: 12 }}
            placeholder="Ex: Pancartes + feu d'artifices"
            value={showLabel}
            disabled={disabled}
            onChange={(e) => set('showOptions', e.target.value ? [e.target.value] : [])}
            onFocus={focusTeal}
            onBlur={blurDefault}
          />
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
