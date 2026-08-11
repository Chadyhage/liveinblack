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

// Batch 3 — app/components/*.tsx components that DO have fetch logic, but
// only on user interaction (not on mount) — safe to render statically from
// realistic initial props, same as batch 1/2. Mount-fetching components
// (ResaleListingsSection, VerifyEmailClient, ConfirmEmailChangeClient,
// BoostActiveClient) are deferred — see NOTES.md "Batch 3".
export { default as EventInterestButtonClient } from '../app/components/EventInterestButtonClient'
export { default as OrganizerFollowButtonClient } from '../app/components/OrganizerFollowButtonClient'
export { default as ProviderReviewsClient } from '../app/components/ProviderReviewsClient'
export { default as PublicProfileActions } from '../app/components/PublicProfileActions'
export { default as ResetPasswordClient } from '../app/components/ResetPasswordClient'
export { default as OrganizerOnboardingWizard } from '../app/components/OrganizerOnboardingWizard'
export { default as PrestataireOnboardingWizard } from '../app/components/PrestataireOnboardingWizard'

// Batch 4 — the remaining app/components/*.tsx: ProviderCatalogInquiry
// (unblocked by the lib/shared/diacritics.ts fix) plus the 4 components
// that DO fetch on mount, previewed via .design-sync/previews/_mockFetch.tsx
// (window.fetch patched at story-module eval time, before the component's
// own useEffect fires). This closes out all 37 app/components/*.tsx.
export { default as ProviderCatalogInquiry } from '../app/components/ProviderCatalogInquiry'
export { default as ResaleListingsSection } from '../app/components/ResaleListingsSection'
export { default as VerifyEmailClient } from '../app/components/VerifyEmailClient'
export { default as ConfirmEmailChangeClient } from '../app/components/ConfirmEmailChangeClient'
export { default as BoostActiveClient } from '../app/components/BoostActiveClient'
