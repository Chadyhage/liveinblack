// Tokens statiques du design system email LIVE IN BLACK.
// Les variables CSS de l'application ne sont pas utilisées ici : de nombreux
// clients mail les filtrent. Les couleurs reprennent donc leurs valeurs réelles.
export const EMAIL_COLORS = {
  // Même fond que les modales et menus de l'application (--surface-2).
  background: '#181714',
  surface: '#242018',
  surface2: '#1d1a14',
  surface3: '#2a1f29',

  obsidian: '#181714',
  obsidianRaised: '#242018',
  primary: '#c8a96e',
  primaryStrong: '#e2c37e',
  primarySoft: '#3a301f',
  primaryText: '#c8a96e',
  primaryInk: '#ffffff',
  pink: '#e8d49e',

  text: '#ffffff',
  textMuted: '#d5d1dc',
  textFaint: '#aaa4b4',
  border: '#3c3426',
  borderStrong: '#5c4d32',

  success: '#e8d49e',
  successSoft: '#2a2418',
  warning: '#ffc66d',
  warningSoft: '#2a2113',
  danger: '#ff7b7b',
  dangerSoft: '#2c171b',

  ink: '#181714',
  mint: '#1d1a14',
  mintStrong: '#3a301f',
} as const

export const EMAIL_FONTS = {
  // Guillemets simples obligatoires : ces valeurs sont injectées dans des
  // attributs HTML délimités par des guillemets doubles.
  display: "Impact, Haettenschweiler, 'Arial Narrow Bold', 'Arial Narrow', Arial, sans-serif",
  body: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  mono: 'SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
} as const

export const DEFAULT_SITE = 'https://liveinblack.com'
