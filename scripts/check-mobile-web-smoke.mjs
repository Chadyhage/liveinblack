import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const mobileRoot = path.resolve(process.cwd(), '../LIB_Mobile')
const distDir = path.resolve(mobileRoot, process.env.LIB_MOBILE_WEB_DIST || 'dist-web-test')
const port = Number(process.env.LIB_MOBILE_WEB_PORT || 8095)
const host = '127.0.0.1'
const url = `http://${host}:${port}/`
const fixtureApi = process.env.LIB_MOBILE_WEB_FIXTURE_API === 'true'

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.ttf', 'font/ttf'],
  ['.xml', 'application/xml; charset=utf-8'],
])

function resolveAssetPath(requestUrl) {
  const parsed = new URL(requestUrl, url)
  const pathname = decodeURIComponent(parsed.pathname)
  const requestedPath = pathname === '/' ? '/index.html' : pathname
  const filePath = path.resolve(distDir, `.${requestedPath}`)
  if (!filePath.startsWith(distDir)) return null
  return filePath
}

function createStaticServer() {
  const server = createServer(async (req, res) => {
    const filePath = resolveAssetPath(req.url || '/')
    if (!filePath) {
      res.writeHead(403)
      res.end('Forbidden')
      return
    }

    try {
      const body = await readFile(filePath)
      res.writeHead(200, {
        'Content-Type': MIME_TYPES.get(path.extname(filePath)) || 'application/octet-stream',
        'Cache-Control': 'no-store',
      })
      res.end(body)
    } catch {
      res.writeHead(404)
      res.end('Not found')
    }
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => resolve(server))
  })
}

const server = await createStaticServer()
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
})

const pageErrors = []
const failedRequests = []
const consoleErrors = []

if (fixtureApi) {
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const origin = url.replace(/\/$/, '')
    const headers = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      Vary: 'Origin',
    }

    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers })
      return
    }

    const requestUrl = new URL(request.url())
    if (requestUrl.pathname === '/api/auth/session') {
      await route.fulfill({ status: 200, contentType: 'application/json', headers, body: 'null' })
      return
    }

    if (requestUrl.pathname === '/api/events') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers,
        body: JSON.stringify({
          ok: true,
          events: [
            {
              id: 'expo-web-smoke-event',
              name: 'LATINO QA Horizon',
              subtitle: 'Une soirée de validation mobile',
              description: 'Fixture contrôlée pour vérifier le rendu Expo Web avec une réponse API valide.',
              date: '2026-09-12T21:00:00.000Z',
              dateDisplay: 'Sam. 12 septembre',
              time: '21:00',
              city: 'Lomé',
              region: 'Maritime',
              currency: 'XOF',
              imageUrl: null,
              category: 'Latino',
              places: [{ id: 'regular', type: 'Regular', price: 5000, available: 120, total: 120 }],
              isPrivate: false,
              cancelled: false,
              organizerName: 'LIVE IN BLACK QA',
              boosted: true,
            },
          ],
          page: 1,
          pageSize: 24,
          total: 1,
          totalPages: 1,
        }),
      })
      return
    }

    await route.fulfill({ status: 404, contentType: 'application/json', headers, body: JSON.stringify({ error: 'fixture_not_found' }) })
  })
}

page.on('pageerror', (error) => pageErrors.push(error.message))
page.on('requestfailed', (request) => {
  const resourceType = request.resourceType()
  if (['document', 'fetch', 'script', 'xhr'].includes(resourceType)) {
    failedRequests.push(`${resourceType} ${request.url()} — ${request.failure()?.errorText || 'failed'}`)
  }
})
page.on('console', (message) => {
  if (message.type() !== 'error') return
  const text = message.text()
  if (/Access to fetch|CORS|Uncaught|TypeError|ReferenceError|SyntaxError/i.test(text)) consoleErrors.push(text)
})

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 })
  await page.waitForFunction(
    () => {
      const text = document.body?.innerText || ''
      return text.includes('Sorties près de toi') || text.includes('Connexion interrompue')
    },
    null,
    { timeout: 20_000 }
  )

  const result = await page.evaluate(() => {
    const text = document.body?.innerText || ''
    return {
      hasBrand: text.includes('LIVE IN BLACK'),
      hasHomeHeading: text.includes('Sorties près de toi'),
      hasFixtureEvent: text.includes('LATINO QA Horizon'),
      hasNetworkError: text.includes('Connexion interrompue'),
      hasRetry: text.includes('Réessayer'),
      overflowWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      text: text.slice(0, 500),
    }
  })

  const failures = []
  if (!result.hasBrand) failures.push('marque LIVE IN BLACK absente')
  if (!result.hasHomeHeading) failures.push('titre accueil absent')
  if (fixtureApi && !result.hasFixtureEvent) failures.push('événement fixture absent')
  if (result.hasNetworkError) failures.push('état Connexion interrompue affiché')
  if (result.hasRetry) failures.push('bouton Réessayer affiché sur le chargement initial')
  if (result.overflowWidth > result.viewportWidth + 1) failures.push(`débordement horizontal ${result.overflowWidth}px > ${result.viewportWidth}px`)
  if (pageErrors.length > 0) failures.push(`erreurs runtime : ${pageErrors.slice(0, 3).join(' | ')}`)
  if (consoleErrors.length > 0) failures.push(`erreurs console : ${consoleErrors.slice(0, 3).join(' | ')}`)
  if (failedRequests.length > 0) failures.push(`requêtes critiques échouées : ${failedRequests.slice(0, 3).join(' | ')}`)

  if (failures.length > 0) {
    console.error(`Expo Web smoke${fixtureApi ? ' fixture' : ''} : ÉCHEC (${url})`)
    for (const failure of failures) console.error(`- ${failure}`)
    console.error(`Texte visible : ${result.text.replace(/\s+/g, ' ').trim()}`)
    process.exitCode = 1
  } else {
    console.log(`Expo Web smoke${fixtureApi ? ' fixture' : ''} : OK (${url})`)
  }
} finally {
  await browser.close()
  await new Promise((resolve) => server.close(resolve))
}
