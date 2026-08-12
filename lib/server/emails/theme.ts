// Design tokens for every LIVEINBLACK transactional email.
//
// The visual language follows Apple's Human Interface Guidelines: neutral
// surfaces, system typography, generous spacing, restrained colour and clear
// semantic states. Values stay in hex because several email clients do not
// reliably support CSS custom properties or modern colour syntaxes.
export const EMAIL_COLORS = {
  page: '#f5f5f7',
  surface: '#ffffff',
  surfaceSecondary: '#f5f5f7',
  surfaceTertiary: '#fbfbfd',
  primary: '#0071e3',
  primaryPressed: '#0077ed',
  primaryTint: '#e8f2ff',
  success: '#248a3d',
  successTint: '#edf8ef',
  danger: '#d70015',
  dangerTint: '#fff0f1',
  warning: '#b25000',
  text: '#1d1d1f',
  textMuted: '#515154',
  textFaint: '#6e6e73',
  border: '#d2d2d7',
  borderSoft: '#e8e8ed',
  white: '#ffffff',
} as const

// Apple's system font stack renders as San Francisco on Apple devices and
// falls back to familiar, email-safe sans-serif faces everywhere else.
export const EMAIL_FONTS = {
  display: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif",
  body: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif",
  mono: "'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
} as const

export const DEFAULT_SITE = 'https://liveinblack.com'
