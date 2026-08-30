# Composants — `app/components/ui/`

Inventaire exact des primitives réutilisables. **Règle du projet : jamais de `<button>`/`<input>` brut stylé inline dans une page — toujours passer par ces composants** (voir `CLAUDE.md`). Import groupé : `import { Button, Card, Badge, ... } from '@/app/components/ui'`.

Toutes les valeurs ci-dessous sont copiées du code réel (`app/components/ui/*.tsx`) au moment de la rédaction — en cas de doute, le `.tsx` fait foi.

---

## Button
`variant`: `primary | secondary | danger | ghost | link` · `size`: `sm | md | lg` · props: `loading`, `loadingText`, `fullWidth`, `icon`

| Variant | Fond | Texte | Bordure |
|---|---|---|---|
| `primary` | `var(--primary)` (`rgba(184,243,74,.35)` si disabled) | `var(--obsidian)` | transparente |
| `secondary` | transparent | `var(--text)` | `1px solid rgba(184,243,74,.55)` |
| `danger` | `#e05a5a` | `#fff` | transparente |
| `ghost` | transparent | `var(--text-muted)` | transparente |
| `link` | transparent, pas de padding | `var(--primary)` | aucune, `text-decoration: underline` |

Tailles : `sm` → 44px min-height, `md` → 44px, `lg` → 48px (jamais en dessous de 44px, cible tactile). Hover = `brightness(1.08)`, press = `translateY(1px)`. `loading` remplace le contenu par `<Spinner>`.

## Card
Conteneur "surface" — `background: var(--surface)`, `border: 1px solid var(--border)` (ou `accent` custom), `border-radius: var(--radius-lg)`, `padding: 20`. Utiliser `accent` (ex. `rgba(184,243,74,0.25)`) pour un encart mis en avant plutôt que redéfinir tout le style.

## Badge
`tone`: `teal | gold | pink | violet | danger | neutral` (teal/gold/violet convergent visuellement, tous alias du token accent principal sauf `pink`/`danger`). Pill 999px, texte 11px/800/uppercase/letter-spacing .045em.

## Input / Textarea
`size`: `sm | md`, props `invalid`, `leftIcon`, `rightIcon`. Fond `var(--surface-2)`, bordure `var(--border-strong)` → `var(--primary)` au focus → `#ff5b5b` si `invalid`. Jamais de `outline` natif (géré par le `:focus-visible` global de `globals.css`).

## Checkbox / Radio / Switch
Contrôles custom (visuel coché/décoché piloté en React), le focus clavier reste géré en CSS global (`:focus-visible ~ *`). `accent-color: var(--primary)` appliqué aux `input[type=checkbox|radio]` natifs restants (wizards notamment) pour cohérence même sans passer par ces composants.

## Select
`SelectOption[]` — même famille visuelle qu'Input.

## Modal / SlideOverModal
`z-index: var(--z-modal)` (3000). `SlideOverModal` = panneau glissant depuis le bord (utilisé pour les détails événement/organisateur en overlay sur `/events`, `/organizers` — voir note UX ci-dessous).

## Avatar
`size`: voir `AvatarSize` — initiales ou `avatarUrl`.

## Toast / `useToast`
`ToastKind` pour succès/erreur/info — hook centralisé, pas de `<Toast>` monté ad hoc par écran.

## Tabs
`TabsProps` — utilisé pour les sous-navigations locales (ex. onglets de `/offer-services` : Ma page publique / Catalogue / Mes avis / Abonnement).

## IconButton
`tone`: `IconButtonTone` — bouton icône seul, même contrat de taille tactile (44px min) que Button.

## SectionHeader / EmptyState / Mascot
`SectionHeader` = titre + description + accent-line (`.lb-accent-line`, 42×4px `var(--primary)`). `EmptyState` = état vide standard (icône + titre + description + CTA optionnel — voir `/messages` "Aucune conversation", `/profile/billets` "Aucun billet pour l'instant"). `Mascot` avec `MascotMood`.

## Pagination / PageLinks
`pagedSlice` / `pageSlice` — helpers de découpage côté client, pas de pagination serveur pour l'instant (toutes les listes actuelles chargent tout puis paginent en mémoire).

## Skeleton / SkeletonRow / SkeletonCard / SkeletonList
Animation `lb-skeleton-shimmer` (keyframes globales dans `globals.css`, pas réinjectées par instance).

## Spinner
Animation `lb-spin` (keyframes globales). Utilisé par `Button` en `loading`.

---

## ⚠️ Piège d'automatisation UI connu (important si Claude pilote un navigateur sur ce site)
Les fiches événement/organisateur (`/events/[id]`, `/organizers/[id]`) s'ouvrent en **panneau glissant superposé** (parallel route `@modal`), pas en navigation plein-écran classique. Un clic automatisé sur un bouton dans ce panneau (ex. "Intéressé", "S'abonner") peut sembler ne rien faire si les coordonnées ciblent l'ancien contenu sous l'overlay — toujours utiliser `find`/`ref` pour cibler l'élément exact du panneau, jamais des coordonnées fixes recyclées de l'état précédent.
