'use client'

import type { CSSProperties, ReactNode } from 'react'
import { usePathname } from 'next/navigation'

const PUBLIC_BACKGROUNDS: Array<{ matches: (pathname: string) => boolean; image: string; position?: string }> = [
  { matches: (pathname) => pathname === '/home', image: '/images/live-in-black/hero-nightlife.jpg', position: '58% center' },
  { matches: (pathname) => pathname.startsWith('/events'), image: '/images/live-in-black/journey-enter.jpg', position: 'center 38%' },
  { matches: (pathname) => pathname.startsWith('/providers'), image: '/images/live-in-black/auth-provider.jpg', position: 'center 30%' },
  { matches: (pathname) => pathname.startsWith('/organizers'), image: '/images/live-in-black/auth-organizer.jpg', position: 'center 30%' },
  { matches: (pathname) => pathname === '/about', image: '/images/live-in-black/journey-discover.jpg', position: 'center 34%' },
  { matches: (pathname) => pathname.startsWith('/blog'), image: '/images/live-in-black/journey-reserve.jpg', position: 'center 38%' },
  { matches: (pathname) => pathname === '/contact', image: '/images/live-in-black/auth-community.jpg', position: 'center 30%' },
  { matches: (pathname) => pathname === '/cookies' || pathname === '/privacy', image: '/images/live-in-black/journey-reserve.jpg', position: 'center 38%' },
  { matches: (pathname) => pathname === '/terms' || pathname === '/legal-notice', image: '/images/live-in-black/journey-discover.jpg', position: 'center 38%' },
  { matches: (pathname) => pathname === '/organizer-signup', image: '/images/live-in-black/auth-organizer.jpg', position: 'center 28%' },
  { matches: (pathname) => pathname === '/provider-signup', image: '/images/live-in-black/auth-provider.jpg', position: 'center 28%' },
  { matches: (pathname) => ['/login', '/reset-password', '/verify-email', '/confirmer-email'].includes(pathname), image: '/images/live-in-black/auth-community.jpg', position: 'center 30%' },
  { matches: (pathname) => pathname === '/payment-success' || pathname === '/boost-active', image: '/images/live-in-black/journey-enter.jpg', position: 'center 38%' },
]

export default function PublicRouteFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const background = PUBLIC_BACKGROUNDS.find((item) => item.matches(pathname)) ?? PUBLIC_BACKGROUNDS[0]
  const style = {
    '--lb-public-background-image': `url('${background.image}')`,
    '--lb-public-background-position': background.position ?? 'center',
  } as CSSProperties

  return <div className="lb-public-layout" style={style}>{children}</div>
}
