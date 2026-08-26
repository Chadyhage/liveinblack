'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { GROWTH_EVENT_NAMES, trackGrowthEvent, type GrowthEventName } from '@/lib/client/growthAnalytics'

function readDataset(element: Element, key: string): string | undefined {
  const value = element.getAttribute(`data-growth-${key}`)
  return value?.trim() || undefined
}

export default function GrowthAnalytics() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const query = searchParams.get('q')?.trim() || ''

  useEffect(() => {
    if (pathname !== '/search' || query.length < 2) return
    trackGrowthEvent(GROWTH_EVENT_NAMES.searchSubmit, {
      query_length: Math.min(query.length, 120),
      surface: 'public_search_page',
    })
  }, [pathname, query])

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target.closest('[data-growth-event]') : null
      if (!target) return
      const eventName = readDataset(target, 'event') as GrowthEventName | undefined
      if (!eventName) return

      trackGrowthEvent(eventName, {
        surface: readDataset(target, 'surface') || 'unknown',
        target: readDataset(target, 'target') || null,
        href: target instanceof HTMLAnchorElement ? target.href : null,
      })
    }

    document.addEventListener('click', handleClick, { capture: true })
    return () => document.removeEventListener('click', handleClick, { capture: true })
  }, [])

  return null
}
