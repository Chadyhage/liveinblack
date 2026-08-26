'use client'

import { track } from '@vercel/analytics/react'
import { allowsAnalytics } from '@/lib/shared/cookieConsent'

type GrowthEventProperties = Record<string, string | number | boolean | null | undefined>

declare global {
  interface Window {
    gtag?: (command: 'event', eventName: string, properties?: GrowthEventProperties) => void
  }
}

export const GROWTH_EVENT_NAMES = {
  ctaClick: 'cta_click',
  searchSubmit: 'search_submit',
  eventSelectTicket: 'event_select_ticket',
  checkoutStart: 'checkout_start',
  seatHoldStart: 'seat_hold_start',
  professionalApplicationSubmit: 'professional_application_submit',
} as const

export type GrowthEventName = (typeof GROWTH_EVENT_NAMES)[keyof typeof GROWTH_EVENT_NAMES]

export function trackGrowthEvent(name: GrowthEventName, properties: GrowthEventProperties = {}) {
  const safeProperties = Object.fromEntries(
    Object.entries(properties).filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value) || value === null)
  ) as GrowthEventProperties

  track(name, safeProperties)

  if (allowsAnalytics() && typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag('event', name, safeProperties)
  }
}
