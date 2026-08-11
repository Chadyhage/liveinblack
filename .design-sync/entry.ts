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
