// Test E2E Stripe — achat réel (mode test) sur liveinblack.com
// Pilote un Edge headless isolé : login client QA → réservation payante →
// Stripe Checkout (carte 4242) → page de succès. Usage : node scripts/stripe-e2e.mjs
import puppeteer from 'puppeteer-core'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const EDGE = process.env.E2E_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const EVENT_ID = process.argv[2]
const EMAIL = process.env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD
if (!EVENT_ID || !EMAIL || !PASSWORD) {
  console.error('Usage: E2E_EMAIL=... E2E_PASSWORD=... node scripts/stripe-e2e.mjs <eventId>')
  process.exit(1)
}
const SHOTS = mkdtempSync(join(tmpdir(), 'stripe-e2e-'))
const log = (...a) => console.log('[e2e]', ...a)

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function shot(page, name) {
  try { await page.screenshot({ path: join(SHOTS, name + '.png'), fullPage: false }) } catch {}
}

// Clique le premier bouton dont le texte matche (regex, insensible casse)
async function clickByText(page, pattern, { tag = 'button', timeout = 15000 } = {}) {
  const re = pattern instanceof RegExp ? pattern.source : pattern
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const ok = await page.evaluate((re, tag) => {
      const rx = new RegExp(re, 'i')
      const els = [...document.querySelectorAll(tag)]
      const el = els.find(e => rx.test(e.innerText || ''))
      if (el) { el.click(); return true }
      return false
    }, re, tag)
    if (ok) return true
    await sleep(400)
  }
  return false
}

