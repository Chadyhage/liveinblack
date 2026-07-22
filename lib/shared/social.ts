// Port de src/utils/social.js — source unique des réseaux proposés sur les
// profils publics (organisateur). L'utilisateur peut saisir SOIT un lien
// complet (https://…) SOIT juste un @pseudo — socialUrl() produit toujours
// une URL cliquable valide, pour que le clic côté visiteur ouvre bien le bon
// profil.

export const SOCIAL_NETWORKS = [
  { key: 'instagram', label: 'Instagram', placeholder: '@pseudo ou lien' },
  { key: 'tiktok', label: 'TikTok', placeholder: '@pseudo ou lien' },
  { key: 'facebook', label: 'Facebook', placeholder: 'Nom de page ou lien' },
  { key: 'x', label: 'X', placeholder: '@pseudo ou lien' },
  { key: 'youtube', label: 'YouTube', placeholder: '@chaîne ou lien' },
  { key: 'linkedin', label: 'LinkedIn', placeholder: 'Lien de ta page' },
  { key: 'website', label: 'Site web', placeholder: 'https://…' },
] as const

export type SocialNetworkKey = (typeof SOCIAL_NETWORKS)[number]['key']

export function socialUrl(key: string, value: string | null | undefined): string | null {
  const raw = String(value || '').trim()
  if (!raw || raw.length > 500 || /[\u0000-\u001f\u007f]/.test(raw)) return null
  let candidate: string
  if (/^https?:\/\//i.test(raw)) candidate = raw
  // On tolère « www.… » ou « instagram.com/… » collés sans protocole.
  else if (/^[\w-]+\.[a-z]{2,}(\/|$)/i.test(raw)) candidate = `https://${raw}`
  else {
    const handle = raw.replace(/^@+/, '').replace(/^\/+/, '')
    switch (key) {
      case 'instagram': candidate = `https://instagram.com/${handle}`; break
      case 'tiktok': candidate = `https://tiktok.com/@${handle}`; break
      case 'facebook': candidate = `https://facebook.com/${handle}`; break
      case 'x': candidate = `https://x.com/${handle}`; break
      case 'youtube': candidate = `https://youtube.com/@${handle}`; break
      case 'linkedin': candidate = `https://www.linkedin.com/company/${handle}`; break
      default: candidate = `https://${handle}`
    }
  }

  try {
    const url = new URL(candidate)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.toString()
  } catch {
    return null
  }
}
