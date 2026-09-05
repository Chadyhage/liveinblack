type OpsConfig = {
  maintenanceMode: boolean
  checkoutEnabled: boolean
  ticketResaleEnabled: boolean
  searchMinQueryLength: number
  publicCacheTtlSeconds: number
}

const DEFAULT_OPS_CONFIG: OpsConfig = {
  maintenanceMode: false,
  checkoutEnabled: true,
  ticketResaleEnabled: false,
  searchMinQueryLength: 2,
  publicCacheTtlSeconds: 45,
}

const KEY_MAP = {
  maintenanceMode: 'maintenance_mode',
  checkoutEnabled: 'checkout_enabled',
  ticketResaleEnabled: 'ticket_resale_enabled',
  searchMinQueryLength: 'search_min_query_length',
  publicCacheTtlSeconds: 'public_cache_ttl_seconds',
} as const

let cachedConfig: { value: OpsConfig; expiresAt: number } | null = null

export function clearVercelOpsConfigCache() {
  cachedConfig = null
}

function getEdgeConfigItemUrl(key: string) {
  const connection = process.env.EDGE_CONFIG
  if (!connection) return null

  try {
    const url = new URL(connection)
    url.pathname = `${url.pathname.replace(/\/$/, '')}/item/${encodeURIComponent(key)}`
    return url
  } catch {
    return null
  }
}

async function readEdgeConfigItem(key: string) {
  const url = getEdgeConfigItemUrl(key)
  if (!url) return undefined

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 800)

  try {
    const headers: Record<string, string> = {}
    if (process.env.VERCEL_EDGE_CONFIG_READ_TOKEN) {
      headers.Authorization = `Bearer ${process.env.VERCEL_EDGE_CONFIG_READ_TOKEN}`
    }

    const res = await fetch(url, {
      headers,
      signal: controller.signal,
      next: { revalidate: 5 },
    })

    if (!res.ok) return undefined
    return await res.json()
  } catch {
    return undefined
  } finally {
    clearTimeout(timeout)
  }
}

function toBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

function toPositiveInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

export async function getVercelOpsConfig(): Promise<OpsConfig> {
  if (cachedConfig && cachedConfig.expiresAt > Date.now()) return cachedConfig.value

  const [maintenanceMode, checkoutEnabled, ticketResaleEnabled, searchMinQueryLength, publicCacheTtlSeconds] =
    await Promise.all([
      readEdgeConfigItem(KEY_MAP.maintenanceMode),
      readEdgeConfigItem(KEY_MAP.checkoutEnabled),
      readEdgeConfigItem(KEY_MAP.ticketResaleEnabled),
      readEdgeConfigItem(KEY_MAP.searchMinQueryLength),
      readEdgeConfigItem(KEY_MAP.publicCacheTtlSeconds),
    ])

  const value = {
    maintenanceMode: toBoolean(maintenanceMode, DEFAULT_OPS_CONFIG.maintenanceMode),
    checkoutEnabled: toBoolean(checkoutEnabled, DEFAULT_OPS_CONFIG.checkoutEnabled),
    ticketResaleEnabled: toBoolean(ticketResaleEnabled, DEFAULT_OPS_CONFIG.ticketResaleEnabled),
    searchMinQueryLength: toPositiveInteger(searchMinQueryLength, DEFAULT_OPS_CONFIG.searchMinQueryLength, 1, 8),
    publicCacheTtlSeconds: toPositiveInteger(publicCacheTtlSeconds, DEFAULT_OPS_CONFIG.publicCacheTtlSeconds, 5, 300),
  }

  cachedConfig = { value, expiresAt: Date.now() + 5_000 }
  return value
}
