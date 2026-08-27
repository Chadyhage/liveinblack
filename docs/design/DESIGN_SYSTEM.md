# LIVEINBLACK — Design System (Web)

> Document généré à partir du code réel (`app/globals.css`, `app/components/ui/*`, composants applicatifs) — **pas d'invention**, chaque valeur ci-dessous existe littéralement dans le repo à la date de génération. Aucun mode clair/sombre : thème unique.
>
> 🌸 **Identité visuelle** : Le code a migré vers un thème rose primaire — `--primary` (`#F53D8D`), `--pink` (`#FF75AD`), `--obsidian` (`#191218`).--teal/--gold/--violet sont aujourd'hui des alias de compatibilité qui pointent tous vers `--primary`.

---

## 1. Tokens (`app/globals.css` — `:root`)

```css
/* Couleurs */
--obsidian: #191218;       /* fond de page */
--surface: #241a23;        /* cartes */
--surface-2: #1d141c;      /* modals / menus / inputs */
--primary: #F53D8D;        /* rose viva — accent principal */
--primary-strong: #e02d7d; /* CTA plein, hover */
--primary-ink: #ffffff;    /* texte blanc sur fond rose */

/* Alias de compatibilité — anciennes couleurs convergent vers le rose */
--teal: var(--primary);
--teal-solid: var(--primary-strong);
--gold: var(--primary);
--pink: #FF75AD;
--violet: var(--primary);
--violet-cta: linear-gradient(180deg, var(--primary), var(--primary-strong));

--border: rgba(245, 61, 141, 0.18);
--border-strong: rgba(245, 61, 141, 0.34);
--text: #ffffff;
--text-muted: rgba(255, 255, 255, 0.76);
--text-faint: rgba(255, 255, 255, 0.62);

/* Rayons */
--radius-sm: 4px;
--radius-md: 7px;
--radius-lg: 10px;
--radius-xl: 14px;
--radius-pill: 999px;

/* Espacements */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;

/* Layout */
--content-max: 1480px;
--content-wide: 1560px;
--page-gutter: clamp(20px, 3vw, 48px);

/* Z-index */
--z-nav: 40;
--z-floating: 45;
--z-sheet: 200;
--z-modal: 3000;

/* Focus */
--focus-ring: 0 0 0 3px rgba(184, 243, 74, 0.28);

/* Polices */
--font-open-sans: var(--font-interface);
--font-montserrat: var(--font-interface);
--font-display: Impact, "Arial Narrow", "Helvetica Neue Condensed", sans-serif;

--background: var(--obsidian);
--foreground: var(--text);
```

**Texture de fond** : `body` porte un motif SVG discret en fond fixe (opacité `.9`) + un overlay grain-bruit (`feTurbulence`, opacité `0.035`, `z-index: 9999`) par-dessus tout le contenu. `html { scroll-padding-top: 84px; }` (compense la nav sticky pour les ancres).

Tailwind (`@import "tailwindcss"`) n'est utilisé que pour quelques classes utilitaires sur `<html>`/`<body>` dans `app/layout.tsx` (`h-full antialiased min-h-full flex flex-col`) — **jamais** dans les composants applicatifs, qui utilisent exclusivement `style={{}}` inline + `var(--*)`.

---

## 2. Typographie

**Chargement** — `next/font/local`, auto-hébergé (Geist) :
```ts
const interfaceFont = localFont({
  src: "../node_modules/next/dist/next-devtools/server/font/geist-latin.woff2",
  variable: "--font-interface",
  weight: "100 900",
  display: "swap",
});
```
`--font-open-sans` et `--font-montserrat` pointent aujourd'hui vers la même police (Geist/`--font-interface`) — seule `--font-display` (Impact / Arial Narrow condensée) est une famille distincte, réservée aux gros titres.

