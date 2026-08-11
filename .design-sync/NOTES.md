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

## Batch 2 (web) — `@/app/components/ui` directory-import resolver bug

The converter's `tsconfigPathsPlugin` (`.ds-sync/lib/bundle.mjs`) resolves a
path-alias hit by trying extensions in this order: `''`, `.ts`, `.tsx`, …,
`/index.ts`, … . For a wildcard rule like `"@/*": ["../*"]`, an import of
`@/app/components/ui` (the real barrel *directory*, not a file) matches the
`''` extension first via `existsSync(dir) === true` and returns the
directory path itself — esbuild then fails with `Cannot read file
"app/components/ui": is a directory`, because the loop never gets to try
`/index.ts`. Hit this the moment a batch-2 component
(`ResetCookieConsentButton.tsx` etc.) imported `Button` from
`@/app/components/ui` instead of a relative `./Button` path (everything in
batch 1 used relative imports, so this never came up before).

**Not a `lib/bundle.mjs` bug worth forking** (that file is on the
never-fork list) — fixed at the config layer instead:
`.design-sync/tsconfig.json`'s `paths` now lists an EXACT (non-wildcard)
rule for `@/app/components/ui` pointing straight at
`../app/components/ui/index`, placed **before** the `@/*` wildcard rule.
Rule order matters here: the resolver tries rules in the JSON object's key
order and returns on the first one that resolves, so the exact rule wins
before the wildcard ever gets a chance to mis-hit the directory. If a
future component barrel-imports another directory the same way (e.g.
`@/lib/server` or `@/app/components` itself), add another exact rule ahead
of `@/*` the same way — don't fork `lib/bundle.mjs`.

**Batch 2 outcome**: 9/10 candidate presentational `app/components/*.tsx`
shipped (30 → 39 total). `ProviderCatalogInquiry` excluded
(`componentSrcMap: null`) — it transitively imports `lib/shared/money.ts`,
which has a Unicode combining-mark character class written as literal UTF-8
combining characters (not `̀-ͯ` escapes) that esbuild's own
parser/printer mis-handles ("Invalid regular expression: Range out of order
in character class") even though the codepoints (U+0300-U+036F) are
correctly ordered — confirmed by inspecting the raw bytes. This is an
esbuild quirk with this exact literal-combining-mark regex style, not an
app bug; several other `lib/shared/*.ts` files use the identical pattern
(`locations.ts`, `providerBillingRegion.ts`, `recommendations.ts`,
`organizerProfileValidation.ts`, `boosts.ts`, `showOptions.ts`) and will
hit the same wall the moment any of THEM gets transitively pulled into a
synced component. If a future batch needs one of those components, the
practical fix is a `.design-sync/overrides/` fork of whichever lib file
does the transitive pulling — NOT touching the real `lib/shared/*.ts`
files themselves (they work fine in the app's real Next.js/SWC build; this
is purely a converter-toolchain incompatibility).

`LegalBackButton` and `CookieConsentBanner` shipped as floor cards (fully
functional, unauthored) rather than forced previews:
- `LegalBackButton` renders with genuinely invisible colors
  (`rgba(11,11,18,*)` — near-black bg/icon) on the app's real dark
  `var(--obsidian)` page background — a real app bug, not a preview
  mistake (flagged separately via spawn_task for a code fix, not silently
  patched here).
- `CookieConsentBanner` mounts with an empty DOM (returns `null`) for the
  first 800ms (real timer-gated first-paint, not a screenshot-timing crop
  like the SlideOverModal/Modal/AgeGateModal cases) — the capture harness
  has no way to wait past that, so the floor card is the honest choice
  here rather than fighting the timing.

`AgeGateModal`'s `EighteenPlus` story hits the exact same fixed-overlay
top-crop quirk as `Modal`'s `ConfirmCancel` (see the CSS_IMPORT_MISSING/
BUNDLE_EXPORT entry above) — same verdict (graded `good`, DOM content
confirmed complete via `.render-check.json`'s `texts` field), same non-fix
(nothing to fix, it's the harness's crop region on
`position:fixed;inset:0` roots).

## Batch 3 (web) — fixed the money.ts regex bug at the source

7 more `app/components/*.tsx` components synced (39 → 46):
`EventInterestButtonClient`, `OrganizerFollowButtonClient`,
`ProviderReviewsClient`, `PublicProfileActions`, `ResetPasswordClient`,
`OrganizerOnboardingWizard`, `PrestataireOnboardingWizard` — all
props-driven, fetch only on user interaction (not on mount), same pattern
as batches 1-2.

`PrestataireOnboardingWizard` transitively imports `lib/shared/money.ts`
— the exact same esbuild-breaking combining-mark regex documented under
Batch 2 above. This time, rather than excluding another component,
**fixed the root cause**: extracted a shared `lib/shared/diacritics.ts`
(`stripDiacritics()`) that builds the U+0300-U+036F combining-marks range
from `String.fromCharCode` instead of a literal character-class range —
byte-for-byte identical regex semantics, just a spelling esbuild's
parser/printer doesn't choke on. Updated all 6 affected files
(`locations.ts`, `boosts.ts`, `money.ts`, `organizerProfileValidation.ts`,
`providerBillingRegion.ts`, `recommendations.ts`) to use it. Verified
zero behavior change: `npx tsc --noEmit -p .` clean, full `npx vitest run`
206/206 passing (same count as before the change), before touching
anything design-sync-side. This unblocks `ProviderCatalogInquiry` (batch 2's
exclusion) for a future batch too — it wasn't re-included here to keep this
batch's diff scoped to what was actually tested this round, but nothing
should block it now.

**Editing note for future syncs**: don't type the raw combining-mark
characters (U+0300-U+036F) directly into any file in this repo, including
comments — several editing attempts in this session had the literal
characters silently reappear when typed via prose/escape-sequence text,
which is exactly the failure mode this fix eliminates. If a similar
Unicode range is ever needed again, build it from `String.fromCharCode`/
`.codePointAt()` the way `diacritics.ts` does, never as a literal
character-class range.
