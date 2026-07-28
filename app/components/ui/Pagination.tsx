'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import Button from './Button'

export interface PaginationProps {
  page: number
  pageCount: number
  onPageChange: (page: number) => void
  totalItems?: number
  pageSize?: number
}

// Primitive de pagination générique, réutilisée par toutes les listes de
// l'app (voir CLAUDE.md — aucune liste ne doit rester sans pagination).
// Purement contrôlée : ne connaît rien du fetch/du slice, juste `page`/
// `pageCount`. Génère un jeu de pages compact (premier, dernier, voisins de
// la page courante, `…` pour le reste) pour rester lisible même à 50+ pages.
export default function Pagination({ page, pageCount, onPageChange, totalItems, pageSize }: PaginationProps) {
  if (pageCount <= 1) return null

  const pages = buildPageList(page, pageCount)
  const rangeLabel =
    totalItems != null && pageSize
      ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalItems)} sur ${totalItems}`
      : null

  return (
    <nav aria-label="Pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
      {rangeLabel && <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{rangeLabel}</span>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
        <Button
          variant="ghost"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Page précédente"
          style={{ padding: '6px 8px' }}
        >
          <ChevronLeft size={16} />
        </Button>
        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`gap-${i}`} style={{ fontSize: 12, color: 'var(--text-faint)', padding: '0 4px' }}>
              …
            </span>
          ) : (
            <Button
              key={p}
              variant={p === page ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => onPageChange(p)}
              aria-current={p === page ? 'page' : undefined}
              style={{ minWidth: 30, padding: '6px 8px' }}
            >
              {p}
            </Button>
          )
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
          aria-label="Page suivante"
          style={{ padding: '6px 8px' }}
        >
          <ChevronRight size={16} />
        </Button>
      </div>
    </nav>
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

// Helper (PAS un hook malgré le nommage historique évité ici — juste un
// slice pur) pour la pagination client d'une liste déjà entièrement fetchée
// (cas de toutes les listes agent aujourd'hui, voir plan). `page` est
// automatiquement plafonné à `pageCount` si la liste se réduit sous la page
// courante (ex. après un filtre).
export function pagedSlice<T>(items: T[], page: number, pageSize: number): { pageItems: T[]; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const safePage = Math.min(page, pageCount)
  const start = (safePage - 1) * pageSize
  return { pageItems: items.slice(start, start + pageSize), pageCount }
}
