// src/components/Breadcrumb.jsx
// Fil d'ariane (style Shotgun) + bouton retour arrière.
// <Breadcrumb items={[{ label, to }, ...]} /> — le DERNIER item est la page
// courante (non cliquable), les précédents sont des liens react-router.
// Le bouton flèche fait navigate(-1) ; si l'utilisateur est arrivé directement
// par un lien externe (historique vide), on retombe sur le parent direct.

import { Link, useNavigate } from 'react-router-dom'

function ChevronLeft({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

function ChevronSep() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

export default function Breadcrumb({ items = [], style }) {
  const navigate = useNavigate()
  if (!items.length) return null

  const parents = items.slice(0, -1)
  const current = items[items.length - 1]

  function goBack() {
    // Arrivée directe (lien partagé, nouvel onglet) : pas d'historique interne
    // → retomber sur le parent direct plutôt que de quitter le site.
    const idx = window.history.state?.idx
    const canGoBack = typeof idx === 'number' ? idx > 0 : window.history.length > 1
    if (canGoBack) navigate(-1)
    else navigate(parents.length ? parents[parents.length - 1].to : '/accueil')
  }

  return (
    <nav aria-label="Fil d'ariane" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', minWidth: 0, maxWidth: '100%', ...style }}>
      <style>{`
        .lib-crumb-link { text-decoration: none; }
        .lib-crumb-link:hover { text-decoration: underline; }
      `}</style>
      <button
        type="button"
        onClick={goBack}
        aria-label="Retour"
        style={{
          width: 36, height: 36, borderRadius: '50%', flexShrink: 0, padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
          color: 'rgba(255,255,255,0.9)', cursor: 'pointer',
        }}
      >
        <ChevronLeft size={18} />
      </button>
      <div
        className="hide-scrollbar"
        style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflowX: 'auto', whiteSpace: 'nowrap', fontFamily: 'Inter, sans-serif', fontSize: 13 }}
      >
        {parents.map((item, i) => (
          <span key={`${item.to}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <Link to={item.to} className="lib-crumb-link" style={{ color: 'rgba(255,255,255,0.92)', fontWeight: 600 }}>{item.label}</Link>
            <ChevronSep />
          </span>
        ))}
        <span aria-current="page" style={{ color: 'rgba(255,255,255,0.45)', fontWeight: 500, flexShrink: 0 }}>{current.label}</span>
      </div>
    </nav>
  )
}
