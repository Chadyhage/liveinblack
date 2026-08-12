// Shared, email-client-safe UI primitives. Layout remains table based and all
// critical styling is inline for Gmail, Outlook and Apple Mail compatibility.
import { EMAIL_COLORS as C, EMAIL_FONTS as F, DEFAULT_SITE } from './theme'

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function safeHref(href: string): string {
  return escapeHtml(href)
}

export function heading(title: string, tone: 'default' | 'accent' | 'danger' = 'default'): string {
  const color = tone === 'accent' ? C.success : tone === 'danger' ? C.danger : C.text
  return `<h1 class="email-heading" style="font-family:${F.display};font-weight:700;font-size:32px;letter-spacing:-0.025em;color:${color};margin:0 0 18px;line-height:1.12;">${escapeHtml(title)}</h1>`
}

export function paragraph(html: string): string {
  return `<p class="email-paragraph" style="font-family:${F.body};font-size:17px;color:${C.textMuted};letter-spacing:-0.01em;line-height:1.55;margin:0 0 16px;">${html}</p>`
}

export function note(html: string): string {
  return `<p class="email-note" style="font-family:${F.body};font-size:13px;color:${C.textFaint};line-height:1.5;margin:12px 0 0;">${html}</p>`
}

export function emphasis(html: string): string {
  return `<strong style="color:${C.text};font-weight:600;">${html}</strong>`
}

export function accentText(html: string): string {
  return `<strong style="color:${C.primary};font-weight:600;">${html}</strong>`
}

export function subtleText(html: string): string {
  return `<span style="color:${C.textFaint};">${html}</span>`
}

export function struckText(html: string): string {
  return `<span style="color:${C.textFaint};text-decoration:line-through;">${html}</span>`
}

export function inlineLink(href: string, label: string): string {
  return `<a href="${safeHref(href)}" style="color:${C.primary};font-weight:500;text-decoration:none;">${label}</a>`
}

export function quote(html: string): string {
  return `<span style="display:block;margin-top:10px;padding:14px 16px;background:${C.surfaceSecondary};border-radius:12px;color:${C.textMuted};font-style:italic;">“${html}”</span>`
}

export type ButtonTone = 'primary' | 'outline' | 'danger'

export function button(href: string, label: string, tone: ButtonTone = 'primary'): string {
  const styles: Record<ButtonTone, { bg: string; border: string; color: string }> = {
    primary: { bg: C.primary, border: C.primary, color: C.white },
    outline: { bg: C.surface, border: C.border, color: C.primary },
    danger: { bg: C.danger, border: C.danger, color: C.white },
  }
  const style = styles[tone]
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 8px;"><tr><td style="border-radius:980px;background:${style.bg};border:1px solid ${style.border};">
    <a href="${safeHref(href)}" style="display:inline-block;min-width:152px;padding:13px 24px;font-family:${F.body};font-size:15px;font-weight:600;line-height:18px;text-align:center;color:${style.color};text-decoration:none;">${escapeHtml(label)}</a>
  </td></tr></table>`
}

export function badge(label: string, tone: 'default' | 'accent' | 'danger' = 'default'): string {
  const style = tone === 'accent'
    ? { bg: C.successTint, color: C.success }
    : tone === 'danger'
      ? { bg: C.dangerTint, color: C.danger }
      : { bg: C.surfaceSecondary, color: C.textMuted }
  return `<span style="display:inline-block;padding:5px 10px;border-radius:980px;background:${style.bg};font-family:${F.body};font-size:12px;font-weight:600;color:${style.color};letter-spacing:0.01em;">${escapeHtml(label)}</span>`
}

export function infoRow(label: string, value: string): string {
  return `<tr>
    <td class="info-label" style="padding:11px 12px 11px 0;border-bottom:1px solid ${C.borderSoft};font-family:${F.body};font-size:14px;color:${C.textFaint};width:38%;vertical-align:top;">${escapeHtml(label)}</td>
    <td class="info-value" style="padding:11px 0;border-bottom:1px solid ${C.borderSoft};font-family:${F.body};font-size:14px;color:${C.text};font-weight:600;text-align:right;vertical-align:top;">${value}</td>
  </tr>`
}

export function infoCard(rows: string): string {
  return `<table class="info-card" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0;background:${C.surfaceSecondary};border-radius:16px;padding:8px 18px;">${rows}</table>`
}

export function divider(): string {
  return `<div style="height:1px;background:${C.borderSoft};margin:24px 0;"></div>`
}

export function wrap(innerHtml: string, opts: { site?: string; preheader?: string } = {}): string {
  const site = opts.site || DEFAULT_SITE
  const preheader = opts.preheader
    ? `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(opts.preheader)}&#847;&zwnj;&nbsp;</div>`
    : ''

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
    <title>LIVEINBLACK</title>
    <style>
      html, body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
      table { border-collapse: separate; }
      a { color: ${C.primary}; }
      .info-card tr:last-child td { border-bottom: 0 !important; }
      @media only screen and (max-width: 620px) {
        .email-shell { width: 100% !important; }
        .email-gutter { padding-left: 16px !important; padding-right: 16px !important; }
        .email-card { padding: 32px 24px !important; border-radius: 20px !important; }
        .email-heading { font-size: 29px !important; }
        .email-paragraph { font-size: 16px !important; }
      }
    </style>
  </head>
  <body style="margin:0;background:${C.page};padding:0;font-family:${F.body};-webkit-font-smoothing:antialiased;word-spacing:normal;">
    ${preheader}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:${C.page};">
      <tr><td class="email-gutter" align="center" style="padding:42px 20px;">
        <table class="email-shell" role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
          <tr><td style="padding:0 4px 22px;text-align:left;">
            <a href="${safeHref(site)}" aria-label="LIVEINBLACK" style="display:inline-block;font-family:${F.display};font-size:18px;font-weight:700;letter-spacing:-0.025em;color:${C.text};text-decoration:none;">LIVEINBLACK<span style="color:${C.primary};">●</span></a>
          </td></tr>
          <tr><td class="email-card" style="background:${C.surface};border:1px solid ${C.borderSoft};border-radius:24px;padding:48px 44px;box-shadow:0 10px 40px rgba(0,0,0,0.06);">
            ${innerHtml}
          </td></tr>
          <tr><td style="padding:24px 16px 0;text-align:left;">
            <p style="font-family:${F.body};font-size:12px;color:${C.textFaint};line-height:1.5;margin:0;">
              LIVEINBLACK · La marketplace de l’événementiel<br>
              Cet e-mail fait suite à ton activité sur ${inlineLink(site, 'liveinblack.com')}.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
}
