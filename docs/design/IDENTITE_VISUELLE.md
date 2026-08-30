# LIVEINBLACK - Identite visuelle complete

Date de reference: 29 aout 2026

Ce document resume l'identite visuelle reelle de LIVEINBLACK telle qu'elle est definie dans le code du projet, principalement dans `app/globals.css`, `app/components/ui/*` et les tokens documentes dans `docs/design/design-system/`.

En cas de divergence, le code source fait foi.

## 1. ADN visuel

LIVEINBLACK assume une direction visuelle nocturne, premium et dense, avec:

- un fond sombre profond
- des surfaces fermes et opaques
- un accent unique fort et reconnaissable
- une typographie de titre condensée et expressive
- des interactions nettes, sans effets “glassmorphism”

L'univers doit rester:

- chic
- urbain
- lisible
- direct
- premium sans être froid

## 2. Palette de couleurs

### Couleurs principales

| Role | Token | Valeur | Usage |
|---|---|---:|---|
| Fond global | `--obsidian` | `#191218` | fond principal du site |
| Surface principale | `--surface` | `#241a23` | cartes, panneaux, blocs |
| Surface secondaire | `--surface-2` | `#1d141c` | modales, menus, champs |
| Accent principal | `--primary` | `#F53D8D` | CTA, focus, accents visuels |
| Accent renforcé | `--primary-strong` | `#e02d7d` | hover, états actifs |
| Texte principal | `--text` | `#ffffff` | texte fort |
| Texte atténué | `--text-muted` | `rgba(255,255,255,0.76)` | descriptions |
| Texte faible | `--text-faint` | `rgba(255,255,255,0.62)` | aides, métas |
| Erreur / alerte | `--pink` | `#FF75AD` | états négatifs ou doux |

### Alias hérités

Les anciens noms `--teal`, `--gold` et `--violet` existent encore pour compatibilité, mais ils pointent tous vers l'accent principal. Ils ne doivent pas être réintroduits comme nouvelles couleurs de design.

| Alias | Pointe vers |
|---|---|
| `--teal` | `--primary` |
| `--teal-solid` | `--primary-strong` |
| `--gold` | `--primary` |
| `--violet` | `--primary` |
| `--violet-cta` | `linear-gradient(180deg, var(--primary), var(--primary-strong))` |

### Règles de couleur

- pas de palette multicolore arbitraire
- pas de néon décoratif
- pas de gradients gratuits sur le contenu
- l'accent sert à guider, pas à saturer l'écran
- les cartes restent opaques et lisibles

## 3. Typographie

### Familles

| Rôle | Famille | Usage |
|---|---|---|
| Texte d'interface | Geist auto-hébergée via `--font-interface` | corps de texte, boutons, labels |
| Titre affiché | `Impact, Arial Narrow, Helvetica Neue Condensed, sans-serif` | `h1`, `h2`, `h3`, `.heading`, `.font-display` |
| Sous-titre | `Montserrat` via `--font-montserrat` | `h4`, `h5`, `h6` |

### Règles typographiques

- les titres `h1`, `h2`, `h3` sont en majuscules
- la police display est condensée et forte
- la hiérarchie repose sur la taille, le poids et l'espacement des lettres
- les textes de navigation et d'interface restent sobres et fonctionnels

### Echelle courante

| Élément | Taille |
|---|---|
| `h1` | `clamp(34px, 4.2vw, 56px)` |
| `h2` | `clamp(26px, 3.2vw, 42px)` |
| `h3` | `clamp(22px, 2.6vw, 32px)` |
| `h4` | `clamp(18px, 2vw, 24px)` |
| Titre dashboard | `clamp(32px, 4vw, 52px)` |

### Ton éditorial

Le texte de marque doit être:

- clair
- confiant
- court quand c'est possible
- élégant sans exagération

## 4. Formes et rayons

| Token | Valeur | Usage |
|---|---|---|
| `--radius-sm` | `4px` | petits éléments |
| `--radius-md` | `7px` | champs, micro-surfaces |
| `--radius-lg` | `10px` | cartes, boutons standards |
| `--radius-xl` | `14px` | panneaux plus importants |
| `--radius-pill` | `999px` | badges, pills |

Les formes doivent rester nettes, sans rondeur excessive. L'identité repose davantage sur la structure que sur les ornements.

## 5. Surfaces et profondeur

### Surfaces

- `--surface` pour les cartes et sections principales
- `--surface-2` pour les couches au-dessus: modales, menus, champs, panneaux flottants
- bordures visibles mais discrètes
- ombres mesurées, jamais lourdes

### Ombres documentées

| Rôle | Valeur |
|---|---|
| Ombre carte | `0 18px 46px rgba(0,0,0,0.16)` |
| Ombre panneau | `0 18px 48px rgba(0,0,0,0.18)` |
| Ombre hero | `0 22px 64px rgba(0,0,0,0.22)` |

### Principe

La profondeur sert à séparer les niveaux d'information, pas à fabriquer un effet spectaculaire.

## 6. Grilles et mise en page

### Largeurs de référence

