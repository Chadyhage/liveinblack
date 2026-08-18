// Composants HTML partagés par tous les emails LIVEINBLACK.
//
// Contrainte email : tables de présentation et styles inline afin de rester
// lisible dans Apple Mail, Gmail et Outlook. La structure reprend les
// principes Apple HIG utiles à l'email : hiérarchie immédiate, lecture dans
// l'ordre naturel, surfaces groupées, contraste fort et une action principale.
import { EMAIL_COLORS as C, EMAIL_FONTS as F, DEFAULT_SITE } from './theme'

type EmailVisual = {
  image: string
  alt: string
  label: string
  title: string
  mark: string
  kind: 'photo' | 'mascot'
  tone: 'default' | 'success' | 'danger' | 'warning'
}

function assetUrl(site: string, path: string): string {
  return `${site.replace(/\/$/, '')}${path}`
}

function pickVisual(innerHtml: string): EmailVisual {
  const text = innerHtml.toLowerCase()

  if (text.includes('mot de passe') || text.includes('connexion') || text.includes('adresse email') || text.includes('adresse e-mail')) {
    return {
      image: '/images/live-in-black/auth-community.jpg',
      alt: 'La communauté LIVEINBLACK',
      label: 'Sécurité du compte',
      title: 'Ton compte.\nSous contrôle.',
      mark: '••••',
      kind: 'photo',
      tone: 'default',
    }
  }
  if (text.includes('message') || text.includes('groupe')) {
    return {
      image: '/images/mascot/mascot-message.png',
      alt: 'La mascotte LIVEINBLACK avec un message',
      label: 'Messagerie',
      title: 'Une conversation\nt’attend.',
      mark: '↗',
      kind: 'mascot',
      tone: 'default',
    }
  }
  if (text.includes('refus') || text.includes('annul') || text.includes('problème') || text.includes('signalement') || text.includes('bloqué') || text.includes('échoué') || text.includes('n’a pas abouti')) {
    return {
      image: '/images/mascot/mascot-error.png',
      alt: 'La mascotte LIVEINBLACK signale un problème',
      label: 'Action requise',
      title: 'On t’aide à\nrégler ça.',
      mark: '!',
      kind: 'mascot',
      tone: 'danger',
    }
  }
  if (text.includes('attente') || text.includes('expire') || text.includes('traiter') || text.includes('correction') || text.includes('bientôt')) {
    return {
      image: '/images/mascot/mascot-waiting.png',
      alt: 'La mascotte LIVEINBLACK en attente',
      label: 'Suivi en cours',
      title: 'On te tient\nau courant.',
      mark: '…',
      kind: 'mascot',
      tone: 'warning',
    }
  }
  if (text.includes('billet') || text.includes('événement') || text.includes('vente') || text.includes('boost') || text.includes('réservation')) {
    return {
      image: '/images/live-in-black/hero-nightlife.jpg',
      alt: 'Une soirée LIVEINBLACK',
      label: 'Événements',
      title: 'Ta prochaine sortie\ncommence ici.',
      mark: '◆',
      kind: 'photo',
      tone: 'default',
    }
  }
  if (text.includes('approuvé') || text.includes('confirm') || text.includes('effectué') || text.includes('prêt') || text.includes('activé') || text.includes('succès')) {
    return {
      image: '/images/mascot/mascot-success.png',
      alt: 'La mascotte LIVEINBLACK célèbre une confirmation',
      label: 'Confirmation',
      title: 'C’est confirmé.\nProfite du moment.',
      mark: '✓',
      kind: 'mascot',
      tone: 'success',
    }
  }
  if (text.includes('candidature') || text.includes('prestataire') || text.includes('organisateur')) {
    return {
      image: '/images/live-in-black/auth-organizer.jpg',
      alt: 'Un organisateur prépare une expérience LIVEINBLACK',
      label: 'Communauté pro',
      title: 'Construisons la scène\nensemble.',
      mark: 'LB',
      kind: 'photo',
      tone: 'default',
    }
  }
  return {
    image: '/images/live-in-black/journey-discover.jpg',
    alt: 'Découvrir les expériences LIVEINBLACK',
    label: 'LIVEINBLACK',
    title: 'La scène\ncommence ici.',
    mark: 'LB',
    kind: 'photo',
    tone: 'default',
  }
}

