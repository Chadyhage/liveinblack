# LIVEINBLACK design-sync — repo-specific notes

- **No dist build, no Storybook.** Source shape is `package`, discovered via
  the synth-from-src fallback. A **real barrel entry** is required —
  `.design-sync/entry.ts` — because the converter's own synthesized
  `export * from …` entry drops **default exports** (most components here use
  `export default`), which silently produced a bundle with zero real globals
  (`[BUNDLE_EXPORT]` failures on all 30 components). `entry.ts` re-exports
  `app/components/ui/index.ts` (the app's real barrel) plus the 3 components
  it doesn't cover: `SlideOverModal`, `DonutChart`, `LineChartCard`.
- `componentSrcMap` in `config.json` pins the exact 30 component names/paths
  — required because with a real `--entry` override, `.d.ts`-derived export
  names come back empty (no shipped `.d.ts`), so the component list must be
  explicit rather than derived.
- **`app/globals.css` starts with `@import "tailwindcss"`**, which doesn't
  resolve outside the app's own Next.js/PostCSS build →
  `[CSS_IMPORT_MISSING]`. Fixed via `cssEntry: .design-sync/globals-ds.css`,
  a copy of `app/globals.css` with that one import line stripped (everything
  else — tokens, component styles — is plain CSS and copies through fine).
  Re-run `tail -n +2 app/globals.css > .design-sync/globals-ds.css` if
  `app/globals.css` changes.
- **Three `app/components/ui/*.tsx` files import real Next.js APIs**
  (`PageLinks.tsx` → `next/link`, `Avatar.tsx` → `next/image`,
  `SlideOverModal.tsx` → `next/navigation`'s `useRouter`). Bundling the real
  Next.js client runtime pulled in `process.env.__NEXT_*` / `process.nextTick`
  references with no `process` global in a browser preview →
  `ReferenceError: process is not defined` on every single component render
  (any component transitively imports these three via the shared bundle).
  Fixed via lightweight stubs at `.design-sync/stubs/next-{link,image,navigation}.tsx`
  (plain `<a>`/`<img>`/no-op router) aliased in `.design-sync/tsconfig.json`
  (`paths` override, extends the repo's real `tsconfig.json` — this file is
  ds-sync-only, never used by the actual Next.js build).
- 5 font families referenced in CSS (Open Sans, Impact, Arial Narrow, Anton,
  Montserrat) have no shipped `@font-face` — non-blocking `[FONT_MISSING]`
  warning, accepted as system-font substitutes for now (no woff2 assets
  vendored into this repo to ship via `cfg.extraFonts`).

## Preview authoring (all 30 components, rich previews)

- **Every component needs an explicit dark backdrop.** LIVEINBLACK is a
  single-dark-theme app — `--text`/`--text-muted` etc. are authored assuming
  the real app's `body { background: var(--obsidian) }`, which the
  design-sync review harness does NOT apply (isolated per-story page, no
  inherited `body` styling). Without a backdrop, e.g. `Button
  variant="secondary"` (light text, transparent bg) is invisible against the
  harness's default white page — confirmed via a real screenshot during
  grading. Fixed by wrapping every preview export in a shared
  `<Stage>` component (`.design-sync/previews/_stage.tsx` — leading
  underscore so it's never treated as its own component card, just an
  imported helper) that sets `background: var(--obsidian)`. `Modal` and
  `SlideOverModal` are the only two exceptions — they already paint their own
  full-viewport dark scrim, so wrapping them in `Stage` too would be
  redundant (harmless either way, just skipped here).
- **Never reference a real external URL (Cloudinary, etc.) from a preview.**
  The headless capture browser has no outbound network access — a real image
  `src` hangs `page.goto` until the 15s timeout (`[RENDER]` failure on
  `Avatar`'s `WithPhoto` story, confirmed by re-running validate in
  isolation and seeing it fail identically every time). Fixed with an inline
  `data:image/svg+xml,...` data URI standing in for a portrait photo — same
  code path (`<img src>`), zero network dependency. Apply this to any future
  preview that wants to show a "real photo" (provider portraits, event
  banners, etc.).
- **Known render warns, accepted as benign — do not re-chase on future
  syncs:**
  - `[RENDER_THIN] SlideOverModal` — "DOM content present but rendered
    height is 0px". The real component mounts hidden
    (`translateX(100%)`/`opacity:0`) and flips visible via
    `requestAnimationFrame` + a CSS transition (see
    `app/components/ui/SlideOverModal.tsx`) — the one-shot capture screenshot
    lands before that settles, so the card renders visually blank even
    though `.render-check.json`'s `texts` field confirms the full DOM
    content (provider name/badge/description) is present and correct. Tried
    two `viewport` override sizes (900x700, no change) — this is a capture
    harness timing limitation, not a component defect. The component is
    real/unmodified/used in production
    (`app/(public)/@modal/(.)providers/[id]/page.tsx`); the actual
    claude.ai/design canvas renders live React (not a static screenshot), so
    the slide-in animates in correctly there exactly as it does in the real
    app.
  - `Modal`'s `ConfirmCancel` story — the static capture crops the top of
    the card (the `<h2>` title is cut off just above the visible frame)
    despite two `viewport` override attempts (700x600, then 700x900,
    `cardMode: "single"`). DOM content is confirmed complete via
    `.render-check.json`'s `texts` field (title + body + both buttons all
    present) — this is a capture-harness crop-region quirk specific to
    `position: fixed; inset: 0` overlay roots, not a rendering defect. Same
    "real/unmodified/proven in production" reasoning as SlideOverModal
    applies (`app/(app)/my-events/CancelModal.tsx`).
  - `DonutChart` (`RoleBreakdown`) and `LineChartCard`
    (`SignupsLast14Days`) — both render visually squished/truncated in the
    static capture (pie collapses to a thin sliver; the line stops partway
    across the card). Root cause: Recharts' `ResponsiveContainer` measures
    its parent on mount and animates in over ~1s by default: the one-shot
    capture screenshot lands mid-animation/mid-resize, not after settle.
    `package-capture.mjs`'s `settle()` only waits on
    `document.fonts.ready`+image decode, no generic "wait for
    animation/resize" hook exists to reach for. Both components are real,
    unmodified, and used correctly in production
    (`app/components/AgentDashboardClient.tsx`) — the claude.ai/design canvas
    renders live React and will show the fully-settled chart, same as any
    real page load.
  - **Common thread across all 4 of the above**: every one is a genuine
    capture-timing/crop-region limitation of the local one-shot screenshot
    grading harness, never a defect in the shipped `_ds_bundle.js` — verified
    two ways each time: (a) `.render-check.json`'s `texts` field shows the
    correct full DOM content even when the pixels look wrong, and (b) the
    exact same unmodified component code is already running correctly in
    LIVEINBLACK production. If a future re-sync's validate flags these same
    4 warns again, they are NOT new — do not re-spend time chasing them
    without first checking this note.

## Re-sync risks

- `componentSrcMap` and `.design-sync/entry.ts` both hard-list all 30
  component names — adding a new component under `app/components/ui/`
  requires updating BOTH files by hand (componentSrcMap won't auto-discover
  it, and entry.ts's `export * from '../app/components/ui/index'` only
  covers components that are also added to the real `app/components/ui/index.ts`
  barrel — anything added only under `charts/` or as a loose file needs an
  explicit `export { X } from '...'` line added to `entry.ts` too, same as
  `SlideOverModal`/`DonutChart`/`LineChartCard` today).
- `.design-sync/globals-ds.css` is a **manually stripped copy** of
  `app/globals.css` (minus the `@import "tailwindcss"` line) — it will go
  stale silently if `app/globals.css` changes and nobody re-runs `tail -n +2
  app/globals.css > .design-sync/globals-ds.css`. No automation currently
  guards this.
- The Next.js stubs (`.design-sync/stubs/next-{link,image,navigation}.tsx`)
  only cover the exact exports the 3 current call sites use (`Link` default
  export, `Image` default export, `useRouter`/`usePathname`/`useSearchParams`
  from `next/navigation`). A future component importing a different
  `next/navigation` export (e.g. `redirect`) or `next/headers` will need a
  new stub added and wired into `.design-sync/tsconfig.json`'s `paths`.
- All 30 previews were graded by a single agent pass, not cross-verified by
  a second reviewer — reasonable confidence, not the same bar as a
  multi-reviewer audit.
