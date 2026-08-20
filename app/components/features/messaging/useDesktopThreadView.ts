'use client'

import { useSyncExternalStore } from 'react'

export const DESKTOP_THREAD_VIEW_QUERY = '(min-width: 768px)'

export function subscribeToDesktopThreadView(callback: () => void): () => void {
  const mediaQuery = window.matchMedia(DESKTOP_THREAD_VIEW_QUERY)
  mediaQuery.addEventListener('change', callback)
  return () => mediaQuery.removeEventListener('change', callback)
}

export function getDesktopThreadViewSnapshot(): boolean {
  return window.matchMedia(DESKTOP_THREAD_VIEW_QUERY).matches
}

export function getDesktopThreadViewServerSnapshot(): boolean {
  return false
}

export function useDesktopThreadView(): boolean {
  return useSyncExternalStore(
    subscribeToDesktopThreadView,
    getDesktopThreadViewSnapshot,
    getDesktopThreadViewServerSnapshot
  )
}
