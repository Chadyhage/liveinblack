import { useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

// Chaque onglet/panneau/filtre interne d'une page (ex. section "Paiements"
// de l'espace agent, onglet "Encaissement" de la page organisateur, item de
// catalogue en cours d'édition) doit rester atteignable/partageable par URL
// — le client veut pouvoir envoyer un lien direct vers n'importe quel écran,
// dashboard inclus. Ce hook remplace un `useState` local par un paramètre de
// requête : la valeur courante vient de l'URL, la changer met à jour l'URL
// (jamais l'inverse), donc copier/partager l'URL reproduit exactement l'état
// affiché. Uniquement pour du basculement d'affichage pur (pas d'effet de
// bord au montage lié à la valeur) — un état qui déclenche un fetch dépendant
// de sa valeur doit rester géré au niveau de l'appelant (lire la valeur ici,
// mais garder le useEffect de fetch explicite chez l'appelant).
export function useQueryParamState<T extends string>(
  paramName: string,
  defaultValue: T,
  opts: { push?: boolean } = {}
): [T, (value: T) => void] {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const current = (searchParams.get(paramName) as T | null) ?? defaultValue

  const setValue = useCallback(
    (value: T) => {
      const params = new URLSearchParams(searchParams.toString())
      // Valeur par défaut = pas de paramètre dans l'URL (garde les liens
      // courts/propres pour le cas le plus courant).
      if (value === defaultValue) params.delete(paramName)
      else params.set(paramName, value)
      const query = params.toString()
      const url = query ? `${pathname}?${query}` : pathname
      if (opts.push) router.push(url)
      else router.replace(url, { scroll: false })
    },
    [searchParams, pathname, paramName, defaultValue, opts.push, router]
  )

  return [current, setValue]
}
