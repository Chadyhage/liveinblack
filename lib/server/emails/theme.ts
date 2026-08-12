// Design tokens des emails LIVEINBLACK — port des mêmes valeurs que
// app/globals.css (:root), pour que les emails reflètent la charte ACTUELLE
// de l'app (fond obsidian quasi-noir, accent vert lime), pas l'ancienne
// palette teal/gold que les emails legacy utilisaient encore.
//
// Toute la charte email vit ICI et nulle part ailleurs — c'est le seul
// fichier à modifier pour changer le design de tous les emails d'un coup.
// Les couleurs sont en hex/rgba (pas de var(--*), les clients email ne
// supportent pas les custom properties CSS).
export const EMAIL_COLORS = {
  obsidian: '#0a0810', // fond de la page email
  surface: '#14101c', // carte principale
  surface2: '#0d0a14', // encarts secondaires (footer, notes)
  primary: '#b8f34a', // accent principal — vert lime
  primaryStrong: '#9fe022', // lime plus soutenu (hover/bordures fortes)
  primaryInk: '#10210a', // texte sur fond lime plein (contraste AA)
  pink: '#ff7b7b', // erreurs, annulations, actions destructives
  text: '#ffffff',
  textMuted: 'rgba(255,255,255,0.76)',
  textFaint: 'rgba(255,255,255,0.56)',
  border: 'rgba(184,243,74,0.18)',
  borderStrong: 'rgba(184,243,74,0.36)',
} as const

// Polices "web-safe" pour email (Anton/Montserrat/Open Sans ne sont pas
// fiables en client mail) — Georgia sert de substitut display/serif au
// display Anton du web, Helvetica au corps de texte Open Sans.
export const EMAIL_FONTS = {
  display: 'Georgia, "Times New Roman", serif',
  body: 'Helvetica, Arial, sans-serif',
  mono: '"Courier New", monospace',
} as const

export const DEFAULT_SITE = 'https://liveinblack.com'
