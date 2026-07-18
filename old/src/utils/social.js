// ─── Réseaux sociaux ──────────────────────────────────────────────────────────
// Source unique des réseaux proposés sur les profils publics (organisateur,
// et réutilisable ailleurs). L'utilisateur peut saisir SOIT un lien complet
// (https://…) SOIT juste un @pseudo — socialUrl() produit toujours une URL
// cliquable valide, pour que le clic côté visiteur ouvre bien le bon profil.

export const SOCIAL_NETWORKS = [
  { key: 'instagram', label: 'Instagram', placeholder: '@pseudo ou lien' },
  { key: 'tiktok',    label: 'TikTok',    placeholder: '@pseudo ou lien' },
  { key: 'facebook',  label: 'Facebook',  placeholder: 'Nom de page ou lien' },
  { key: 'x',         label: 'X',         placeholder: '@pseudo ou lien' },
  { key: 'youtube',   label: 'YouTube',   placeholder: '@chaîne ou lien' },
  { key: 'linkedin',  label: 'LinkedIn',  placeholder: 'Lien de ta page' },
  { key: 'website',   label: 'Site web',  placeholder: 'https://…' },
]

// Construit une URL absolue et cliquable à partir d'un handle OU d'une URL.
// Retourne null si vide. Un lien déjà complet (http/https) est renvoyé tel quel.
export function socialUrl(key, value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (/^https?:\/\//i.test(raw)) return raw
  // On tolère « www.… » ou « instagram.com/… » collés sans protocole.
  if (/^[\w-]+\.[a-z]{2,}(\/|$)/i.test(raw)) return `https://${raw}`
  const handle = raw.replace(/^@+/, '').replace(/^\/+/, '')
  switch (key) {
    case 'instagram': return `https://instagram.com/${handle}`
    case 'tiktok':    return `https://tiktok.com/@${handle}`
    case 'facebook':  return `https://facebook.com/${handle}`
    case 'x':         return `https://x.com/${handle}`
    case 'youtube':   return `https://youtube.com/@${handle}`
    case 'linkedin':  return `https://www.linkedin.com/company/${handle}`
    default:          return `https://${handle}`
  }
}
