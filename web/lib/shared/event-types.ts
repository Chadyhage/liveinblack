// Forme minimale partagée par les fonctions pures qui manipulent un "event"
// (countdown, stock, découvrabilité...). Volontairement un sous-ensemble large
// et optionnel — reflète le fait que ces fonctions legacy acceptaient un objet
// JS non typé ; le schéma Mongoose complet vit dans lib/models/Event.ts.
export type PlaceLike = {
  total?: number
  available?: number
}

// `closingDate`/`publishAt` acceptent Date OU string : le legacy stockait des
// chaînes ISO, Mongoose (lib/models/Event.ts) stocke des `Date` — ces
// fonctions ne font que `new Date(x)` dessus, donc les deux représentations
// fonctionnent indifféremment.
export type EventLike = {
  id?: string
  date?: string
  time?: string
  endTime?: string
  closingDate?: string | Date | null
  cancelled?: boolean
  isPrivate?: boolean
  visibility?: string
  isDemo?: boolean
  demoLabel?: string
  publishAt?: string | Date | null
  name?: string
  title?: string
  description?: string
  places?: PlaceLike[]
}
