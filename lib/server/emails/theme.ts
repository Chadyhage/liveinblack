// Design tokens email LIVEINBLACK.
//
// Les emails restent en thème clair pour garantir une lecture stable dans
// Gmail, Outlook et Apple Mail. La marque, elle, conserve exactement ses
// couleurs produit : obsidienne, blanc et vert lime. Les valeurs sont
// volontairement statiques (pas de variables CSS, peu fiables en email).
export const EMAIL_COLORS = {
  // Structure claire, proche des surfaces groupées Apple.
  background: '#f5f5f7',
  surface: '#ffffff',
  surface2: '#f2f2f7',
  surface3: '#e8e8ed',

  // Palette officielle de l'application.
  obsidian: '#0a0810',
  obsidianRaised: '#14101c',
  primary: '#b8f34a',
  primaryStrong: '#9fe022',
  primarySoft: '#f1ffda',
  primaryText: '#4b6f00',
  primaryInk: '#10210a',
  pink: '#ff7b7b',

  // Texte et séparateurs à contraste élevé sur fond clair.
  text: '#161617',
  textMuted: '#5f6368',
  textFaint: '#6f737b',
  border: '#dedee3',
  borderStrong: '#c8c8ce',

  // États accessibles : l'icône et le libellé complètent toujours la couleur.
  success: '#207d37',
  successSoft: '#edf8ef',
  warning: '#a15c00',
  warningSoft: '#fff6e5',
  danger: '#c9342c',
  dangerSoft: '#fff0ef',

  // Alias sémantiques conservés pour les templates existants.
  ink: '#0a0810',
  mint: '#f5f5f7',
  mintStrong: '#f1ffda',
} as const

// Pile système inspirée de SF Pro. Les clients non Apple retombent sur leur
// meilleure police d'interface locale sans téléchargement externe.
export const EMAIL_FONTS = {
  display: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Helvetica, Arial, sans-serif',
  body: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Helvetica, Arial, sans-serif',
  mono: 'SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
} as const

export const DEFAULT_SITE = 'https://liveinblack.com'