async function setReactValue(page, selector, value) {
  await page.waitForSelector(selector, { timeout: 15000 })
  await page.evaluate((sel, val) => {
    const el = document.querySelector(sel)
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, selector, value)
}

// Lancement manuel d'Edge headless + connexion CDP (puppeteer.launch échoue
// parfois avec Edge sous Windows — le mode connect est plus fiable)
import { spawn, execSync } from 'child_process'
const DEBUG_PORT = 9777
// Profil PERSISTANT : la session Firebase Auth survit entre les runs,
// ce qui évite de re-déclencher le throttling de connexions Firebase
const profileDir = join(tmpdir(), 'edge-e2e-liveinblack')
// Tuer les instances Edge zombies de runs précédents (elles squattent le port)
try { execSync(`powershell -Command "Get-CimInstance Win32_Process -Filter \\"Name='msedge.exe'\\" | Where-Object { $_.CommandLine -like '*${DEBUG_PORT}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"`, { stdio: 'ignore' }) } catch {}
const edgeProc = spawn(EDGE, [
  '--headless=new',
  `--remote-debugging-port=${DEBUG_PORT}`,
  `--user-data-dir=${profileDir}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--window-size=1280,900',
  'about:blank',
], { detached: false, stdio: 'ignore' })

let browser = null
for (let i = 0; i < 40; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)
    if (res.ok) {
      const info = await res.json()
      browser = await puppeteer.connect({ browserWSEndpoint: info.webSocketDebuggerUrl, defaultViewport: { width: 1280, height: 900 } })
      break
    }
  } catch {}
  await sleep(500)
}
if (!browser) { edgeProc.kill(); throw new Error('Edge headless inaccessible sur le port ' + DEBUG_PORT) }
process.on('exit', () => { try { edgeProc.kill() } catch {} })

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 900 })
  page.setDefaultTimeout(30000)

  // ── 1. Login (sauté si la session du profil persistant est encore valide) ──
  await page.goto('https://liveinblack.com/accueil', { waitUntil: 'networkidle2' })
  await sleep(1500)
  let user = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('lib_user') || 'null') } catch { return null } })
  if (!user) {
    log('login…')
    await page.goto('https://liveinblack.com/connexion', { waitUntil: 'networkidle2' })
    await sleep(1500)
    // Bandeau cookies éventuel
    await clickByText(page, '^accepter$', { timeout: 3000 }).catch(() => {})
    await setReactValue(page, 'input[type=email]', EMAIL)
    await setReactValue(page, 'input[type=password]', PASSWORD)
    await shot(page, '01-login')
    await clickByText(page, '^se connecter$')
    try {
      await page.waitForFunction(() => {
        try { return !!JSON.parse(localStorage.getItem('lib_user') || 'null') } catch { return false }
      }, { timeout: 25000 })
    } catch {
      await shot(page, '01b-login-failed')
      const errText = await page.evaluate(() => document.body.innerText.slice(0, 400))
      throw new Error('login échoué — page: ' + errText.replace(/\n+/g, ' | '))
    }
    user = await page.evaluate(() => JSON.parse(localStorage.getItem('lib_user') || 'null'))
  }
  log('connecté:', user?.name, '/', user?.role)
  if (!user || (user.role !== 'user' && user.role !== 'client')) throw new Error('login KO ou rôle inattendu: ' + user?.role)
  await shot(page, '02-logged-in')

  // ── 2. Page événement ──
  log('ouverture event', EVENT_ID)
  await page.goto('https://liveinblack.com/evenements/' + EVENT_ID, { waitUntil: 'networkidle2' })
  await sleep(2500)
  await shot(page, '03-event-page')
  const pageText = await page.evaluate(() => document.body.innerText)
  if (pageText.includes('introuvable')) throw new Error('événement introuvable sur la page')

  // ── 3. Sélection de place + confirmation ──
  log('sélection de la place…')
  const placeClicked = await page.evaluate(() => {
    const els = [...document.querySelectorAll('*')].filter(el =>
      el.children.length < 8 && el.innerText && el.innerText.includes('Entrée Standard') && el.innerText.includes('5€'))
    const t = els[els.length - 1]
    if (t) { t.click(); return true }
    return false
  })
  if (!placeClicked) throw new Error('carte de place introuvable')
  await sleep(800)
  await shot(page, '04-place-selected')

  if (!await clickByText(page, 'CONFIRMER LA RÉSERVATION')) throw new Error('bouton CONFIRMER introuvable')
  await sleep(800)

  // Modals dans un ordre variable : confirmation, âge 18+, paiement.
  // La redirection vers Stripe peut survenir en plein milieu → toute erreur
  // « context destroyed » signifie que la navigation est en cours : on sort.
  for (let i = 0; i < 6; i++) {
    try {
      if (await page.evaluate(() => location.hostname.includes('checkout.stripe.com'))) break
      const t = await page.evaluate(() => document.body.innerText)
      if (/j'ai compris/i.test(t)) { log('modal 18+'); await clickByText(page, "j'ai compris"); await sleep(1000); continue }
      if (/OUI, CONFIRMER/.test(t)) { log('modal confirmation'); await clickByText(page, '^OUI, CONFIRMER$'); await sleep(1000); continue }
      if (/PAYER \d/.test(t)) { log('modal paiement → PAYER'); await clickByText(page, '^PAYER \\d'); await sleep(2500); continue }
      break
    } catch (e) {
      if (/context|navigation|detached/i.test(e.message)) { log('navigation en cours →', e.message.slice(0, 50)); break }
      throw e
    }
  }
  await shot(page, '05-after-modals')

  // ── 4. Redirection Stripe ──
  log('attente redirection Stripe…')
  await page.waitForFunction(() => location.hostname.includes('checkout.stripe.com'), { timeout: 30000 })
  log('sur Stripe Checkout ✓')
  await sleep(3500)
  await shot(page, '06-stripe-page')

  // ── 5. Formulaire de paiement ──
  log('remplissage carte de test…')
  // L'email peut être prérempli (customer_email) — sinon on le remplit
  const hasEmail = await page.$('input#email')
  if (hasEmail) {
    const v = await page.evaluate(() => document.querySelector('input#email')?.value || '')
    if (!v) { await page.type('input#email', EMAIL, { delay: 30 }) }
  }
  await page.waitForSelector('input#cardNumber', { timeout: 20000 })
  await page.type('input#cardNumber', '4242424242424242', { delay: 40 })
  await page.type('input#cardExpiry', '12/34', { delay: 40 })
  await page.type('input#cardCvc', '123', { delay: 40 })
  const billingName = await page.$('input#billingName')
  if (billingName) await page.type('input#billingName', 'Client Test QA', { delay: 25 })
  // Pays / code postal selon configuration
  const country = await page.$('select#billingCountry')
  if (country) { await page.select('select#billingCountry', 'FR').catch(() => {}) }
  const postal = await page.$('input#billingPostalCode')
  if (postal) await page.type('input#billingPostalCode', '75001', { delay: 25 })
  await shot(page, '07-card-filled')

  log('paiement…')
  await page.click('button[type=submit], .SubmitButton')

  // ── 6. Attente du redirect succès ──
  await page.waitForFunction(() => location.hostname.includes('liveinblack.com'), { timeout: 60000 })
  log('retour sur liveinblack.com:', await page.evaluate(() => location.pathname + location.search))
  await sleep(6000) // laisser PaiementReussiPage finaliser (verify-session + tickets)
  await shot(page, '08-success-page')

  const result = await page.evaluate(() => {
    const bookings = JSON.parse(localStorage.getItem('lib_bookings') || '[]')
    return {
      path: location.pathname,
      search: location.search,
      pageText: document.body.innerText.slice(0, 600),
      bookings: bookings.map(b => ({ code: b.ticketCode, paid: b.paid, method: b.paymentMethod, sessionId: (b.stripeSessionId || '').slice(0, 25) })),
    }
  })
  console.log('RESULT_JSON=' + JSON.stringify(result))
  log('screenshots:', SHOTS)
} catch (err) {
  console.error('E2E_ERROR=' + err.message)
  console.error('screenshots:', SHOTS)
  process.exitCode = 1
} finally {
  await browser.close()
}
