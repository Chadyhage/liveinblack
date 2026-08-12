// Stub for `next/link` in design-sync preview builds. The real component
// wires client-side routing into the Next.js runtime, which pulls in a large
// chunk of Next's browser code (referencing process.env.__NEXT_* /
// process.nextTick) — none of that exists in a static preview render, so
// swap it for a plain anchor. Behavior for our components (Button/PageLinks
// usage) only cares about href + children + className/style/onClick.
import * as React from 'react'

type LinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string
  prefetch?: boolean
  replace?: boolean
  scroll?: boolean
  shallow?: boolean
}

const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, prefetch, replace, scroll, shallow, ...rest },
  ref,
) {
  return <a ref={ref} href={href} {...rest} />
})

export default Link