function brandHeader(site: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="padding:32px 34px 22px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td valign="middle">
              <a href="${site}" style="font-family:${F.display};font-size:29px;font-weight:850;letter-spacing:-0.035em;color:${C.text};text-decoration:none;">LIVE<span style="color:${C.primaryText};">IN</span>BLACK</a>
            </td>
            <td align="right" valign="middle">
              <span style="display:inline-block;padding:7px 11px;border-radius:999px;background:rgba(255,255,255,.74);border:1px solid rgba(10,8,16,.08);font-family:${F.body};font-size:11px;font-weight:700;color:${C.textMuted};">Notification</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`
}

function visualHero(site: string, visual: EmailVisual): string {
  const toneBg = visual.tone === 'danger'
    ? C.danger
    : visual.tone === 'warning'
      ? C.warning
      : visual.tone === 'success'
        ? C.success
        : C.primary
  const imageFit = visual.kind === 'mascot' ? 'contain' : 'cover'
  const imagePosition = visual.kind === 'mascot' ? 'center bottom' : 'center'
  const imageWidth = visual.kind === 'mascot' ? '190' : '552'
  const imageHeight = visual.kind === 'mascot' ? '190' : '214'
  const imageRadius = visual.kind === 'mascot' ? '0' : '20px'
  const imageBackground = visual.kind === 'mascot' ? 'transparent' : C.surface

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 26px;">
    <tr>
      <td align="center" style="padding:2px 34px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 14px;">
          <tr>
            <td style="min-width:32px;height:30px;line-height:30px;padding:0 6px;border-radius:9px;background:${toneBg};color:${visual.tone === 'default' ? C.primaryInk : '#ffffff'};font-family:${F.display};font-size:13px;font-weight:800;text-align:center;">${visual.mark}</td>
            <td style="padding-left:9px;font-family:${F.body};font-size:12px;font-weight:750;letter-spacing:.045em;text-transform:uppercase;color:${C.textMuted};">${visual.label}</td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${imageBackground};border-radius:22px;overflow:hidden;">
          <tr>
            <td align="center" valign="middle" style="height:${imageHeight}px;padding:${visual.kind === 'mascot' ? '2px 0' : '0'};">
              <img src="${assetUrl(site, visual.image)}" width="${imageWidth}" height="${imageHeight}" alt="${visual.alt}" style="display:block;width:${visual.kind === 'mascot' ? '190px' : '100%'};max-width:${imageWidth}px;height:${imageHeight}px;object-fit:${imageFit};object-position:${imagePosition};border:0;border-radius:${imageRadius};"/>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`
}

function richFooter(site: string): string {
  const linkStyle = `font-family:${F.body};font-size:13px;font-weight:600;color:${C.text};text-decoration:none;`
  const legalStyle = `font-family:${F.body};font-size:12px;color:${C.textMuted};text-decoration:underline;`
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.primarySoft};">
    <tr>
      <td style="padding:26px 34px 14px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center" style="padding:0 6px 10px;"><a href="${site}/events" style="${linkStyle}">◆&nbsp; Événements</a></td>
            <td align="center" style="padding:0 6px 10px;"><a href="${site}/providers" style="${linkStyle}">●&nbsp; Prestataires</a></td>
            <td align="center" style="padding:0 6px 10px;"><a href="${site}/blog" style="${linkStyle}">↗&nbsp; Le blog</a></td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding:0 24px 14px;">
        <a href="${site}/privacy" style="${legalStyle}">Confidentialité</a>
        <span style="color:${C.borderStrong};padding:0 9px;">·</span>
        <a href="${site}/terms" style="${legalStyle}">Conditions</a>
        <span style="color:${C.borderStrong};padding:0 9px;">·</span>
        <a href="${site}/cookies" style="${legalStyle}">Cookies</a>
        <span style="color:${C.borderStrong};padding:0 9px;">·</span>
        <a href="${site}/contact" style="${legalStyle}">Aide</a>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding:0 36px 28px;font-family:${F.body};font-size:11px;color:${C.textFaint};line-height:1.6;">
        Cet email fait suite à ton activité sur LIVEINBLACK.<br/>
        © ${new Date().getFullYear()} LIVEINBLACK · La culture plus proche.
      </td>
    </tr>
  </table>`
}

export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function heading(title: string, tone: 'default' | 'accent' | 'danger' = 'default'): string {
  const color = tone === 'danger' ? C.danger : C.text
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;text-align:center;">
    <tr><td><h1 style="font-family:${F.display};font-weight:820;font-size:38px;line-height:1.1;letter-spacing:-0.03em;color:${color};margin:0;">${title}</h1></td></tr>
  </table>`
}