```css
body { font-family: var(--font-open-sans), "Open Sans", Arial, sans-serif; line-height: 1.5; }

h1, h2, h3, .heading {
  font-family: var(--font-display), Anton, Impact, sans-serif;
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.01em;
}
h4, h5, h6 {
  font-family: var(--font-montserrat), Montserrat, Arial, sans-serif;
  font-weight: 700;
}
```
`.font-display` réplique le rendu h1-h3 sur un élément quelconque.

**Échelle responsive** (`@media max-width: 720px`) :
- `h1 { font-size: clamp(30px, 9vw, 46px); }`
- `h2 { font-size: clamp(24px, 7vw, 36px); }`
- `.lb-dashboard-title { font-size: clamp(32px, 4vw, 52px); line-height: 1; }`

**Corps de texte / UI** — pas de classes utilitaires, tailles codées en dur par composant, valeurs récurrentes : `11 / 11.5 / 12 / 12.5 / 13 / 13.5 / 14 / 14.5 / 15 / 17px`. Poids : `800`/`700` pour labels/boutons/eyebrows, `600` pour le texte de nav standard.

**Plancher d'accessibilité** : une règle CSS globale relève tout micro-texte legacy (9–12px) à un minimum de 12.5–13px à l'intérieur de `main` / `.lb-dashboard-page` / `.lb-page-shell` — appliqué automatiquement, à ne jamais contourner.

---

## 3. Espacement / Layout

**Largeurs de conteneur réellement utilisées** :
- `--content-max: 1480px` / `--content-wide: 1560px`
- `.lb-public-nav__inner { max-width: 1800px; padding: 0 28px; }` (58px / 14px sous 640px)
- `.lb-dashboard-page { max-width: 1600px; }` (variantes `--medium: 1320px`, `--narrow: 820px`)
- Gouttière de page : `--page-gutter: clamp(20px, 3vw, 48px)`
- Contenu du dashboard : `padding: 36px clamp(20px, 3vw, 48px) 72px`

**Gaps courants** : `4, 6, 8, 10, 14, 16, 18, 20, 24, 26px`, et `clamp(18px, 2vw, 26px)` pour `.lb-card-grid`.

**Points de rupture réels du projet** (pas 768/1024/1280 classiques — grepés dans tout le repo) :

| Breakpoint | Usage |
|---|---|
| `max-width: 480px` | le plus fréquent (×5) |
| `max-width: 640px` | ×3 |
| `max-width: 780px` / `900px` | ×2 |
| `max-width: 720/560/767/620/820px` | ×1 chacun |
| `min-width: 1099/1100px` | seuil sidebar/nav → hamburger |
| `min-width: 1400px` | nav complète desktop |

`@media (prefers-reduced-motion: reduce)` réduit toutes les durées d'animation/transition à `.01ms` (règle déclarée deux fois).

---

## 4. Boutons — `app/components/ui/Button.tsx`

**Seul primitif bouton autorisé** dans toute l'app (commentaire explicite dans le fichier : jamais de `<button>` stylé à la main ailleurs).

```ts
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'link'
export type ButtonSize = 'sm' | 'md' | 'lg'
export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  loadingText?: string
  fullWidth?: boolean
  icon?: React.ReactNode
}
```

**Tailles** :
| Taille | minHeight | padding | fontSize | borderRadius | gap |
|---|---|---|---|---|---|
| `sm` | 44 | `8px 14px` | 12.5 | 10 | 6 |
| `md` | 44 | `11px 18px` | 13.5 | 12 | 8 |
| `lg` | 48 | `14px 22px` | 15 | 14 | 8 |

`minHeight: 44` est imposé même hors de `SIZE_STYLES` pour le variant `link` (règle de cible tactile).

