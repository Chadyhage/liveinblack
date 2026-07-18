// Squelettes de chargement réutilisables — remplacent les écrans blancs / le
// « pop » brutal du contenu par un placeholder animé (shimmer .lib-skel), qui
// rend l'attente professionnelle et rassurante. Aucune dépendance.

// Bloc gris animé. w/h acceptent nombre (px) ou chaîne (%, rem…).
export function Skeleton({ w = '100%', h = 14, r = 8, style, className = '' }) {
  return (
    <span
      className={`lib-skel ${className}`}
      style={{
        display: 'block',
        width: typeof w === 'number' ? `${w}px` : w,
        height: typeof h === 'number' ? `${h}px` : h,
        borderRadius: r,
        ...style,
      }}
    />
  )
}

// Quelques lignes de texte (la dernière plus courte).
export function SkeletonText({ lines = 3, gap = 8, lastWidth = '60%' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} h={12} w={i === lines - 1 ? lastWidth : '100%'} />
      ))}
    </div>
  )
}

// Carte événement (miroir du gabarit des vraies cartes : affiche 16/9 + titre + méta).
export function SkeletonEventCard() {
  return (
    <div style={{
      background: '#0e0f16', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 16, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
    }}>
      <Skeleton w="100%" h={0} r={0} style={{ aspectRatio: '16 / 9', height: 'auto' }} />
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Skeleton w="72%" h={16} />
        <Skeleton w="45%" h={12} />
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <Skeleton w={64} h={22} r={999} />
          <Skeleton w={54} h={22} r={999} />
        </div>
      </div>
    </div>
  )
}

// Grille de cartes événement (n placeholders).
export function SkeletonEventGrid({ count = 6, minCol = 260 }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fill, minmax(${minCol}px, 1fr))`,
      gap: 16,
    }}>
      {Array.from({ length: count }).map((_, i) => <SkeletonEventCard key={i} />)}
    </div>
  )
}

// Ligne (avatar + deux lignes) — messagerie, listes de contacts, etc.
export function SkeletonRow({ avatar = true }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px' }}>
      {avatar && <Skeleton w={44} h={44} r="50%" />}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Skeleton w="40%" h={13} />
        <Skeleton w="65%" h={11} />
      </div>
    </div>
  )
}
