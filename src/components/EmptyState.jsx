// État vide réutilisable — cohérent dans toute l'app.
// icon : un <svg> (icons.jsx) ; title : titre court ; subtitle : description ; action : CTA optionnel.
export default function EmptyState({ icon, title, subtitle, action, compact = false }) {
  return (
    <div style={{
      textAlign: 'center',
      padding: compact ? '40px 20px' : '64px 24px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
    }}>
      {icon && (
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          {icon}
        </div>
      )}
      <div>
        <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 15, color: 'rgba(255,255,255,0.92)', margin: '0 0 5px' }}>
          {title}
        </p>
        {subtitle && (
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: 0, lineHeight: 1.6, maxWidth: 340 }}>
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  )
}
