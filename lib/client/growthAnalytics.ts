'use client'

import { track } from '@vercel/analytics/react'
import { allowsAnalytics } from '@/lib/shared/cookieConsent'

type GrowthEventProperties = Record<string, string | number | boolean | null | undefined>
type SearchParamReader = Pick<URLSearchParams, 'get'>
type GrowthAttribution = {
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  utm_term?: string | null
  utm_content?: string | null
  referrer_host?: string | null
  landing_path?: string | null
  captured_at?: string | null
}

const ATTRIBUTION_STORAGE_KEY = 'lib_growth_attribution'
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const

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
  purchaseConfirmed: 'purchase_confirmed',
  professionalApplicationSubmit: 'professional_application_submit',
} as const

export type GrowthEventName = (typeof GROWTH_EVENT_NAMES)[keyof typeof GROWTH_EVENT_NAMES]

function normalizeAttributionValue(value: string | null, maxLength = 100) {
  const normalized = value?.trim().replace(/\s+/g, ' ').slice(0, maxLength) || ''
  if (!normalized || normalized.includes('@')) return null
  return normalized
}

function readReferrerHost() {
  if (typeof document === 'undefined' || !document.referrer) return null

  try {
    const referrer = new URL(document.referrer)
    if (typeof window !== 'undefined' && referrer.host === window.location.host) return null
    return normalizeAttributionValue(referrer.host, 80)
  } catch {
    return null
  }
}

function readStoredAttribution(): GrowthAttribution | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as GrowthAttribution
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => typeof value === 'string' || value === null)
    ) as GrowthAttribution
  } catch {
    return null
  }
}

function writeStoredAttribution(attribution: GrowthAttribution) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(attribution))
  } catch {
    // Le stockage peut être indisponible en navigation privée stricte.
  }
}

function getGrowthAttributionProperties(): GrowthEventProperties {
  const attribution = readStoredAttribution()
  if (!attribution) return {}

  return Object.fromEntries(
    Object.entries(attribution).filter(
      ([key, value]) => key !== 'captured_at' && (typeof value === 'string' || value === null)
    )
  ) as GrowthEventProperties
}

export function captureGrowthAttribution(searchParams: SearchParamReader, pathname: string) {
  if (typeof window === 'undefined') return

  const utmAttribution = Object.fromEntries(
    UTM_KEYS.map((key) => [key, normalizeAttributionValue(searchParams.get(key), key === 'utm_campaign' ? 140 : 100)])
  ) as GrowthAttribution
  const hasUtmAttribution = UTM_KEYS.some((key) => Boolean(utmAttribution[key]))
  const existingAttribution = readStoredAttribution()

  if (existingAttribution && !hasUtmAttribution) return

  writeStoredAttribution({
    ...utmAttribution,
    referrer_host: readReferrerHost(),
    landing_path: normalizeAttributionValue(pathname, 120),
    captured_at: new Date().toISOString(),
  })
}

export function trackGrowthEvent(name: GrowthEventName, properties: GrowthEventProperties = {}) {
  const safeProperties = Object.fromEntries(
    Object.entries({ ...getGrowthAttributionProperties(), ...properties }).filter(
      ([, value]) => ['string', 'number', 'boolean'].includes(typeof value) || value === null
    )
  ) as GrowthEventProperties

  track(name, safeProperties)

  if (allowsAnalytics() && typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag('event', name, safeProperties)
  }
}
