// Stub for `next/image` in design-sync preview builds — same rationale as
// next-link.tsx. Renders a plain <img>, dropping Next's optimization-only
// props (fill/quality/priority/loader) which have no static-render meaning.
import * as React from 'react'

type ImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string
  fill?: boolean
  quality?: number
  priority?: boolean
  loader?: unknown
  unoptimized?: boolean
}

const Image = React.forwardRef<HTMLImageElement, ImageProps>(function Image(
  { fill, quality, priority, loader, unoptimized, alt, ...rest },
  ref,
) {
  return <img ref={ref} alt={alt ?? ''} {...rest} />
})

export default Image
