import { Skeleton, SkeletonCard } from '@/app/components/ui'

// Squelette instantané pour /profile — la page (Server Component) attend un
// seul aller-retour DB (getMyProfile, findById par _id, déjà indexé) donc ce
// n'est pas un vrai goulot d'étranglement côté backend. Le ressenti "lent au
// clic" côté client vient plutôt de l'absence de ce fichier : sans
// loading.tsx, Next.js n'affiche RIEN tant que le RSC payload complet n'est
// pas prêt (auth() + requête Mongo + rendu), l'utilisateur voit l'ancienne
// page rester figée puis sauter d'un coup. Avec ce fichier, la navigation
// peint immédiatement un état de chargement pendant que le Server Component
// résout ses données en arrière-plan (streaming App Router standard).
export default function ProfileLoading() {
  return (
    <main className="lb-dashboard-page">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <header className="lb-dashboard-page-header">
          <div>
            <Skeleton width={90} height={11} style={{ marginBottom: 8 }} />
            <Skeleton width={180} height={28} style={{ marginBottom: 8 }} />
            <Skeleton width={280} height={13} />
          </div>
        </header>
        <div className="profile-main-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 340px) 1fr', gap: 20, alignItems: 'start' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <Skeleton width={88} height={88} radius={999} />
            <Skeleton width={140} height={18} />
            <Skeleton width={160} height={12} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <SkeletonCard />
            <div className="lb-dashboard-card-grid">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
