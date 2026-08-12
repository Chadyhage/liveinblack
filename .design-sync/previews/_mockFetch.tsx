// Shared fetch mock for previews of components that fetch on mount (not
// just on interaction) — ResaleListingsSection, VerifyEmailClient,
// ConfirmEmailChangeClient, BoostActiveClient. Leading underscore: never
// treated as its own component card, just an imported helper (same
// convention as _stage.tsx).
//
// Patches window.fetch at MODULE EVALUATION time (top-level, outside any
// component) so it's in place before the target component's own
// useEffect fires on mount — React runs effects after the initial commit,
// so a synchronous patch during story-module evaluation always wins the
// race. Never restored: each preview's compiled bundle is a fresh page
// load in the capture harness, so there's no "next test" to leak into.
//
// `rules` matches in order by a substring/prefix test against the request
// URL — first match wins. Falls through to the real fetch for anything
// unmatched (network access is unavailable in the capture harness anyway,
// so an unmatched call will simply fail like any other unmocked network
// request would).
type MockRule = { test: string; status?: number; body: unknown }

export function installMockFetch(rules: MockRule[]) {
  if (typeof window === 'undefined') return
  const real = window.fetch.bind(window)
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
    const rule = rules.find((r) => url.includes(r.test))
    if (!rule) return real(input, init)
    return new Response(JSON.stringify(rule.body), {
      status: rule.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof window.fetch
}
