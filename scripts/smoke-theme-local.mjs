#!/usr/bin/env node
import { chromium } from 'playwright'

const baseUrl = process.env.SMOKE_BASE_URL || 'http://localhost:3000'
const DEFAULT_ROUTES = [
  '/login',
  '/home',
  '/events',
  '/providers',
  '/organizers',
  '/search',
  '/about',
  '/contact',
  '/blog',
  '/blog/benin',
  '/privacy',
  '/terms',
  '/cookies',
  '/legal-notice',
  '/verify-email',
  '/reset-password',
  '/confirmer-email',
  '/boost-active',
  '/payment-success',
  '/profile',
  '/profile/billets',
  '/profile/parametres',
  '/profile/followed-organizers',
  '/profile/interested-events',
  '/notifications',
  '/messages',
  '/my-events',
  '/my-application',
  '/my-shifts',
  '/offer-services',
  '/organizer-studio',
  '/agent',
  '/agent/dossiers',
  '/agent/evenements',
  '/agent/paiements',
  '/agent/avis',
  '/agent/signalements',
  '/agent/comptes',
  '/agent/actualite',
  '/agent/blog',
  '/agent/suppressions',
  '/help',
]

const routes = (process.env.SMOKE_ROUTES || DEFAULT_ROUTES.join(','))
  .split(',')
  .map((route) => route.trim())
  .filter(Boolean)

const browser = await chromium.launch({ headless: true })
const results = []
const failures = []

