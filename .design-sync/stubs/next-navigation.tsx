// Stub for `next/navigation` in design-sync preview builds — same rationale
// as next-link.tsx. Only `useRouter` is used by our components
// (SlideOverModal), so it's the only export stubbed; add more here if a
// future component needs `usePathname`/`useSearchParams`.
export function useRouter() {
  return {
    push: () => {},
    replace: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
    prefetch: () => {},
  }
}
export function usePathname() {
  return ''
}
export function useSearchParams() {
  return new URLSearchParams()
}