**Variantes** :
| Variant | Style |
|---|---|
| `primary` | bg `var(--gold)` (= vert primaire), texte `var(--obsidian)` ; disabled → `rgba(184,243,74,0.35)` |
| `secondary` | fond transparent, `1px solid rgba(184,243,74,.55)`, texte `var(--text)` |
| `danger` | bg `#e05a5a`, texte blanc ; disabled → `rgba(224,90,90,0.35)` |
| `ghost` | totalement transparent, texte `var(--text-muted)` |
| `link` | transparent, pas de padding/bordure, souligné, couleur `var(--teal)` |

**Interaction** : hover → `filter: brightness(1.08)` ; press → `transform: translateY(1px)` ; disabled → `opacity: 0.6` (sauf en loading) ; `transition: opacity 0.15s ease, transform 0.1s ease, filter 0.15s ease`. En `loading`, les enfants sont remplacés par `<Spinner text={loadingText} />`.

---

## 5. Cartes / Surfaces

**Primitif partagé — `app/components/ui/Card.tsx`** :
```ts
{ background: 'var(--surface)', border: `1px solid ${accent || 'var(--border)'}`, borderRadius: 'var(--radius-lg)', padding: 20 }
```

**Comportement hover global (`.lb-card`)** :
```css
.lb-card { transition: transform 180ms ease, border-color 180ms ease, background 180ms ease; }
.lb-card:hover {
  transform: translateY(-3px);
  border-color: rgba(255,229,0,0.42) !important;
  background: var(--surface-2) !important;
}
```
`:focus-visible` → `translateY(-2px)`.

**Surfaces de page** :
```css
.lb-detail-section {
  padding: clamp(18px, 2.4vw, 26px);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: 0 18px 46px rgba(0,0,0,.16);
}
.lb-directory-intro {
  padding: clamp(24px, 3vw, 38px);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  background: linear-gradient(135deg, rgba(184,243,74,.08), transparent 48%), var(--surface-2);
  box-shadow: 0 22px 64px rgba(0,0,0,.22);
}
```

> ⚠️ Duplication constatée : `AgentUsersClient.tsx` redéfinit localement un `cardStyle` quasi identique au `Card` partagé (`borderRadius: 16` au lieu de `var(--radius-lg)`) — pattern courant mais pas totalement centralisé, à corriger lors d'une prochaine passe.

---

## 6. Formulaires / Champs

**`Input.tsx`** :
| Taille | minHeight | padding | fontSize |
|---|---|---|---|
| `sm` | 44 | `10px 12px` | 12.5 |
| `md` | 46 | `12px 14px` | 13.5 |

Rayon : `var(--radius-md)`. Fond `var(--surface-2)`, texte `var(--text)`, `outline: none`. Disabled → `opacity: 0.55`, `cursor: not-allowed`. `leftIcon`/`rightIcon` positionnés en absolu (`left/right: 12`).

**État d'erreur** (pattern audité WCAG 2.2 AA 3.3.1) :
```ts
border: `1px solid ${invalid ? '#ff5b5b' : focused ? 'var(--teal)' : 'var(--border-strong)'}`
aria-invalid={invalid || undefined}
```

`Textarea.tsx` réplique exactement ce pattern. `Select.tsx` est un dropdown 100% custom (pas de `<select>` natif), navigation clavier, icône `ChevronDown`, mêmes props `invalid`/`size`.

`Checkbox.tsx` / `Radio.tsx` / `Switch.tsx` : l'`<input>` réel est masqué (`opacity: 0`), un `<span>` frère porte le rendu visuel, piloté entièrement par l'état React — jamais par un sélecteur CSS `:checked + span` (commentaire explicite : perdrait systématiquement face à un style inline). Fallback global : `accent-color: var(--primary)` sur les inputs natifs, focus clavier via `:where(input[type='checkbox'], input[type='radio']):focus-visible ~ * { outline: 2px solid var(--primary); }`.

`Label.tsx` : `{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }`.

Placeholder global : `input::placeholder, textarea::placeholder { color: rgba(255,255,255,0.38); }`.

