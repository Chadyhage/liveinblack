// Primitives HTML partagées par tous les emails LIVE IN BLACK.
// Tables de présentation + styles inline : rendu stable dans Gmail, Outlook
// et Apple Mail, sans dépendre de CSS externe, de SVG inline ni de JavaScript.
import { EMAIL_COLORS as C, EMAIL_FONTS as F, DEFAULT_SITE } from './theme'

export type EmailCategory =
  | 'account'
  | 'security'
  | 'application'
  | 'provider'
  | 'support'
  | 'ticket'
  | 'payment'
  | 'refund'
  | 'resale'
  | 'event'
  | 'payout'
  | 'staff'
  | 'review'
  | 'moderation'
  | 'agent'
  | 'messaging'
  | 'interest'

type CategoryVisual = { label: string }

const CATEGORY_VISUALS: Record<EmailCategory, CategoryVisual> = {
  account: { label: 'Ton compte' },
  security: { label: 'Sécurité du compte' },
  application: { label: 'Candidature' },
  provider: { label: 'Espace prestataire' },
  support: { label: 'Aide & contact' },
  ticket: { label: 'Billets' },
  payment: { label: 'Paiement' },
  refund: { label: 'Remboursement' },
  resale: { label: 'Revente officielle' },
  event: { label: 'Événements' },
  payout: { label: 'Versements' },
  staff: { label: 'Équipe événement' },
  review: { label: 'Avis' },
  moderation: { label: 'Modération' },
  agent: { label: 'Espace agent' },
  messaging: { label: 'Messagerie' },
  interest: { label: 'À ne pas manquer' },
}

function assetUrl(site: string, path: string): string {
  return `${site.replace(/\/$/, '')}${path}`
}

function iconUrl(site: string, name: string): string {
  return assetUrl(site, `/images/email-icons/${name}.png`)
}

function brandAssetUrl(site: string, name: string): string {
  return assetUrl(site, `/branding/${name}`)
}

function brandHeader(site: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="padding:28px 28px 22px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td valign="middle"><a href="${site}" aria-label="LIVE IN BLACK" style="display:inline-block;text-decoration:none;"><img src="${brandAssetUrl(site, 'liveinblack-logo-horizontal.png')}" width="190" height="31" alt="LIVE IN BLACK" style="display:block;width:190px;max-width:100%;height:auto;border:0;"/></a></td>
      <td align="right" valign="middle" style="font-family:${F.body};font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${C.textFaint};">Notification</td>
    </tr></table></td></tr>
  </table>`
}

function categoryHeader(site: string, category: EmailCategory): string {
  const visual = CATEGORY_VISUALS[category]
  return `<p style="margin:0 0 20px;font-family:${F.body};font-size:12px;font-weight:800;line-height:1.2;letter-spacing:.09em;text-transform:uppercase;color:${C.primary};">${visual.label}</p>`
}

function footerLink(site: string, href: string, icon: string, label: string): string {
  return `<a href="${site}${href}" style="display:inline-block;font-family:${F.body};font-size:12px;font-weight:700;color:${C.textMuted};text-decoration:none;white-space:nowrap;"><img src="${iconUrl(site, icon)}" width="15" height="15" alt="" style="display:inline-block;width:15px;height:15px;border:0;vertical-align:-3px;margin-right:6px;"/>${label}</a>`
}

function richFooter(site: string): string {
  const legalStyle = `font-family:${F.body};font-size:11px;color:${C.textFaint};text-decoration:underline;`
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="padding:24px 28px 12px;border-top:1px solid ${C.border};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td align="left" style="padding:0 4px 10px 0;">${footerLink(site, '/events', 'calendar-days', 'Événements')}</td>
      <td align="center" style="padding:0 4px 10px;">${footerLink(site, '/providers', 'briefcase-business', 'Prestataires')}</td>
      <td align="right" style="padding:0 0 10px 4px;">${footerLink(site, '/blog', 'newspaper', 'Le blog')}</td>
    </tr></table></td></tr>
    <tr><td align="center" style="padding:2px 24px 12px;"><a href="${site}/privacy" style="${legalStyle}">Confidentialité</a><span style="color:${C.borderStrong};padding:0 8px;">·</span><a href="${site}/terms" style="${legalStyle}">Conditions</a><span style="color:${C.borderStrong};padding:0 8px;">·</span><a href="${site}/contact" style="${legalStyle}">Aide</a></td></tr>
    <tr><td align="center" style="padding:0 28px 30px;font-family:${F.body};font-size:11px;color:${C.textFaint};line-height:1.6;">Cet e-mail fait suite à ton activité sur LIVE IN BLACK.<br/>© ${new Date().getFullYear()} LIVE IN BLACK · La culture plus proche.</td></tr>
  </table>`
}

