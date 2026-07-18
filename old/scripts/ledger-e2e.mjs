// E2E ciblé : complète un paiement Stripe (mode test, carte 4242) à partir d'une
// URL de session Checkout déjà créée. Sert à prouver que le webhook crédite le
// ledger seller_balances. Usage : node scripts/ledger-e2e.mjs "<session_url>"
import puppeteer from 'puppeteer-core'
import { spawn, execSync } from 'child_process'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const EDGE = process.env.E2E_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const URL = process.argv[2]
if (!URL) { console.error('Usage: node scripts/ledger-e2e.mjs "<session_url>"'); process.exit(1) }
const SHOTS = mkdtempSync(join(tmpdir(), 'ledger-e2e-'))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const log = (...a) => console.log('[ledger-e2e]', ...a)
const shot = async (p, n) => { try { await p.screenshot({ path: join(SHOTS, n + '.png') }) } catch {} }

const DEBUG_PORT = 9778
try { execSync(`powershell -Command "Get-CimInstance Win32_Process -Filter \\"Name='msedge.exe'\\" | Where-Object { $_.CommandLine -like '*${DEBUG_PORT}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"`, { stdio: 'ignore' }) } catch {}
const profileDir = join(tmpdir(), 'edge-ledger-e2e')
const edgeProc = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profileDir}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--window-size=1280,900', 'about:blank'], { detached: false, stdio: 'ignore' })

let browser = null
for (let i = 0; i < 40; i++) {
  try { const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`); if (res.ok) { const info = await res.json(); browser = await puppeteer.connect({ browserWSEndpoint: info.webSocketDebuggerUrl, defaultViewport: { width: 1280, height: 900 } }); break } } catch {}
  await sleep(500)
}
if (!browser) { edgeProc.kill(); throw new Error('Edge headless inaccessible') }
process.on('exit', () => { try { edgeProc.kill() } catch {} })

try {
  const page = await browser.newPage()
  page.setDefaultTimeout(30000)
  log('ouverture session Stripe…')
  await page.goto(URL, { waitUntil: 'networkidle2' })
  await sleep(3500)
  await shot(page, '01-stripe')
  if (!await page.evaluate(() => location.hostname.includes('checkout.stripe.com'))) {
    throw new Error('pas sur checkout.stripe.com — ' + await page.evaluate(() => location.href))
  }
  log('remplissage carte 4242…')
  const hasEmail = await page.$('input#email')
  if (hasEmail) { const v = await page.evaluate(() => document.querySelector('input#email')?.value || ''); if (!v) await page.type('input#email', 'hagechady4+clientqa@gmail.com', { delay: 25 }) }
  await page.waitForSelector('input#cardNumber', { timeout: 20000 })
  await page.type('input#cardNumber', '4242424242424242', { delay: 40 })
  await page.type('input#cardExpiry', '12/34', { delay: 40 })
  await page.type('input#cardCvc', '123', { delay: 40 })
  const bn = await page.$('input#billingName'); if (bn) await page.type('input#billingName', 'Client Test QA', { delay: 25 })
  const ctry = await page.$('select#billingCountry'); if (ctry) await page.select('select#billingCountry', 'FR').catch(() => {})
  const pc = await page.$('input#billingPostalCode'); if (pc) await page.type('input#billingPostalCode', '75001', { delay: 25 })
  await shot(page, '02-filled')
  log('soumission paiement…')
  await page.click('button[type=submit], .SubmitButton')
  await page.waitForFunction(() => location.hostname.includes('liveinblack.com'), { timeout: 60000 })
  log('payé ✓ — retour:', await page.evaluate(() => location.pathname + location.search))
  await sleep(4000)
  await shot(page, '03-success')
  console.log('RESULT_JSON=' + JSON.stringify({ ok: true, returnPath: await page.evaluate(() => location.pathname) }))
} catch (err) {
  console.error('E2E_ERROR=' + err.message)
  console.error('screenshots:', SHOTS)
  process.exitCode = 1
} finally {
  await browser.close()
}
