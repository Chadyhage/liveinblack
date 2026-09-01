'use client'

import type { CSSProperties, ReactNode } from 'react'
import { usePathname } from 'next/navigation'

const PUBLIC_BACKGROUNDS: Array<{ matches: (pathname: string) => boolean; image: string; position?: string }> = [
  { matches: (pathname) => pathname === '/home', image: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1920&q=80', position: '58% center' },
  { matches: (pathname) => pathname.startsWith('/events'), image: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1920&q=80', position: 'center 38%' },
  { matches: (pathname) => pathname.startsWith('/providers'), image: 'https://images.unsplash.com/photo-1598387993441-a364f854c3e1?auto=format&fit=crop&w=1920&q=80', position: 'center 30%' },
  { matches: (pathname) => pathname.startsWith('/organizers'), image: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1920&q=80', position: 'center 30%' },
  { matches: (pathname) => pathname === '/about', image: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=1920&q=80', position: 'center 34%' },
  { matches: (pathname) => pathname.startsWith('/blog'), image: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1920&q=80', position: 'center 38%' },
  { matches: (pathname) => pathname === '/contact', image: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1920&q=80', position: 'center 30%' },
  { matches: (pathname) => pathname === '/cookies', image: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1920&q=80', position: 'center 38%' },
  { matches: (pathname) => pathname === '/privacy', image: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1920&q=80', position: 'center 38%' },
  { matches: (pathname) => pathname === '/terms', image: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1920&q=80', position: 'center 38%' },
  { matches: (pathname) => pathname === '/legal-notice', image: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1920&q=80', position: 'center 38%' },
  { matches: (pathname) => pathname === '/organizer-signup', image: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1920&q=80', position: 'center 28%' },
  { matches: (pathname) => pathname === '/provider-signup', image: 'https://images.unsplash.com/photo-1598387993441-a364f854c3e1?auto=format&fit=crop&w=1920&q=80', position: 'center 28%' },
  { matches: (pathname) => pathname === '/login', image: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1920&q=80', position: 'center 30%' },
  { matches: (pathname) => pathname === '/reset-password', image: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1920&q=80', position: 'center 30%' },
  { matches: (pathname) => pathname === '/verify-email', image: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1920&q=80', position: 'center 34%' },
  { matches: (pathname) => pathname === '/confirmer-email', image: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=1920&q=80', position: 'center 34%' },
  { matches: (pathname) => pathname === '/payment-success', image: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1920&q=80', position: 'center 38%' },
  { matches: (pathname) => pathname === '/boost-active', image: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1920&q=80', position: 'center 38%' },
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
