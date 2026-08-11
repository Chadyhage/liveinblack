// Shared backdrop for preview stories — NOT a component name (leading `_`),
// never compiled as its own card, only imported by other previews here.
//
// LIVEINBLACK is a single dark-theme app: every component's text/border
// tokens (--text, --text-muted, the `secondary`/`ghost` Button variants,
// etc.) are authored assuming the app's own dark `body` background
// (--obsidian). The design-sync review harness renders each story in an
// isolated page that does NOT inherit that body styling, so without an
// explicit dark backdrop here, light-on-transparent text (e.g. Button
// variant="secondary") is invisible against the harness's default white
// page — confirmed via ds-bundle/_screenshots/review/general__Button.png
// during grading. Wrapping every story in this Stage keeps previews
// legible and representative of real in-app usage.
import type { ReactNode } from 'react'

export function Stage({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'var(--obsidian)', padding: 24, borderRadius: 12, ...style }}>
      {children}
    </div>
  )
}
