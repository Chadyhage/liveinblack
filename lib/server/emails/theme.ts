// Tokens statiques du design system email LIVE IN BLACK.
// Les variables CSS de l'application ne sont pas utilisées ici : de nombreux
// clients mail les filtrent. Les couleurs reprennent donc leurs valeurs réelles.
export const EMAIL_COLORS = {
  // Même fond que les modales et menus de l'application (--surface-2).
  background: '#0d0a14',
  surface: '#14101c',
  surface2: '#0d0a14',
  surface3: '#211a2d',

  obsidian: '#0a0810',
  obsidianRaised: '#14101c',
  primary: '#b8f34a',
  primaryStrong: '#9fe022',
  primarySoft: '#1b2513',
  primaryText: '#b8f34a',
  primaryInk: '#10210a',
  pink: '#ff7b7b',

  text: '#ffffff',
  textMuted: '#d5d1dc',
  textFaint: '#aaa4b4',
  border: '#30283d',
  borderStrong: '#4a3d5c',

  success: '#84dc8e',
  successSoft: '#14271a',
  warning: '#ffc66d',
  warningSoft: '#2a2113',
  danger: '#ff7b7b',
  dangerSoft: '#2c171b',

  ink: '#0a0810',
  mint: '#0d0a14',
  mintStrong: '#1b2513',
} as const

export const EMAIL_FONTS = {
  // Guillemets simples obligatoires : ces valeurs sont injectées dans des
  // attributs HTML délimités par des guillemets doubles.
  display: "Impact, Haettenschweiler, 'Arial Narrow Bold', 'Arial Narrow', Arial, sans-serif",
  body: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  mono: 'SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
} as const

export const DEFAULT_SITE = 'https://liveinblack.com'
