// Système de composants email LIVEINBLACK — les "briques" HTML partagées par
// TOUS les templates du dossier ../templates/*.ts. C'est le pendant email de
// app/components/ui/ côté web : changer le design d'un coup de tous les
// emails passe par CE fichier (+ theme.ts pour les couleurs/polices), jamais
// par les templates individuels qui ne font qu'assembler ces briques.
//
// Contraintes propres au HTML email (Outlook/Gmail/Apple Mail...) : tout en
// tables, styles inline uniquement, pas de flexbox/grid, pas de custom
// properties CSS — d'où la duplication de style inline qu'on ne ferait pas
// côté web.
import { EMAIL_COLORS as C, EMAIL_FONTS as F, DEFAULT_SITE } from './theme'

export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Titre principal d'un email (H1 visuel). `tone` pilote la couleur pour les
// contextes positifs/négatifs/neutres sans que chaque template ne resaisisse
// un code couleur.
export function heading(title: string, tone: 'default' | 'accent' | 'danger' = 'default'): string {
  const color = tone === 'accent' ? C.primary : tone === 'danger' ? C.pink : C.text
  return `<h1 style="font-family:${F.display};font-weight:normal;font-size:26px;color:${color};margin:0 0 16px;line-height:1.25;">${title}</h1>`
}

export function paragraph(html: string): string {
  return `<p style="font-family:${F.body};font-size:14px;color:${C.textMuted};line-height:1.7;margin:0 0 14px;">${html}</p>`
}

// Petite note en pied de bloc (mentions légales, "si tu n'es pas à l'origine
// de cette action...", désabonnement) — toujours plus discrète qu'un
// paragraphe normal.
export function note(html: string): string {
  return `<p style="font-family:${F.body};font-size:12px;color:${C.textFaint};line-height:1.6;margin:0 0 4px;">${html}</p>`
}

export type ButtonTone = 'primary' | 'outline' | 'danger'

// CTA principal. `primary` = pastille lime pleine (action qu'on veut pousser,
// ex. "Voir mon billet"). `outline` = contour lime (action secondaire).
// `danger` = contour rose (action liée à un problème, ex. "Réessayer le
// paiement").
export function button(href: string, label: string, tone: ButtonTone = 'primary'): string {
  const styles: Record<ButtonTone, { bg: string; border: string; color: string }> = {
    primary: { bg: C.primary, border: C.primary, color: C.primaryInk },
    outline: { bg: 'rgba(184,243,74,0.10)', border: C.primary, color: C.primary },
    danger: { bg: 'rgba(255,123,123,0.10)', border: C.pink, color: C.pink },
  }
  const s = styles[tone]
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 6px;"><tr><td style="border-radius:8px;background:${s.bg};border:1px solid ${s.border};">
    <a href="${href}" style="display:inline-block;padding:13px 30px;font-family:${F.mono};font-size:12px;font-weight:bold;letter-spacing:0.12em;text-transform:uppercase;color:${s.color};text-decoration:none;">${label}</a>
  </td></tr></table>`
}

// Petit badge/pilule inline (ex. "ANNULÉ", "EN ATTENTE") — équivalent email
// du composant StatusBadge web/mobile.
export function badge(label: string, tone: 'default' | 'accent' | 'danger' = 'default'): string {
  const color = tone === 'accent' ? C.primary : tone === 'danger' ? C.pink : C.textMuted
  return `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${color}22;border:1px solid ${color}66;font-family:${F.body};font-size:11px;font-weight:bold;color:${color};text-transform:uppercase;letter-spacing:0.04em;">${label}</span>`
}

// Ligne "Label : valeur" — pour les récaps (date, lieu, montant...).
export function infoRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:7px 0;font-family:${F.body};font-size:13px;color:${C.textFaint};width:38%;vertical-align:top;">${label}</td>
    <td style="padding:7px 0;font-family:${F.body};font-size:13px;color:${C.text};font-weight:bold;vertical-align:top;">${value}</td>
  </tr>`
}

// Bloc récap (table de infoRow) dans un encart légèrement détaché du fond.
export function infoCard(rows: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background:${C.surface2};border:1px solid ${C.border};border-radius:10px;padding:14px 16px;">${rows}</table>`
}

export function divider(): string {
  return `<div style="height:1px;background:${C.border};margin:20px 0;"></div>`
}

// Enveloppe commune à TOUS les emails — logo + carte principale + footer
// légal. `preheader` = texte caché affiché en aperçu par le client mail
// (Gmail/Outlook), utile pour donner du contexte avant l'ouverture.
export function wrap(innerHtml: string, opts: { site?: string; preheader?: string } = {}): string {
  const site = opts.site || DEFAULT_SITE
  const preheader = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(opts.preheader)}</div>`
    : ''
  return `<!doctype html><html><body style="margin:0;background:${C.obsidian};padding:32px 0;font-family:${F.body};">
    ${preheader}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
        <tr><td style="padding:0 8px 24px;text-align:center;">
          <span style="font-family:${F.display};font-size:20px;letter-spacing:0.14em;color:${C.text};">L<span style="color:${C.primary};">|</span>VE IN <span style="font-style:italic;">BLACK</span></span>
        </td></tr>
        <tr><td style="background:${C.surface};border:1px solid ${C.border};border-radius:16px;padding:32px 28px;">
          ${innerHtml}
        </td></tr>
        <tr><td style="padding:20px 8px 0;text-align:center;">
          <p style="font-family:${F.mono};font-size:10px;color:rgba(255,255,255,0.30);letter-spacing:0.06em;line-height:1.7;margin:0;">
            LIVEINBLACK — Marketplace événementielle<br/>
            Cet email t'a été envoyé suite à ton activité sur <a href="${site}" style="color:${C.primary};text-decoration:none;">liveinblack.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr></table>
  </body></html>`
}
