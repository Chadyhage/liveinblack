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
): [T, (value: T, callOpts?: { push?: boolean }) => void] {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const current = (searchParams.get(paramName) as T | null) ?? defaultValue

  const setValue = useCallback(
    // `callOpts.push` permet de surcharger le mode push/replace par défaut
    // du hook au cas par cas (ex. messagerie : ouvrir une conversation doit
    // empiler une entrée d'historique — bouton retour = revenir à la
    // précédente — mais la fermer doit rester en replace, sinon "retour"
    // rouvrirait la conversation qu'on vient juste de fermer).
    (value: T, callOpts?: { push?: boolean }) => {
      const params = new URLSearchParams(searchParams.toString())
      // Valeur par défaut = pas de paramètre dans l'URL (garde les liens
      // courts/propres pour le cas le plus courant).
      if (value === defaultValue) params.delete(paramName)
      else params.set(paramName, value)
      const query = params.toString()
      const url = query ? `${pathname}?${query}` : pathname
      if (callOpts?.push ?? opts.push) router.push(url)
      else router.replace(url, { scroll: false })
    },
    [searchParams, pathname, paramName, defaultValue, opts.push, router]
  )

  return [current, setValue]
}

// Deux appels successifs à setValue() de useQueryParamState (un par
// paramètre) partagent le même searchParams "figé" au rendu — le second
// écrase le premier au lieu de les cumuler, un router.replace() gagnant sur
// l'autre (bug confirmé : StatistiquesClient.tsx en perdait un des deux à
// chaque changement de filtre). Cette variante prend TOUS les changements en
// un seul objet et un seul router.replace/push, donc jamais de course entre
// deux écritures d'URL. `null` retire le paramètre (valeur par défaut).
export function useSetQueryParams(opts: { push?: boolean } = {}): (updates: Record<string, string | null>) => void {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  return useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) params.delete(key)
        else params.set(key, value)
      }
      const query = params.toString()
      const url = query ? `${pathname}?${query}` : pathname
      if (opts.push) router.push(url)
      else router.replace(url, { scroll: false })
    },
    [searchParams, pathname, opts.push, router]
  )
}