try {
  for (const route of routes) {
    for (const theme of ['dark', 'light']) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
      const errors = []

      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text())
      })
      await page.addInitScript((selectedTheme) => {
        localStorage.setItem('lib_theme', selectedTheme)
      }, theme)

      const response = await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle', timeout: 45_000 })
      const snapshot = await page.evaluate(() => {
        function parseColor(value) {
          const color = value.trim()
          if (!color || color === 'transparent') return null
          const rgb = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)$/)
          if (!rgb) return null
          const alpha = rgb[4] === undefined ? 1 : Number(rgb[4])
          if (alpha <= 0.05) return null
          return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), alpha]
        }

        function blend(foreground, background) {
          const alpha = foreground[3]
          return [
            Math.round(foreground[0] * alpha + background[0] * (1 - alpha)),
            Math.round(foreground[1] * alpha + background[1] * (1 - alpha)),
            Math.round(foreground[2] * alpha + background[2] * (1 - alpha)),
            1,
          ]
        }

        function luminance(color) {
          const [r, g, b] = color.slice(0, 3).map((channel) => {
            const value = channel / 255
            return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
          })
          return 0.2126 * r + 0.7152 * g + 0.0722 * b
        }

        function contrastRatio(foreground, background) {
          const lighter = Math.max(luminance(foreground), luminance(background))
          const darker = Math.min(luminance(foreground), luminance(background))
          return (lighter + 0.05) / (darker + 0.05)
        }

        function effectiveBackground(element) {
          const root = getComputedStyle(document.documentElement)
          let fallback = parseColor(root.getPropertyValue('--background')) || [255, 255, 255, 1]
          let current = element
          const layers = []
          while (current && current !== document.documentElement) {
            const bg = parseColor(getComputedStyle(current).backgroundColor)
            if (bg) layers.push(bg)
            current = current.parentElement
          }
          for (const bg of layers.reverse()) {
            fallback = bg[3] < 1 ? blend(bg, fallback) : bg
          }
          return fallback
        }

        function directText(element) {
          return [...element.childNodes]
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent || '')
            .join(' ')
            .trim()
        }

        function sitsOnPhoto(element) {
          let current = element
          while (current && current !== document.documentElement) {
            const bg = getComputedStyle(current).backgroundImage
            if (bg && bg !== 'none' && bg.includes('url(')) return true
            current = current.parentElement
          }
          return false
        }

        const contrastIssues = []
        const candidates = [...document.querySelectorAll('body *')]
          .filter((element) => {
            const rect = element.getBoundingClientRect()
            const style = getComputedStyle(element)
            const ownText = directText(element)
            const tag = element.tagName.toLowerCase()
            const interactiveText = ['a', 'button', 'label', 'input', 'textarea', 'select'].includes(tag) ? element.innerText?.trim() : ''
            const text = ownText || interactiveText
            return text && !element.closest('[data-contrast-on-image="true"]') && !sitsOnPhoto(element) && rect.width > 8 && rect.height > 8 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity || 1) > 0.15
          })
          .slice(0, 160)

        for (const element of candidates) {
          const style = getComputedStyle(element)
          const foreground = parseColor(style.color)
          if (!foreground) continue
          const background = effectiveBackground(element)
          const ratio = contrastRatio(foreground, background)
          const fontSize = Number.parseFloat(style.fontSize || '16')
          const fontWeight = Number.parseInt(style.fontWeight || '400', 10)
          const largeText = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700)
          const required = largeText ? 3 : 4.5
          if (ratio < required) {
            contrastIssues.push({
              tag: element.tagName.toLowerCase(),
              text: (directText(element) || element.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 80),
              ratio: Number(ratio.toFixed(2)),
              required,
              color: style.color,
              background: `rgb(${background[0]}, ${background[1]}, ${background[2]})`,
            })
          }
          if (contrastIssues.length >= 5) break
        }

        const root = getComputedStyle(document.documentElement)
        return {
          bodyTextLength: document.body.innerText.trim().length,
          hasOverlay: Boolean(document.querySelector('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay')),
          theme: document.documentElement.dataset.theme || 'missing',
          toggleCount: document.querySelectorAll('.lb-theme-toggle').length,
          background: root.getPropertyValue('--background').trim(),
          text: root.getPropertyValue('--text').trim(),
          primary: root.getPropertyValue('--primary').trim(),
          accentText: root.getPropertyValue('--accent-text').trim(),
          contrastIssues,
        }
      })

      const result = { route, theme, status: response?.status() || 0, errors: errors.slice(0, 2), ...snapshot }
      results.push(result)

      if (!response?.ok()) failures.push(`${route} ${theme}: statut HTTP ${result.status}`)
      if (snapshot.bodyTextLength < 20) failures.push(`${route} ${theme}: contenu trop court`)
      if (snapshot.hasOverlay) failures.push(`${route} ${theme}: overlay erreur framework visible`)
      if (snapshot.theme !== theme) failures.push(`${route} ${theme}: theme applique=${snapshot.theme}`)
      if (snapshot.toggleCount < 1) failures.push(`${route} ${theme}: toggle theme introuvable`)
      if (theme === 'dark' && snapshot.background !== '#191218') failures.push(`${route} dark: background=${snapshot.background}`)
      if (theme === 'light' && snapshot.background !== '#f7f7fa') failures.push(`${route} light: background=${snapshot.background}`)
      if (theme === 'dark' && snapshot.primary.toLowerCase() !== '#f53d8d') failures.push(`${route} dark: primary=${snapshot.primary}`)
      if (theme === 'light' && snapshot.primary.toLowerCase() !== '#b01860') failures.push(`${route} light: primary=${snapshot.primary}`)
      if (snapshot.contrastIssues.length > 0) failures.push(`${route} ${theme}: ${snapshot.contrastIssues.length} contraste(s) insuffisant(s)`)
      if (errors.length > 0) failures.push(`${route} ${theme}: ${errors.length} erreur(s) console`)

      await page.close()
    }
  }
} finally {
  await browser.close()
}

if (failures.length > 0) {
  console.error('Smoke theme local : ECHEC')
  console.error(JSON.stringify(results, null, 2))
  for (const failure of failures) console.error('- ' + failure)
  process.exit(1)
}

console.log('Smoke theme local : OK')
console.log(JSON.stringify(results, null, 2))
