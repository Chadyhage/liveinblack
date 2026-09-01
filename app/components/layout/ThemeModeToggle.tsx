'use client'

import { Moon, Sun } from 'lucide-react'
import { useEffect, useSyncExternalStore } from 'react'

type ThemeMode = 'light' | 'dark'

const THEME_KEY = 'lib_theme'
const listeners = new Set<() => void>()

function systemMode(): ThemeMode {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function applyTheme(mode: ThemeMode) {
  document.documentElement.dataset.theme = mode
  document.documentElement.style.colorScheme = mode
}

function readMode(): ThemeMode {
  if (typeof window === 'undefined') return 'dark'
  const stored = window.localStorage.getItem(THEME_KEY)
  return stored === 'light' || stored === 'dark' ? stored : systemMode()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (typeof window === 'undefined') return () => listeners.delete(listener)

  const media = window.matchMedia('(prefers-color-scheme: light)')
  const onChange = () => {
    if (!window.localStorage.getItem(THEME_KEY)) {
      applyTheme(systemMode())
      listeners.forEach((item) => item())
    }
  }
  media.addEventListener('change', onChange)
  return () => {
    listeners.delete(listener)
    media.removeEventListener('change', onChange)
  }
}

function setStoredMode(mode: ThemeMode) {
  window.localStorage.setItem(THEME_KEY, mode)
  applyTheme(mode)
  listeners.forEach((listener) => listener())
}

export default function ThemeModeToggle() {
  const mode = useSyncExternalStore<ThemeMode>(subscribe, readMode, () => 'dark')

  useEffect(() => {
    applyTheme(mode)
  }, [mode])

  function toggle() {
    const next = mode === 'light' ? 'dark' : 'light'
    setStoredMode(next)
  }

  const light = mode === 'light'

  return (
    <button
      type="button"
      className="lb-theme-toggle"
      aria-label={light ? 'Passer en mode sombre' : 'Passer en mode clair'}
      aria-pressed={light}
      suppressHydrationWarning
      title={light ? 'Mode clair' : 'Mode sombre'}
      onClick={toggle}
    >
      {light ? <Sun size={17} strokeWidth={2.3} aria-hidden="true" /> : <Moon size={17} strokeWidth={2.3} aria-hidden="true" />}
    </button>
  )
}
