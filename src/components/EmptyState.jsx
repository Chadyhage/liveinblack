// État vide réutilisable — look premium cohérent dans toute l'app.
// icon : un <svg> (ou émoji) ; title : Cormorant ; subtitle : DM Mono ; action : optionnel.
export default function EmptyState({ icon, title, subtitle, action, compact = false }) {
  return (
    <div style={{
      textAlign: 'center',
      padding: compact ? '40px 20px' : '64px 24px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
    }}>
      {icon && (
        <div style={{
          width: 60, height: 60, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'radial-gradient(circle at 32% 28%, rgba(78,232,200,0.10), rgba(255,255,255,0.015) 70%)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
        }}>
          {icon}
        </div>
      )}
      <div>
        <p style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 400, fontSize: 20, color: 'rgba(255,255,255,0.72)', margin: '0 0 5px', letterSpacing: '0.01em' }}>
          {title}
        </p>
        {subtitle && (
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.30)', margin: 0, lineHeight: 1.7 }}>
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  )
}
