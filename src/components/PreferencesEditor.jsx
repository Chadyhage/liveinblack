import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AMBIANCES,
  BUDGETS,
  EMPTY_PREFERENCES,
  EVENT_TYPES,
  FREQUENCIES,
  GROUP_PREFS,
  MUSIC_STYLES,
} from '../utils/recommendations'

// ─── Éditeur de goûts client ──────────────────────────────────────────────────
// Utilisé à deux endroits : carte « Mes goûts » des Paramètres + modal
// d'onboarding post-inscription (PreferencesModal ci-dessous). Tout est
// OPTIONNEL : on enregistre ce qui est rempli, rien n'est bloquant.
// Sauvegarde = même pattern que les toggles de confidentialité :
// setUser + lib_user + syncDoc users/{uid} { preferences } (fire-and-forget).

const FONT = 'Inter, system-ui, sans-serif'
const TEAL = '#4ee8c8'
const VIOLET = '#8444ff'

const groupLabel = {
  fontFamily: FONT, fontSize: 10, fontWeight: 800, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', margin: '0 0 8px',
}
const chipRow = { display: 'flex', flexWrap: 'wrap', gap: 7 }
const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.045)',
  color: '#fff', outline: 'none', fontFamily: FONT, fontSize: 13,
}

function Chip({ active, color = TEAL, onClick, children }) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: '8px 13px', borderRadius: 999, cursor: 'pointer',
      border: `1px solid ${active ? color : 'rgba(255,255,255,0.14)'}`,
      background: active ? `${color}1f` : 'rgba(255,255,255,0.04)',
      color: active ? color : 'rgba(255,255,255,0.65)',
      fontFamily: FONT, fontSize: 12, fontWeight: 700, transition: 'all .15s',
    }}>
      {children}
    </button>
  )
}

export function savePreferences(user, setUser, preferences) {
  const uid = user?.uid || user?.id
  if (!uid) return
  const clean = { ...EMPTY_PREFERENCES, ...preferences, updatedAt: Date.now() }
  const updated = { ...user, preferences: clean }
  setUser(updated)
  try { localStorage.setItem('lib_user', JSON.stringify(updated)) } catch {}
  import('../utils/firestore-sync').then(({ syncDoc }) => syncDoc(`users/${uid}`, { preferences: clean })).catch(() => {})
  return clean
}