**Focus ring global** (tous les éléments interactifs) :
```css
:where(a, button, input, select, textarea, summary, [role='button'], [tabindex]):focus-visible {
  outline: 2px solid var(--primary) !important;
  outline-offset: 3px !important;
  box-shadow: var(--focus-ring) !important; /* 0 0 0 3px rgba(184,243,74,0.28) */
}
```

---

## 7. Navigation

### `PublicNav.tsx` (`app/(public)/_components/PublicNav.tsx`)
Header sticky translucide : `position: sticky; top: 0; z-index: 40; background: rgba(7,8,13,0.86); backdrop-filter: blur(14px); border-bottom: 1px solid rgba(184,243,74,.16)`.

Contenu : logo texte, liens principaux (Accueil / Événements / Prestataires / Organisateurs / Blog / C'est quoi), `HeaderSearch` (recherche rapide inline, debounce 280ms, `/api/search/quick`), `AccountMenu` (connecté) ou CTA Connexion/Créer un compte (déconnecté), hamburger (`lucide-react` `Menu`/`X`) → tiroir mobile plein écran qui injecte aussi les liens de la sidebar dashboard (prop `dashboardLinks`) sous "Mon espace" — un seul point d'entrée mobile, jamais deux hamburgers empilés.

**Paliers responsive** :
- `< 1100px` : tout replié dans le hamburger
- `1100–1399px` : liens "primaires" + CTA auth visibles inline, reste dans le hamburger
- `≥ 1400px` : nav complète, hamburger masqué

Lien actif : soulignement animé (`::after`, pill 3px, `background: var(--primary)`), visible uniquement `≥1100px`.

### `DashboardShell.tsx` (`app/(app)/_components/DashboardShell.tsx`)
Sidebar privée sticky, `SIDEBAR_WIDTH = 272px`, `position: sticky; top: 61; height: calc(100vh - 61px); overflow-y: auto; border-right: 1px solid rgba(184,243,74,.14); background: var(--surface-2)`. **Masquée sous 1099px** (`.lb-dashboard-sidebar { display: none; }`) — repli sur le tiroir mobile partagé de `PublicNav`.

En-tête : libellé de rôle + pill "Agent" si `activeRole === 'agent'`. Items groupés par sections ("Mon activité" / "Gestion" puis "Mon compte"), icône `lucide-react` + label. État actif : `background: rgba(184,243,74,.10)` + `border-left: 3px solid var(--primary)` + icône/texte plus clairs. Sous-items repliables (`ChevronDown`, rotation 180°, `transition: transform .15s ease`). Badges de compteur (dossiers/signalements/suppressions en attente, agent uniquement) : poll toutes les 15s, pill rose `background: rgba(224,90,170,0.85)`. Section rôle client : bloc "upsell" sous un séparateur 1px. Contenu principal : `padding: 36px clamp(20px, 3vw, 48px) 72px` sauf routes "full-bleed".

---

## 8. Badges / Pills

**Deux implémentations coexistent** :

**a) Primitif partagé `app/components/ui/Badge.tsx`** (par ton) :
```ts
export type BadgeTone = 'teal' | 'gold' | 'pink' | 'violet' | 'danger' | 'neutral'
teal:    { background: 'rgba(184,243,74,0.14)', color: 'var(--primary)' }
gold:    { background: 'rgba(184,243,74,0.16)', color: 'var(--gold)' }
pink:    { background: 'rgba(255,107,0,0.14)',  color: 'var(--pink)' }
violet:  { background: 'rgba(124,58,237,0.16)', color: 'var(--violet)' }
danger:  { background: 'rgba(224,90,90,0.16)',  color: '#e05a5a' }
neutral: { background: 'var(--surface-2)',      color: 'var(--text-muted)' }
```
Forme commune : `padding: 4px 10px; border-radius: var(--radius-pill); font-size: 11px; font-weight: 800; letter-spacing: .045em; text-transform: uppercase`.

