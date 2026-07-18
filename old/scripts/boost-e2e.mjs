// Test E2E Boost Stripe — achat d'un boost Top 3 (mode test) sur liveinblack.com
// Usage : E2E_EMAIL=... E2E_PASSWORD=... node scripts/boost-e2e.mjs <eventId>
import puppeteer from 'puppeteer-core'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { spawn, execSync } from 'child_process'

const EDGE = process.env.E2E_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const EVENT_ID = process.argv[2]
const EMAIL = process.env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD
if (!EVENT_ID || !EMAIL || !PASSWORD) {
  console.error('Usage: E2E_EMAIL=... E2E_PASSWORD=... node scripts/boost-e2e.mjs <eventId>')
  process.exit(1)
}
const SHOTS = mkdtempSync(join(tmpdir(), 'boost-e2e-'))
const log = (...a) => console.log('[e2e]', ...a)
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function shot(page, name) {
  try { await page.screenshot({ path: join(SHOTS, name + '.png') }) } catch {}
}
async function clickByText(page, pattern, { tag = 'button', timeout = 15000 } = {}) {
  const re = pattern instanceof RegExp ? pattern.source : pattern
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const ok = await page.evaluate((re, tag) => {
        const rx = new RegExp(re, 'i')
        const el = [...document.querySelectorAll(tag)].find(e => rx.test(e.innerText || ''))
        if (el) { el.click(); return true }
        return false
      }, re, tag)
      if (ok) return true
    } catch {}
    await sleep(400)
  }
  return false
}
async function setReactValue(page, selector, value) {
  await page.waitForSelector(selector, { timeout: 15000 })
  await page.evaluate((sel, val) => {
    const el = document.querySelector(sel)
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, val)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, selector, value)
}

// Edge headless en mode connect (cf. stripe-e2e.mjs)
const DEBUG_PORT = 9777
const profileDir = join(tmpdir(), 'edge-e2e-liveinblack')
try { execSync(`powershell -Command "Get-CimInstance Win32_Process -Filter \\"Name='msedge.exe'\\" | Where-Object { $_.CommandLine -like '*${DEBUG_PORT}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"`, { stdio: 'ignore' }) } catch {}
const edgeProc = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profileDir}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--window-size=1280,900', 'about:blank',
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
if (!browser) { edgeProc.kill(); throw new Error('Edge headless inaccessible') }
process.on('exit', () => { try { edgeProc.kill() } catch {} })

