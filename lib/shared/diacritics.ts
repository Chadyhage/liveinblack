// Shared accent-stripping helper — factored out of locations.ts, boosts.ts,
// money.ts, organizerProfileValidation.ts, providerBillingRegion.ts, and
// recommendations.ts, which each had their own copy of the same
// normalize-then-strip-combining-marks pair.
//
// The combining-diacritical-marks range (Unicode block U+0300-U+036F) is
// built from character codes rather than a literal character-class range
// on purpose: the previous inline literal (the raw combining characters
// typed directly inside a bracket expression) parsed fine in this app's
// real Next.js/SWC build, but esbuild's own parser/printer — used by the
// design-sync converter (claude.ai/design) — mis-handled that exact byte
// sequence ("Invalid regular expression: Range out of order in character
// class"), even though the codepoints are correctly ordered. Building the
// range from String.fromCharCode sidesteps the whole class of encoding
// footguns (both esbuild's bug and the risk of a tool silently
// re-normalizing the literal characters again later) without changing
// behavior at all — same codepoints, same regex semantics.
const COMBINING_MARKS_START = 0x300
const COMBINING_MARKS_END = 0x36f
const COMBINING_MARKS_RE = new RegExp(
  `[${String.fromCharCode(COMBINING_MARKS_START)}-${String.fromCharCode(COMBINING_MARKS_END)}]`,
  'g'
)

export function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(COMBINING_MARKS_RE, '')
}
