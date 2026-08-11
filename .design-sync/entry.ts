// Real barrel entry for the design-sync bundle build.
// index.ts (app/components/ui/index.ts) covers most components but not
// SlideOverModal or the charts/ subfolder — mirrored here explicitly with
// `export { default as X }` so default exports actually land as named
// globals on window.LiveInBlackUI (a synthesized `export * from …` entry
// silently drops default exports — that's the root cause of the
// [BUNDLE_EXPORT] failures from the first build attempt).
export * from '../app/components/ui/index'
export { default as SlideOverModal } from '../app/components/ui/SlideOverModal'
export { DonutChart } from '../app/components/ui/charts/DonutChart'
export { LineChartCard } from '../app/components/ui/charts/LineChartCard'

// Batch 2 — presentational-only app/components/*.tsx (no network fetch on
// mount, safe to render statically). Fetch-based components (25 of the 37
// in app/components/) and the *Client.tsx page screens are a separate,
// larger batch — see .design-sync/NOTES.md "Re-sync risks" for the full
// componentSrcMap-mirroring rule this entry file follows.
export { default as ResetCookieConsentButton } from '../app/components/ResetCookieConsentButton'
export { default as LegalBackButton } from '../app/components/LegalBackButton'
export { default as AgeVerificationGate } from '../app/components/AgeVerificationGate'
export { default as ImageCropperModal } from '../app/components/ImageCropperModal'
export { Stars, StarInput } from '../app/components/StarRating'
export { default as AgeGateModal } from '../app/components/AgeGateModal'
export { default as CookieConsentBanner } from '../app/components/CookieConsentBanner'
export { default as LegalPageLayout } from '../app/components/LegalPageLayout'
// ProviderCatalogInquiry deliberately excluded (componentSrcMap: null) —
// see NOTES.md "Batch 2" for why.
