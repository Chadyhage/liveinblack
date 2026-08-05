const INTERNAL_URL_BASE = 'https://liveinblack.invalid'

export function safeInternalPath(value: string | null | undefined, fallback: string): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback

  try {
    const parsed = new URL(value, INTERNAL_URL_BASE)
    if (parsed.origin !== INTERNAL_URL_BASE) return fallback
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return fallback
  }
}
