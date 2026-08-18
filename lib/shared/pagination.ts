export type PaginationBounds = {
  min?: number
  max?: number
}

const DEFAULT_BOUNDS: PaginationBounds = { min: 1, max: undefined }

function toNumber(value: string | null | undefined) {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed)) return Number.NaN
  return parsed
}

export function parsePage(
  value: string | null | undefined,
  fallback = 1,
  bounds: PaginationBounds = DEFAULT_BOUNDS,
) {
  const parsed = toNumber(value)
  const min = bounds.min ?? 1
  const max = bounds.max ?? Number.MAX_SAFE_INTEGER
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(parsed, max))
}

export function parsePageSize(
  value: string | null | undefined,
  fallback: number,
  bounds: PaginationBounds,
) {
  const parsed = toNumber(value)
  const min = bounds.min ?? 1
  const max = bounds.max ?? Number.MAX_SAFE_INTEGER
  if (!Number.isFinite(parsed) || parsed < min) return fallback
  return Math.max(min, Math.min(parsed, max))
}