export default function PreferencesEditor({ user, setUser, onSaved, saveLabel = 'Enregistrer mes goûts' }) {
  const [prefs, setPrefs] = useState(() => ({ ...EMPTY_PREFERENCES, ...(user?.preferences || {}) }))
  const [artistsText, setArtistsText] = useState(() => (user?.preferences?.artists || []).join(', '))
  const [citiesText, setCitiesText] = useState(() => (user?.preferences?.cities || []).join(', '))
  const [saved, setSaved] = useState(false)

  // Hydratation tardive : si les préférences arrivent APRÈS le montage (sync
  // Firestore au login), on ré-hydrate le formulaire — sauf si l'utilisateur a
  // déjà commencé à le modifier (jamais écraser une édition en cours).
  const touchedRef = useRef(false)
  useEffect(() => {
    if (touchedRef.current || !user?.preferences) return
    setPrefs({ ...EMPTY_PREFERENCES, ...user.preferences })
    setArtistsText((user.preferences.artists || []).join(', '))
    setCitiesText((user.preferences.cities || []).join(', '))
  }, [user?.preferences]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleIn = (key, id) => { touchedRef.current = true; setPrefs(p => ({
    ...p,
    [key]: (p[key] || []).includes(id) ? p[key].filter(x => x !== id) : [...(p[key] || []), id],
  })) }
  const setSingle = (key, id) => { touchedRef.current = true; setPrefs(p => ({ ...p, [key]: p[key] === id ? '' : id })) }
  const parseList = text => text.split(',').map(s => s.trim()).filter(Boolean).slice(0, 12)
  const setList = (key, text) => { touchedRef.current = true; setPrefs(p => ({ ...p, [key]: parseList(text) })) }

  function handleSave() {
    savePreferences(user, setUser, prefs)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
    onSaved?.(prefs)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <p style={groupLabel}>Styles musicaux préférés</p>
        <div style={chipRow}>
          {MUSIC_STYLES.map(s => <Chip key={s.id} active={prefs.musicStyles.includes(s.id)} onClick={() => toggleIn('musicStyles', s.id)}>{s.label}</Chip>)}
        </div>
      </div>

      <div>
        <p style={groupLabel}>Artistes / DJs préférés</p>
        <input
          style={inputStyle}
          value={artistsText}
          onChange={e => { setArtistsText(e.target.value); setList('artists', e.target.value) }}
          placeholder="Burna Boy, DJ Arafat, Aya Nakamura… (sépare par des virgules)"
        />
      </div>

      <div>
        <p style={groupLabel}>Types de soirées</p>
        <div style={chipRow}>
          {EVENT_TYPES.map(t => <Chip key={t.id} active={prefs.eventTypes.includes(t.id)} onClick={() => toggleIn('eventTypes', t.id)}>{t.label}</Chip>)}
        </div>
      </div>

      <div>
        <p style={groupLabel}>Villes où tu sors</p>
        <input
          style={inputStyle}
          value={citiesText}
          onChange={e => { setCitiesText(e.target.value); setList('cities', e.target.value) }}
          placeholder="Lomé, Paris, Cotonou… (sépare par des virgules)"
        />
      </div>

      <div>
        <p style={groupLabel}>Budget moyen par sortie</p>
        <div style={chipRow}>
          {BUDGETS.map(b => <Chip key={b.id} color={VIOLET} active={prefs.budget === b.id} onClick={() => setSingle('budget', b.id)}>{b.label}</Chip>)}
        </div>
      </div>

      <div>
        <p style={groupLabel}>Ambiance recherchée</p>
        <div style={chipRow}>
          {AMBIANCES.map(a => <Chip key={a.id} active={prefs.ambiances.includes(a.id)} onClick={() => toggleIn('ambiances', a.id)}>{a.label}</Chip>)}
        </div>
      </div>

      <div>
        <p style={groupLabel}>Tu sors…</p>
        <div style={chipRow}>
          {FREQUENCIES.map(f => <Chip key={f.id} color={VIOLET} active={prefs.frequency === f.id} onClick={() => setSingle('frequency', f.id)}>{f.label}</Chip>)}
        </div>
      </div>

      <div>
        <p style={groupLabel}>Plutôt…</p>
        <div style={chipRow}>
          {GROUP_PREFS.map(g => <Chip key={g.id} color={VIOLET} active={prefs.groupPref === g.id} onClick={() => setSingle('groupPref', g.id)}>{g.label}</Chip>)}
        </div>
      </div>

      <button type="button" onClick={handleSave} style={{
        padding: '14px 24px', borderRadius: 999, border: 'none', cursor: 'pointer',
        background: saved ? 'rgba(78,232,200,0.15)' : `linear-gradient(135deg, ${VIOLET}, #a56bff)`,
        color: saved ? TEAL : '#fff', fontFamily: FONT, fontSize: 13, fontWeight: 800,
        boxShadow: saved ? 'none' : '0 8px 24px -8px rgba(132,68,255,0.55)',
        transition: 'all .2s',
      }}>
        {saved ? 'Goûts enregistrés ✓' : saveLabel}
      </button>
    </div>
  )
}

// ─── Modal d'onboarding (bannière accueil → « Personnalise ton expérience ») ──
export function PreferencesModal({ open, onClose, user, setUser }) {
  if (!open) return null
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(6px)' }} onClick={onClose} />
      <div style={{
        position: 'relative', width: '100%', maxWidth: 560, maxHeight: '86vh', overflowY: 'auto',
        background: 'rgba(8,9,18,0.98)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20, padding: '22px 20px 20px',
      }}>
        <button onClick={onClose} aria-label="Fermer" style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 0, color: 'rgba(255,255,255,0.5)', fontSize: 26, cursor: 'pointer', lineHeight: 1 }}>×</button>
        <p style={{ fontFamily: FONT, fontSize: 10, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: VIOLET, margin: '0 0 6px' }}>Personnalisation</p>
        <h2 style={{ fontFamily: FONT, fontSize: 24, fontWeight: 800, letterSpacing: '-0.5px', color: '#fff', margin: '0 0 4px' }}>Dis-nous ce que tu aimes</h2>
        <p style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, margin: '0 0 20px' }}>
          Tout est optionnel et modifiable à tout moment dans tes Paramètres. On s’en sert uniquement pour te recommander les bonnes soirées.
        </p>
        <PreferencesEditor user={user} setUser={setUser} saveLabel="C’est parti !" onSaved={() => setTimeout(onClose, 650)} />
      </div>
    </div>,
    document.body,
  )
}
