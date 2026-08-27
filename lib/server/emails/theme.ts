// Tokens statiques du design system email LIVE IN BLACK.
// Les variables CSS de l'application ne sont pas utilisées ici : de nombreux
// clients mail les filtrent. Les couleurs reprennent donc leurs valeurs réelles.
export const EMAIL_COLORS = {
  // Même fond que les modales et menus de l'application (--surface-2).
  background: '#191218',
  surface: '#241a23',
  surface2: '#1d141c',
  surface3: '#2a1f29',

  obsidian: '#191218',
  obsidianRaised: '#241a23',
  primary: '#F53D8D',
  primaryStrong: '#e02d7d',
  primarySoft: '#3a1827',
  primaryText: '#F53D8D',
  primaryInk: '#ffffff',
  pink: '#FF75AD',

  text: '#ffffff',
  textMuted: '#d5d1dc',
  textFaint: '#aaa4b4',
  border: '#3c2838',
  borderStrong: '#5c3d56',

  success: '#84dc8e',
  successSoft: '#14271a',
  warning: '#ffc66d',
  warningSoft: '#2a2113',
  danger: '#ff7b7b',
  dangerSoft: '#2c171b',

  ink: '#191218',
  mint: '#1d141c',
  mintStrong: '#3a1827',
} as const

export const EMAIL_FONTS = {
  // Guillemets simples obligatoires : ces valeurs sont injectées dans des
  // attributs HTML délimités par des guillemets doubles.
  display: "Impact, Haettenschweiler, 'Arial Narrow Bold', 'Arial Narrow', Arial, sans-serif",
  body: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  mono: 'SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
} as const

export const DEFAULT_SITE = 'https://liveinblack.com'