| Token | Valeur | Usage |
|---|---|---|
| `--content-max` | `1480px` | conteneur principal |
| `--content-wide` | `1560px` | conteneur large |
| `--page-gutter` | `clamp(20px, 3vw, 48px)` | gouttières de page |
| `--dashboardPageMax` | `1600px` | dashboard large |
| `--dashboardPageMedium` | `1320px` | dashboard moyen |
| `--dashboardPageNarrow` | `820px` | réglages et formulaires |

### Classes de layout globales

- `.lb-dashboard-page`
- `.lb-dashboard-page--medium`
- `.lb-dashboard-page--narrow`
- `.lb-dashboard-page-header`
- `.lb-dashboard-title`
- `.lb-dashboard-description`
- `.lb-card-grid`
- `.lb-card-grid-compact`
- `.lb-dashboard-card-grid`
- `.lb-organizer-event-grid`
- `.lb-responsive-metrics`
- `.lb-directory-intro`
- `.lb-directory-hero`
- `.lb-directory-filters`
- `.lb-search-panel`
- `.lb-access-code`
- `.lb-detail-section`
- `.lb-loading-panel`
- `.lb-accent-line`

### Règles de layout

- les pages utilisent des conteneurs cohérents
- les gouttières ne doivent pas être redéfinies localement sans raison
- les grilles doivent rester respirantes sur mobile
- une seule carte ne doit pas donner l'impression d'un layout cassé

## 7. Composants UI

Le projet centralise ses primitives dans `app/components/ui/`. Les composants suivants sont les briques d'identité à réutiliser:

- `Button`
- `Card`
- `Badge`
- `Input`
- `Textarea`
- `Checkbox`
- `Radio`
- `Switch`
- `Select`
- `Modal`
- `SlideOverModal`
- `Avatar`
- `Toast`
- `Tabs`
- `IconButton`
- `SectionHeader`
- `EmptyState`
- `Mascot`
- `Pagination`
- `PageLinks`
- `Skeleton`
- `Spinner`

### Règles d'usage

- ne jamais styler un `<button>` brut à la main
- ne jamais styler un `<input>` brut à la main quand un composant existe
- garder les surfaces et comportements cohérents entre pages
- privilégier les variants existants avant d'en inventer un nouveau

## 8. Boutons

### Variants

| Variant | Style |
|---|---|
| `primary` | fond accent, texte sombre |
| `secondary` | transparent, bordure accent |
| `danger` | fond rouge |
| `ghost` | transparent, texte atténué |
| `link` | lien souligné |

### Tailles

| Taille | Hauteur mini | Padding |
|---|---|---|
| `sm` | 44px | `8px 14px` |
| `md` | 44px | `11px 18px` |
| `lg` | 48px | `14px 22px` |

### Règles

- cible tactile minimale: 44px
- hover subtil
- press léger
- état loading explicite

## 9. Champs et formulaires

- fond sombre de surface
- bordure claire mais discrète
- focus visible net
- placeholder atténué
- pas d'outline supprimé sans remplacement

Le projet applique aussi un traitement global pour garder les champs lisibles avec autofill navigateur.

## 10. Cartes et listes

Les cartes doivent:

- être opaques
- avoir une bordure visible
- porter une hiérarchie claire
- éviter les effets de transparence excessive

Les listes et tuiles doivent rester lisibles à toutes les tailles d'écran. La densité doit rester confortable, surtout sur mobile.

## 11. Icones et micro-éléments

- les icones doivent hériter de la couleur du texte quand c'est possible
- les badges doivent rester compacts et lisibles
- les états vides doivent être explicites, jamais décoratifs

## 12. Interactions et mouvement

### Motion

| Usage | Valeur |
|---|---|
| Hover carte | `transform 180ms ease, border-color 180ms ease, background 180ms ease` |
| Interaction bouton | `opacity 0.15s ease, transform 0.1s ease, filter 0.15s ease` |

### Règles

- les animations doivent aider la compréhension
- pas d'animation gratuite
- `prefers-reduced-motion` doit toujours être respecté

## 13. Accessibilite

Règles minimales:

- contraste suffisant sur texte et CTA
- focus clavier visible
- cibles tactiles >= 44px
- libellés explicites
- pas de texte trop petit dans les zones critiques

## 14. Fond et ambiance

Le site utilise une ambiance de fond marquée:

- fond global sombre
- texture discrète
- lumière subtile au-dessus du fond
- image de fond et overlay selon les pages

L'effet recherché est une ambiance nocturne, pas un décor chargé.

## 15. Ce qu'il faut eviter

- bleu générique de dashboard SaaS
- violet par défaut
- glassmorphism fort
- ombres trop lourdes
- cartes sans fond
- typos par défaut type Inter/Roboto si une police de la charte est prévue
- sections trop compactes
- éléments décoratifs qui ne servent pas l'information

## 16. Resume express

Si on devait résumer l'identité LIVEINBLACK en une phrase:

> une plateforme nocturne premium, sombre, structurée, avec un accent rose fort, une typo display condensée et des surfaces nettes, pensées pour la lisibilité et la confiance.

## 17. Sources de verite

- `app/globals.css`
- `app/components/ui/*`
- `docs/design/design-system/tokens.json`
- `docs/design/design-system/components.md`
- `docs/design/design-system/patterns.md`