export function paragraph(html: string): string {
  return `<p style="font-family:${F.body};font-size:16px;color:${C.textMuted};line-height:1.62;margin:0 auto 14px;max-width:500px;text-align:center;">${html}</p>`
}

export function note(html: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;background:${C.surface2};border-radius:15px;">
    <tr>
      <td width="34" valign="top" style="padding:16px 0 16px 16px;"><span style="display:block;width:22px;height:22px;line-height:22px;border-radius:50%;background:${C.text};color:#ffffff;font-family:${F.body};font-size:12px;font-weight:800;text-align:center;">i</span></td>
      <td style="padding:16px 18px 16px 10px;"><p style="font-family:${F.body};font-size:13px;color:${C.textMuted};line-height:1.55;margin:0;text-align:left;">${html}</p></td>
    </tr>
  </table>`
}

export type ButtonTone = 'primary' | 'outline' | 'danger'

export function button(href: string, label: string, tone: ButtonTone = 'primary'): string {
  const styles: Record<ButtonTone, { bg: string; border: string; color: string }> = {
    primary: { bg: C.primary, border: C.primaryStrong, color: C.primaryInk },
    outline: { bg: '#ffffff', border: C.borderStrong, color: C.text },
    danger: { bg: C.danger, border: C.danger, color: '#ffffff' },
  }
  const s = styles[tone]
  return `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:28px auto 8px;">
    <tr><td style="border-radius:14px;background:${s.bg};border:1px solid ${s.border};box-shadow:0 1px 2px rgba(10,8,16,.08);">
      <a href="${href}" style="display:inline-block;padding:14px 22px;font-family:${F.body};font-size:15px;font-weight:750;line-height:1.2;text-decoration:none;color:${s.color};">${label}&nbsp;&nbsp;→</a>
    </td></tr>
  </table>`
}

export function badge(label: string, tone: 'default' | 'accent' | 'danger' = 'default'): string {
  const color = tone === 'accent' ? C.success : tone === 'danger' ? C.danger : C.textMuted
  const bg = tone === 'accent' ? C.successSoft : tone === 'danger' ? C.dangerSoft : C.surface2
  const icon = tone === 'accent' ? '✓' : tone === 'danger' ? '!' : '•'
  return `<span style="display:inline-block;padding:6px 10px;border-radius:999px;background:${bg};border:1px solid ${color}33;font-family:${F.body};font-size:11px;font-weight:750;color:${color};text-transform:uppercase;letter-spacing:.04em;">${icon}&nbsp; ${label}</span>`
}

export function infoRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:10px 8px 10px 0;border-bottom:1px solid ${C.border};font-family:${F.body};font-size:13px;color:${C.textFaint};width:36%;vertical-align:top;">${label}</td>
    <td style="padding:10px 0 10px 8px;border-bottom:1px solid ${C.border};font-family:${F.body};font-size:14px;color:${C.text};font-weight:650;vertical-align:top;">${value}</td>
  </tr>`
}

export function infoCard(rows: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background:${C.surface2};border-radius:18px;">
    <tr><td style="padding:12px 22px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>
  </table>`
}

export function divider(): string {
  return `<div style="height:1px;background:${C.border};margin:22px 0;"></div>`
}

export function wrap(innerHtml: string, opts: { site?: string; preheader?: string } = {}): string {
  const site = opts.site || DEFAULT_SITE
  const visual = pickVisual(innerHtml)
  const preheader = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(opts.preheader)}</div>`
    : ''

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body style="margin:0;background:${C.background};padding:0;font-family:${F.body};-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;">
    ${preheader}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.background};">
      <tr><td align="center" style="padding:28px 14px 44px;">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:${C.primarySoft};border:1px solid ${C.border};border-radius:28px;overflow:hidden;box-shadow:0 12px 40px rgba(10,8,16,.08);">
          <tr><td style="background:${C.primarySoft};">${brandHeader(site)}${visualHero(site, visual)}</td></tr>
          <tr><td style="padding:0 32px 30px;background:${C.primarySoft};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.surface};border:1px solid rgba(10,8,16,.08);border-radius:24px;box-shadow:0 8px 24px rgba(10,8,16,.05);">
              <tr><td style="padding:36px 32px;">${innerHtml}</td></tr>
            </table>
          </td></tr>
          <tr><td>${richFooter(site)}</td></tr>
        </table>
      </td></tr>
    </table>
  </body></html>`
}