try {
  const page = await browser.newPage()
  page.setDefaultTimeout(30000)

  // ── 1. Session / login ──
  await page.goto('https://liveinblack.com/accueil', { waitUntil: 'networkidle2' })
  await sleep(1500)
  let user = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('lib_user') || 'null') } catch { return null } })
  if (!user) {
    log('login…')
    await page.goto('https://liveinblack.com/connexion', { waitUntil: 'networkidle2' })
    await sleep(1500)
    await clickByText(page, '^accepter$', { timeout: 3000 }).catch(() => {})
    await setReactValue(page, 'input[type=email]', EMAIL)
    await setReactValue(page, 'input[type=password]', PASSWORD)
    await clickByText(page, '^se connecter$')
    await page.waitForFunction(() => { try { return !!JSON.parse(localStorage.getItem('lib_user') || 'null') } catch { return false } }, { timeout: 25000 })
    user = await page.evaluate(() => JSON.parse(localStorage.getItem('lib_user') || 'null'))
  }
  log('connecté:', user?.name, '/', user?.role)
  if (user?.role !== 'organisateur') {
    // Le rôle Firestore a été promu côté serveur — re-login pour rafraîchir
    log('rôle local périmé (' + user?.role + ') — re-login pour rafraîchir')
    await page.evaluate(() => localStorage.removeItem('lib_user'))
    await page.goto('https://liveinblack.com/connexion', { waitUntil: 'networkidle2' })
    await sleep(1500)
    await setReactValue(page, 'input[type=email]', EMAIL)
    await setReactValue(page, 'input[type=password]', PASSWORD)
    await clickByText(page, '^se connecter$')
    await page.waitForFunction(() => { try { return !!JSON.parse(localStorage.getItem('lib_user') || 'null') } catch { return false } }, { timeout: 25000 })
    user = await page.evaluate(() => JSON.parse(localStorage.getItem('lib_user') || 'null'))
    log('re-connecté:', user?.name, '/', user?.role)
  }

  // ── 2. Dashboard organisateur ──
  log('ouverture Mes Événements…')
  await page.goto('https://liveinblack.com/mes-evenements', { waitUntil: 'networkidle2' })
  await sleep(3000)
  await shot(page, '01-dashboard')
  const hasEvent = await page.evaluate(() => document.body.innerText.includes('BOOST TEST PARTY'))
  if (!hasEvent) throw new Error('event de test absent du dashboard — texte: ' + (await page.evaluate(() => document.body.innerText.slice(200, 500))))

  // ── 3. Ouvrir le BoostModal ──
  const boostClicked = await page.evaluate(() => {
    const btn = document.querySelector('button[title="Booster"]')
    if (btn) { btn.click(); return true }
    return false
  })
  if (!boostClicked) throw new Error('bouton Booster introuvable')
  await sleep(1500)
  await shot(page, '02-boost-modal')

  // ── 4. Choisir Top 3 / 1 jour (3.99€) ──
  // Les tiers sont des boutons « 1 jour … 3.99 » — on prend celui à 3.99
  const tierClicked = await page.evaluate(() => {
    const els = [...document.querySelectorAll('button, [role=button], div')].filter(el =>
      el.children.length < 6 && /1 jour/i.test(el.innerText || '') && /3[.,]99/.test(el.innerText || ''))
    const t = els[els.length - 1]
    if (t) { t.click(); return true }
    return false
  })
  if (!tierClicked) throw new Error('tier Top 3 / 1 jour introuvable')
  await sleep(800)
  await shot(page, '03-tier-selected')

  if (!await clickByText(page, 'booster en top')) throw new Error('bouton « Booster en Top » introuvable')
  await sleep(1500)
  await shot(page, '04-recap')

  // ── 5. Confirmation finale → redirection Stripe ──
  for (let i = 0; i < 5; i++) {
    try {
      if (await page.evaluate(() => location.hostname.includes('checkout.stripe.com'))) break
      const t = await page.evaluate(() => document.body.innerText)
      const btnRx = [/payer.*€/i, /confirmer.*paiement/i, /^payer/i, /procéder/i, /booster en top/i]
      let clicked = false
      for (const rx of btnRx) {
        if (rx.test(t) && await clickByText(page, rx, { timeout: 2000 })) { log('clic:', rx.source); clicked = true; break }
      }
      if (!clicked) break
      await sleep(2500)
    } catch (e) {
      if (/context|navigation|detached/i.test(e.message)) { log('navigation en cours'); break }
      throw e
    }
  }

  log('attente redirection Stripe…')
  await page.waitForFunction(() => location.hostname.includes('checkout.stripe.com'), { timeout: 30000 })
  log('sur Stripe Checkout ✓')
  await sleep(3500)
  await shot(page, '05-stripe')

  // ── 6. Paiement carte test ──
  const hasEmail = await page.$('input#email')
  if (hasEmail) {
    const v = await page.evaluate(() => document.querySelector('input#email')?.value || '')
    if (!v) await page.type('input#email', EMAIL, { delay: 30 })
  }
  try {
    await page.waitForSelector('input#cardNumber', { timeout: 50000 })
  } catch (e) {
    await shot(page, '05b-stripe-no-card-form')
    const stripeText = await page.evaluate(() => document.body.innerText.slice(0, 400)).catch(() => 'illisible')
    throw new Error('formulaire carte absent — page Stripe: ' + stripeText.replace(/\n+/g, ' | '))
  }
  await page.type('input#cardNumber', '4242424242424242', { delay: 40 })
  await page.type('input#cardExpiry', '12/34', { delay: 40 })
  await page.type('input#cardCvc', '123', { delay: 40 })
  if (await page.$('input#billingName')) await page.type('input#billingName', 'Client Test QA', { delay: 25 })
  if (await page.$('select#billingCountry')) await page.select('select#billingCountry', 'FR').catch(() => {})
  if (await page.$('input#billingPostalCode')) await page.type('input#billingPostalCode', '75001', { delay: 25 })
  log('paiement…')
  await page.click('button[type=submit], .SubmitButton')

  // ── 7. Retour boost-active ──
  await page.waitForFunction(() => location.hostname.includes('liveinblack.com'), { timeout: 60000 })
  log('retour:', await page.evaluate(() => location.pathname + location.search))
  await sleep(6000)
  await shot(page, '06-boost-active')

  const result = await page.evaluate(() => ({
    path: location.pathname,
    search: location.search,
    pageText: document.body.innerText.slice(0, 500),
    boosts: JSON.parse(localStorage.getItem('lib_boosts') || '[]').map(b => ({ id: b.id, eventId: b.eventId, position: b.position, days: b.days, region: b.region })),
  }))
  console.log('RESULT_JSON=' + JSON.stringify(result))
  log('screenshots:', SHOTS)
} catch (err) {
  console.error('E2E_ERROR=' + err.message)
  console.error('screenshots:', SHOTS)
  process.exitCode = 1
} finally {
  await browser.close()
}