export function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function heading(title: string, tone: 'default' | 'accent' | 'danger' = 'default'): string {
  const color = tone === 'danger' ? C.danger : tone === 'accent' ? C.primary : C.text
  return `<h1 style="font-family:${F.display};font-weight:700;font-size:36px;line-height:1.05;letter-spacing:.012em;text-transform:uppercase;color:${color};margin:0 0 18px;text-align:left;">${title}</h1>`
}

export function paragraph(html: string): string {
  return `<p style="font-family:${F.body};font-size:15px;color:${C.textMuted};line-height:1.65;margin:0 0 14px;text-align:left;">${html}</p>`
}

export function note(html: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;background:${C.surface2};border:1px solid ${C.border};border-radius:10px;"><tr><td style="padding:15px 16px;"><p style="font-family:${F.body};font-size:13px;color:${C.textMuted};line-height:1.55;margin:0;text-align:left;">${html}</p></td></tr></table>`
}

export type ButtonTone = 'primary' | 'outline' | 'danger'

export function button(href: string, label: string, tone: ButtonTone = 'primary'): string {
  const styles: Record<ButtonTone, { bg: string; border: string; color: string }> = {
    primary: { bg: C.primary, border: C.primaryStrong, color: C.primaryInk },
    outline: { bg: C.surface2, border: C.borderStrong, color: C.text },
    danger: { bg: C.danger, border: C.danger, color: C.obsidian },
  }
  const s = styles[tone]
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 8px;"><tr><td style="border-radius:11px;background:${s.bg};border:1px solid ${s.border};"><a href="${href}" style="display:inline-block;padding:14px 20px;font-family:${F.body};font-size:14px;font-weight:800;line-height:1.2;text-decoration:none;color:${s.color};">${label}&nbsp;&nbsp;→</a></td></tr></table>`
}

export function badge(label: string, tone: 'default' | 'accent' | 'danger' = 'default'): string {
  const color = tone === 'accent' ? C.success : tone === 'danger' ? C.danger : C.textMuted
  const bg = tone === 'accent' ? C.successSoft : tone === 'danger' ? C.dangerSoft : C.surface2
  const icon = tone === 'accent' ? '✓' : tone === 'danger' ? '!' : '•'
  return `<span style="display:inline-block;padding:6px 10px;border-radius:999px;background:${bg};border:1px solid ${color};font-family:${F.body};font-size:11px;font-weight:800;color:${color};text-transform:uppercase;letter-spacing:.04em;">${icon}&nbsp; ${label}</span>`
}

export function infoRow(label: string, value: string): string {
  return `<tr><td style="padding:11px 8px 11px 0;border-bottom:1px solid ${C.border};font-family:${F.body};font-size:12px;color:${C.textFaint};width:36%;vertical-align:top;">${label}</td><td style="padding:11px 0 11px 8px;border-bottom:1px solid ${C.border};font-family:${F.body};font-size:14px;color:${C.text};font-weight:700;vertical-align:top;">${value}</td></tr>`
}

export function infoCard(rows: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0;background:${C.surface2};border:1px solid ${C.border};border-radius:12px;"><tr><td style="padding:8px 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr></table>`
}

export function divider(): string {
  return `<div style="height:1px;background:${C.border};margin:22px 0;"></div>`
}

type WrapOptions = { site?: string; preheader?: string; category?: EmailCategory }

export function scopedWrap(category: EmailCategory) {
  return (innerHtml: string, opts: Omit<WrapOptions, 'category'> = {}) => wrap(innerHtml, { ...opts, category })
}

export function wrap(innerHtml: string, opts: WrapOptions = {}): string {
  const site = opts.site || DEFAULT_SITE
  const category = opts.category || 'account'
  const preheader = opts.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(opts.preheader)}&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌</div>` : ''
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="color-scheme" content="dark"/><meta name="supported-color-schemes" content="dark"/></head><body style="margin:0;background:${C.background};padding:0;font-family:${F.body};-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;">${preheader}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.background};"><tr><td align="center" style="padding:12px 12px 36px;"><table role="presentation" width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;background:${C.background};"><tr><td>${brandHeader(site)}</td></tr><tr><td style="padding:0 16px 26px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.surface};border:1px solid ${C.border};border-radius:18px;"><tr><td style="padding:30px 28px 32px;">${categoryHeader(site, category)}${innerHtml}</td></tr></table></td></tr><tr><td>${richFooter(site)}</td></tr></table></td></tr></table></body></html>`
}
