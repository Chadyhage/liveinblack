## LIVEINBLACK UI — build conventions

**No provider, no wrapper.** There is no theme/context provider in this
library (verified: none of the 30 exports is named `*Provider`, and the
bundle needs no root wrap to render correctly). Tokens are plain CSS custom
properties defined once in `styles.css` (imported by every design
automatically) — any component works the instant it's dropped in.

**Single dark theme — always compose on a dark surface.** This is not a
light/dark-switchable system: every component's text and border colors
(`--text`, `--text-muted`, `Button variant="secondary"`/`"ghost"`, `Badge`,
etc.) are authored assuming a dark backdrop. Wrap every composition's root
in `background: var(--obsidian)` (page background) or `var(--surface)` /
`var(--surface-2)` (card/modal background) — never leave it on a plain white
page, text will be illegible.

**Styling idiom: CSS custom properties via inline `style`, never
utility/CSS classes.** This library ships zero class names to build with —
don't invent `lib-btn-primary`-style classes, they don't exist and won't
resolve. Compose with `style={{ ... }}` and reference tokens as
`var(--token-name)`. Real token vocabulary (from `styles.css` / `tokens/`):

- **Surfaces**: `--obsidian` (page bg), `--surface` (cards), `--surface-2`
  (modals/menus)
- **Accent colors**: `--primary` / `--primary-strong` / `--primary-ink`
  (current single-green brand accent), plus legacy-named aliases still in
  active use throughout components: `--teal`, `--gold`, `--pink`, `--violet`
- **Text**: `--text` (primary, near-white), `--text-muted`, `--text-faint`
- **Borders**: `--border`, `--border-strong`
- **Radius**: `--radius-sm` / `-md` / `-lg` / `-xl` / `-pill`
- **Spacing scale**: `--space-1` … `--space-6`
- **Fonts**: `--font-open-sans` (body/interface), `--font-display`
  (headings — visually condensed/uppercase), `--font-montserrat` (h4-h6)
- **Z-index layers**: `--z-nav`, `--z-modal`, `--z-sheet`, `--z-floating`

**Where the truth lives.** Read `styles.css` (imports `_ds_bundle.css`,
which carries every token above plus each component's own CSS) before
styling anything — it's the same stylesheet every rendered design gets.
Each component's `components/<group>/<Name>/<Name>.prompt.md` documents its
exact prop API with real usage examples; read it before composing that
component rather than guessing prop names.

**Component groups**: `general` (27 components — buttons, form fields,
cards, overlays, feedback) and `charts` (`DonutChart`, `LineChartCard` —
Recharts-based, both take typed data arrays, never raw Recharts JSX).

**One verified build snippet** (adapted from `Button`'s graded preview —
`variant`s are `primary | secondary | danger | ghost | link`, `size`s are
`sm | md | lg`):

```tsx
<div style={{ background: 'var(--obsidian)', padding: 24, borderRadius: 'var(--radius-lg)' }}>
  <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
    <Button variant="primary">Réserver ma place</Button>
    <Button variant="secondary">Voir le programme</Button>
    <Button variant="ghost" icon={<MapPin size={15} />}>Voir sur la carte</Button>
  </div>
</div>
```

Buttons, inputs, and most interactive components render at a `minHeight: 44`
tap target by convention — don't override it down. Icons are composed as
children/`icon` props, not baked into the component (this library imports
`lucide-react` for icons; use the same package when composing new icons
alongside these components).
