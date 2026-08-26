import Link from 'next/link'

export interface PageLinksProps {
  page: number
  pageCount: number
  makeHref: (page: number) => string
  totalItems?: number
  pageSize?: number
}

// Variante Server Component de Pagination.tsx (app/components/ui/Pagination.tsx)
// — les annuaires publics (/organizers, /providers, /events, /search) restent
// 100% server-rendered (filtres/tri déjà pilotés par des query params `?q=`
// etc., voir ces pages), donc la pagination doit l'être aussi : navigation
// par <Link href="?...&page=N">, jamais de state client ni de callback
// onPageChange. Même logique de liste compacte de pages que Pagination.tsx.
export default function PageLinks({ page, pageCount, makeHref, totalItems, pageSize }: PageLinksProps) {
  if (pageCount <= 1) return null

  const pages = buildPageList(page, pageCount)
  const rangeLabel =
    totalItems != null && pageSize
      ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalItems)} sur ${totalItems}`
      : null

  return (
    <nav aria-label="Pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
      {rangeLabel && <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{rangeLabel}</span>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
        <PageLink href={page > 1 ? makeHref(page - 1) : null} label="‹" ariaLabel="Page précédente" />
        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`gap-${i}`} style={{ fontSize: 12, color: 'var(--text-faint)', padding: '0 4px' }}>
              …
            </span>
          ) : (
            <PageLink key={p} href={makeHref(p)} label={String(p)} active={p === page} />
          )
        )}
        <PageLink href={page < pageCount ? makeHref(page + 1) : null} label="›" ariaLabel="Page suivante" />
      </div>
    </nav>
  )
}

function PageLink({ href, label, ariaLabel, active }: { href: string | null; label: string; ariaLabel?: string; active?: boolean }) {
  const style: React.CSSProperties = {
    minWidth: 26,
    padding: '5px 8px',
    borderRadius: 7,
    textAlign: 'center',
    fontSize: 11.5,
    fontWeight: active ? 800 : 600,
    textDecoration: 'none',
    color: active ? 'var(--primary-ink)' : href ? 'var(--text-muted)' : 'var(--text-faint)',
    background: active ? 'var(--primary)' : 'transparent',
    border: active ? '1px solid transparent' : '1px solid var(--border)',
    pointerEvents: href ? 'auto' : 'none',
    opacity: href || active ? 1 : 0.4,
  }
  if (!href) return <span style={style}>{label}</span>
  return (
    <Link href={href} aria-label={ariaLabel} aria-current={active ? 'page' : undefined} style={style}>
      {label}
    </Link>
  )
}

function buildPageList(page: number, pageCount: number): (number | '…')[] {
  const delta = 1
  const range: (number | '…')[] = []
  const start = Math.max(2, page - delta)
  const end = Math.min(pageCount - 1, page + delta)

  range.push(1)
  if (start > 2) range.push('…')
  for (let i = start; i <= end; i++) range.push(i)
  if (end < pageCount - 1) range.push('…')
  if (pageCount > 1) range.push(pageCount)

  return range
}

export function pageSlice<T>(items: T[], page: number, pageSize: number): { pageItems: T[]; pageCount: number; safePage: number } {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const safePage = Math.min(Math.max(1, page), pageCount)
  const start = (safePage - 1) * pageSize
  return { pageItems: items.slice(start, start + pageSize), pageCount, safePage }
}