**b) Badge de statut local (`AgentUsersClient.tsx`)** — couleurs précalculées (les `var(--*)` ne peuvent pas être concaténées à un suffixe alpha hex) :
```ts
DÉSACTIVÉ:  { color: '#8b8f9c',      border: 'rgba(139,143,156,0.35)', bg: 'rgba(139,143,156,0.14)' }
EN ATTENTE: { color: 'var(--gold)',  border: 'rgba(184,243,74,0.35)',  bg: 'rgba(184,243,74,0.14)' }
REFUSÉ:     { color: 'var(--pink)',  border: 'rgba(224,90,170,0.35)', bg: 'rgba(224,90,170,0.14)' }
ACTIF:      { color: 'var(--primary)', border: 'rgba(184,243,74,0.35)', bg: 'rgba(184,243,74,0.14)' }
```
`font-size: 10.5; font-weight: 700; padding: 2px 8px; border-radius: 8px` (⚠️ **rectangle arrondi, pas pill** — incohérent avec le `Badge.tsx` partagé, à harmoniser).

---

## 9. Icônes

**`lucide-react`** (`^1.27.0`) — seule bibliothèque d'icônes du projet, importée dans 31 fichiers.

Tailles les plus fréquentes : `18` et `14` (27 usages chacune), `16` (19), `32` (13), `15`/`12` (12 chacune), `17` (sidebar dashboard, poids par défaut), `28/36/42/40/38/30/22/20` pour les icônes décoratives/avatar plus grandes.

`strokeWidth` varie avec l'état actif — ex. sidebar : `strokeWidth={active ? 2.2 : 1.8}`, couleur `active ? 'var(--primary)' : 'currentColor'`.

---

## 10. Animations / Transitions

Aucune librairie d'animation — tout en CSS `transition`/`@keyframes`, centralisé dans `globals.css` (commentaire du code : "keyframes globales pour ne pas la redéfinir dans chaque fichier consommateur") :

```css
@keyframes lb-spin { to { transform: rotate(360deg); } }  /* Spinner.tsx — 0.7s linear infinite */
@keyframes lb-skeleton-shimmer {
  0%   { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
```

Durées/easings récurrents : `0.15s ease` (le plus courant — Button/Input/Textarea), `180ms ease` (hover `.lb-card`), `0.1s ease` (press bouton), `0.18s / 0.25s / 0.3s / 0.4s` ponctuellement.

`transition: opacity 0.15s ease, transform 0.1s ease, filter 0.15s ease` (Button.tsx) est le pattern de référence.

`@media (prefers-reduced-motion: reduce)` réduit globalement toutes les animations/transitions à `.01ms` (déclaré deux fois dans `globals.css`).

Lift au survol des cartes : `translateY(-3px)` (`.lb-card:hover`), `translateY(-2px)` (`:focus-visible`).

---

## 11. Primitifs UI (`app/components/ui/`)

