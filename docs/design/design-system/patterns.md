# Patterns de mise en page — classes utilitaires globales

Ces classes vivent dans `app/globals.css` (pas des composants React) et posent les rythmes/largeurs partagés entre écrans. But documenté dans le CSS : éviter que chaque page redéfinisse son propre conteneur centré à une largeur légèrement différente.

## Structure de page privée (dashboard)
- `.lb-dashboard-page` — conteneur principal, `max-width: 1600px`, centré, `min-height: calc(100vh - 170px)`
- `.lb-dashboard-page--medium` — variante `max-width: 1320px`
- `.lb-dashboard-page--narrow` — variante `max-width: 820px` (formulaires, réglages)
- `.lb-dashboard-page-header` — ligne titre + actions, `flex` avec wrap
- `.lb-dashboard-title` — `font-size: clamp(32px, 4vw, 52px)`
- `.lb-dashboard-description` — sous-titre, `max-width: 720px`

**Ne plus rajouter de padding horizontal individuel dans un écran enfant** — `DashboardShell` fournit déjà les gouttières.

## Grilles de cartes
- `.lb-card-grid` — `repeat(auto-fit, minmax(min(100%,360px), 1fr))`, la grille standard pour une liste de cartes principales. Cas particulier : un seul enfant → colonne unique cappée à 560px (`:has(> .lb-card:only-child)`).
- `.lb-card-grid-compact` — `repeat(auto-fill, minmax(180px,1fr))`, pour des listes secondaires/aperçus (ex. événements passés d'un profil organisateur) où la grille standard serait trop large.
- `.lb-dashboard-card-grid` — `repeat(auto-fit, minmax(320px,1fr))`, grille des cartes de pilotage dashboard (`!important` — utilisée par les écrans agent).
- `.lb-organizer-event-grid` — `repeat(auto-fit, minmax(min(100%,440px),1fr))`, cartes d'action à ≤2 colonnes (au-delà de 3 colonnes les cartes tombent à ~298px et deviennent illisibles avec jusqu'à 10 actions).
- `.lb-responsive-metrics` — grille de tuiles-métriques, passe à 2 colonnes sous 620px.

## Annuaires publics (`/events`, `/providers`, `/organizers`, `/search`)
- `.lb-directory-intro` — bandeau d'intro, dégradé `primary` léger + `var(--surface-2)`
- `.lb-directory-hero` — `max-width: 860px`
- `.lb-directory-filters` — panneau de filtres, `var(--surface-2)`
- `.lb-search-panel` / `.lb-access-code` — panneaux flex avec contrôles, passent en colonne sous 620px

## Sections de détail
- `.lb-detail-section` — bloc `var(--surface)` avec ombre, utilisé pour les sous-sections d'une fiche
- `.lb-loading-panel` — état de chargement générique (`display:grid; place-items:center`)

## Accent visuel
- `.lb-accent-line` — trait 42×4px `var(--primary)`, sous un `SectionHeader`
- `.lb-card:hover` — `translateY(-3px)`, bordure `rgba(255,229,0,.42)` *(⚠️ valeur legacy jaune non alignée sur le token `--primary` vert actuel — probablement un oubli de migration, à vérifier avant de s'en servir comme référence)*

## Points d'accessibilité globaux (ne jamais réintroduire une régression dessus)
- Cibles tactiles ≥44px sur toute nav (`.lb-public-nav`, `.lb-dashboard-sidebar`) et boutons
- `:focus-visible` restauré globalement même si un composant local avait mis `outline:none`
- `prefers-reduced-motion: reduce` coupe toutes les transitions/animations à `0.01ms`
- `accent-color: var(--primary)` sur les checkbox/radio natifs restants

## Breakpoints observés
- `820px` — bascule grille filtres événements
- `720px` — tailles de titres h1/h2 réduites
- `620px` — bascule mobile générale (paddings, colonnes de filtres à 2, search-panel en colonne)
