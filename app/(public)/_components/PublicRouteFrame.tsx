'use client'

import type { CSSProperties, ReactNode } from 'react'
import { usePathname } from 'next/navigation'

const PUBLIC_BACKGROUNDS: Array<{ matches: (pathname: string) => boolean; image: string; position?: string }> = [
  { matches: (pathname) => pathname === '/home', image: '/images/live-in-black/route-home-night-boulevard.png', position: '58% center' },
  { matches: (pathname) => pathname.startsWith('/events'), image: '/images/live-in-black/route-events-scanner-gates.png', position: 'center 38%' },
  { matches: (pathname) => pathname.startsWith('/providers'), image: '/images/live-in-black/route-providers-equipment-corridor.png', position: 'center 30%' },
  { matches: (pathname) => pathname.startsWith('/organizers'), image: '/images/live-in-black/route-organizers-vip-table.png', position: 'center 30%' },
  { matches: (pathname) => pathname === '/about', image: '/images/live-in-black/about-nightlife-planning.png', position: 'center 34%' },
  { matches: (pathname) => pathname.startsWith('/blog'), image: '/images/live-in-black/route-blog-editorial-desk.png', position: 'center 38%' },
  { matches: (pathname) => pathname === '/contact', image: '/images/live-in-black/contact-support-lounge.png', position: 'center 30%' },
  { matches: (pathname) => pathname === '/cookies', image: '/images/live-in-black/route-cookies-consent-glass.png', position: 'center 38%' },
  { matches: (pathname) => pathname === '/privacy', image: '/images/live-in-black/route-privacy-secure-vault.png', position: 'center 38%' },
  { matches: (pathname) => pathname === '/terms', image: '/images/live-in-black/route-terms-contract-table.png', position: 'center 38%' },
  { matches: (pathname) => pathname === '/legal-notice', image: '/images/live-in-black/route-legal-notice-signature.png', position: 'center 38%' },
  { matches: (pathname) => pathname === '/organizer-signup', image: '/images/live-in-black/directory-organizers-guestlist.png', position: 'center 28%' },
  { matches: (pathname) => pathname === '/provider-signup', image: '/images/live-in-black/directory-providers-production.png', position: 'center 28%' },
  { matches: (pathname) => pathname === '/login', image: '/images/live-in-black/auth-client-ticket-entry.png', position: 'center 30%' },
  { matches: (pathname) => pathname === '/reset-password', image: '/images/live-in-black/account-secure-ticket-wallet.png', position: 'center 30%' },
  { matches: (pathname) => pathname === '/verify-email', image: '/images/live-in-black/success-ticket-confirmation.png', position: 'center 34%' },
  { matches: (pathname) => pathname === '/confirmer-email', image: '/images/live-in-black/legal-privacy-secure-docs.png', position: 'center 34%' },
  { matches: (pathname) => pathname === '/payment-success', image: '/images/live-in-black/route-payment-success-confetti.png', position: 'center 38%' },
  { matches: (pathname) => pathname === '/boost-active', image: '/images/live-in-black/route-boost-active-spotlight.png', position: 'center 38%' },
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