| Fichier | Rôle |
|---|---|
| `Accordion.tsx` | Sections repliables |
| `Avatar.tsx` | Avatar circulaire, photo ou initiales — tailles `sm:28 md:36 lg:48 xl:88`px |
| `Badge.tsx` | Pill de statut par ton (§8) |
| `Button.tsx` | **Seul** primitif bouton (§4) |
| `Card.tsx` | Conteneur de surface (§5) |
| `Checkbox.tsx` | Case à cocher custom |
| `EmptyState.tsx` | Bloc état vide, `Mascot` + bordure pointillée `1px dashed rgba(184,243,74,.24)` |
| `IconButton.tsx` | Bouton icône seule, tons `default \| accent \| danger` |
| `Input.tsx` | Champ texte (§6) |
| `Label.tsx` | Label de formulaire |
| `Mascot.tsx` | Mascotte SVG (DJ rond), humeurs `happy \| confused \| sad \| sleeping` — remplace les icônes génériques dans les états vides/erreur |
| `Modal.tsx` | Coquille de modal centrée (overlay + carte + croix), réutilisée par ~12 modals |
| `PageLinks.tsx` | Pagination Server Component (basée `Link`, pour les annuaires publics SSR) |
| `Pagination.tsx` | Pagination Client Component (`onPageChange`) |
| `Radio.tsx` | Bouton radio custom, même pattern que Checkbox |
| `SectionHeader.tsx` | Eyebrow + titre + description, `level` 1-3, `align` gauche/centre |
| `Select.tsx` | Dropdown 100% custom (pas de `<select>` natif), navigation clavier |
| `Skeleton.tsx` | Placeholder de chargement shimmer |
| `SlideOverModal.tsx` | Panneau tiroir ancré à droite (routes parallèles interceptées) |
| `Slider.tsx` | `<input type="range">` stylé, accent `teal \| gold` |
| `Spinner.tsx` | Indicateur de chargement rotatif |
| `Switch.tsx` | Interrupteur on/off custom |
| `Tabs.tsx` | Contrôle segmenté en pill, construit sur `Button` |
| `Textarea.tsx` | Champ multiligne, même pattern invalid/focus que `Input` |
| `Toast.tsx` | Hook `useToast()` + UI toast, types `ok \| err`, auto-dismiss annulable |
| `charts/` | Primitifs de graphiques (sous-dossier dédié) |
| `index.ts` | Barrel export de tout `ui/` |

---

## 12. Logo / Branding

Pas d'asset image — le logo est un texte stylé directement dans `PublicNav.tsx` :
```tsx
<Link href="/home" style={{ fontSize: 17, letterSpacing: '0.12em', color: 'var(--text)', textDecoration: 'none', fontWeight: 800 }}>
  L<span style={{ color: 'var(--text)' }}>|</span>VE IN{' '}
  <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: 'italic', fontWeight: 700 }}>BLACK</span>
</Link>
```
"L|VE IN" en police sans-serif par défaut, "BLACK" en **Playfair Display** italique — seule apparition de cette police dans tout le codebase (déclarée en `fontFamily` inline, pas en token). Aucun logo `/public` (SVG/PNG) référencé dans la nav ou le footer.

Le nom "LIVE IN BLACK" apparaît aussi en texte brut sur les pages légales (`LegalPageLayout.tsx`, filigrane répété ×8) et dans les champs "Logo" upload des profils organisateur (`StudioClient.tsx` — images utilisateur via Cloudinary, sans rapport avec la marque du site elle-même).

**Couleurs de marque** : `--primary` (`#F53D8D`, rose), `--primary-strong` (`#e02d7d`), `--primary-ink` (`#ffffff`), fond `--obsidian` (`#191218`).

---

## Résumé pour un designer

- **Un seul thème** (sombre), pas de mode clair.
- **Rose `#F53D8D` + Rose doux `#FF75AD` + Obsidian `#191218` = palette de marque unique** — lisible et dynamique.
- **Tout est inline-style TypeScript**, jamais de Tailwind ni de CSS modules dans les composants applicatifs.
- **`Button.tsx` est la seule source de vérité pour les boutons** — 5 variantes × 3 tailles, cible tactile 44px minimum partout.
- **Deux implémentations de badge non harmonisées** (pill vs rectangle arrondi) — point à corriger.
- **`lucide-react`** pour toutes les icônes, **`Mascot.tsx`** (SVG maison) pour les états vides/erreur plutôt qu'une icône générique.
- **Breakpoints du projet** : 480 / 620 / 640 / 720 / 780 / 820 / 900 / 1099-1100 / 1400px — pas les paliers Tailwind standards.
- **Accessibilité intégrée au système** : cible tactile 44px, plancher de taille de texte 12.5-13px, focus ring global `var(--primary)`, `prefers-reduced-motion` respecté partout.
