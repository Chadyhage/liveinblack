# Design system LIVEINBLACK

Extraction fidèle du design system réel de l'app (`app/globals.css` + `app/components/ui/*`), packagée pour être exploitable directement par les outils de design de Claude (Figma MCP, génération de maquettes/artifacts) sans avoir à relire tout le code applicatif à chaque fois.

**Ce dossier ne redéfinit rien** — c'est un miroir documentaire du code source, régénéré depuis lui. En cas de divergence, le code (`app/globals.css`, `app/components/ui/`) est toujours la source de vérité, jamais ce dossier.

## Contenu

| Fichier | Contenu |
|---|---|
| [`tokens.json`](tokens.json) | Couleurs, radius, spacing, typographie, ombres, z-index, motion — format JSON machine-lisible (style [Design Tokens Community Group](https://design-tokens.github.io/community-group/format/)), pensé pour être importé par un outil (Figma variables, générateur de thème, etc.) |
| [`components.md`](components.md) | Inventaire des primitives `app/components/ui/*` : variants, tailles, règles d'usage |
| [`patterns.md`](patterns.md) | Classes de mise en page globales (`.lb-*`) : grilles, largeurs de page, breakpoints |

## Comment l'utiliser avec les outils design de Claude

- **Génération de maquette Figma depuis ce code** (`figma-generate-design` / `figma-use`) : partir de `tokens.json` pour les variables de couleur/spacing/radius, et de `components.md` pour les variants de composants avant de créer des frames — évite d'inventer une palette ou des rayons de bordure qui n'existent pas dans l'app réelle.
- **Implémentation d'une maquette Figma vers ce code** (`figma-design-to-code`) : mapper chaque couleur/espacement Figma vers le token `tokens.json` correspondant (`var(--primary)`, `var(--radius-lg)`, etc.) plutôt que des valeurs codées en dur, et réutiliser un composant de `components.md` existant avant d'en écrire un nouveau.
- **Diagrammes/artifacts ponctuels** (`artifact-design`) : mêmes tokens de couleur pour rester visuellement cohérent avec l'app si un artifact doit "ressembler à LIVEINBLACK".

## Règles non négociables du projet (rappel, voir `CLAUDE.md`)

1. **Pas de Tailwind dans les composants applicatifs** — uniquement `style={{}}` inline + `var(--*)`. Tailwind reste importé pour quelques classes utilitaires de layout sur `<html>/<body>` uniquement.
2. **Jamais de `<button>`/`<input>` brut stylé inline** — toujours les composants de `app/components/ui/`.
3. Un seul token de couleur d'accent (`--primary`) — les alias `--teal`/`--gold`/`--violet` existent pour compatibilité avec du code plus ancien mais ne doivent plus être introduits dans du nouveau code.
4. `CLAUDE.md` documente encore l'**ancienne** palette — ces valeurs sont obsolètes, `app/globals.css` (et donc `tokens.json` ici) fait foi. À corriger dans `CLAUDE.md` à l'occasion.

## Maintenance

Si `app/globals.css` ou un composant de `app/components/ui/` change de façon significative (nouveau token, nouveau variant, valeur modifiée), régénérer les fichiers concernés de ce dossier dans la foulée plutôt que de laisser diverger — sinon ce dossier devient trompeur plutôt qu'utile.
