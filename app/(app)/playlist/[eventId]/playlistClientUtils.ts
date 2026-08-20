const ERROR_MESSAGES: Record<string, string> = {
  auth_required: 'Ta session a expiré — reconnecte-toi.',
  invalid_input: 'Requête invalide.',
  invalid_query: 'Recherche invalide.',
  search_unavailable: 'La recherche de titres est momentanément indisponible.',
  title_required: 'Titre requis.',
  not_checked_in: "Tu dois être scanné à l'entrée pour proposer un son.",
  quota_exceeded: 'Tu as déjà utilisé tous tes sons proposés pour cet événement.',
  duplicate_song: 'Ce titre est déjà dans la playlist.',
  staff_only: "Réservé au DJ/à l'équipe de cet événement.",
  invalid_status: 'Statut invalide.',
  song_not_found: 'Ce titre a déjà été retiré.',
  playlist_not_found: 'Playlist introuvable.',
  cannot_like_own_song: 'Tu ne peux pas liker ton propre son.',
  like_quota_exceeded: 'Tu as utilisé tes 5 likes pour cet événement.',
  event_not_found: 'Événement introuvable.',
  not_song_owner: "Tu ne peux retirer que tes propres sons.",
}

export function playlistClientErrorMessage(code: string | undefined): string {
  if (!code) return 'Une erreur est survenue.'
  return ERROR_MESSAGES[code] ?? 'Une erreur est survenue.'
}

export async function playlistApiFetch<T>(url: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, init)
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data?.ok === false) return { ok: false, error: data?.error ?? 'unknown_error' }
    return { ok: true, data: data as T }
  } catch {
    return { ok: false, error: 'network_error' }
  }
}
