import { expect, test, type Page } from 'playwright/test'
import { loginSeededUser, seededPassword } from './helpers/auth'

test.skip(process.env.LIB_RUN_SEEDED_E2E !== '1', 'Seeded E2E requires npm run seed:e2e and LIB_RUN_SEEDED_E2E=1')

const password = seededPassword
const resetInitialPassword = 'ResetDev1234!'
const resetNewPassword = 'ResetDev5678!'
const resetUiNewPassword = 'ResetUi5678!'

async function login(page: Page, email: string, pwd = password) {
  await loginSeededUser(page, email, pwd)
}

async function api<T>(page: Page, path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  return page.evaluate(
    async ({ path, init }) => {
      const response = await fetch(path, init)
      return { status: response.status, body: await response.json() }
    },
    { path, init }
  )
}

test.describe.serial('seeded authentication and account lifecycle flows', () => {
  test('public auth endpoints validate registration and anti-enumeration flows', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })

    const email = `inscription-e2e-${Date.now()}@liveinblack.dev`
    const registered = await api<{ ok: boolean; id: string }>(page, '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        firstName: 'Iris',
        lastName: 'Register',
        phone: `+228 93 ${String(Date.now()).slice(-2)} 11 22`,
        birthYear: 1998,
        gender: 'femme',
      }),
    })
    expect(registered.status).toBe(201)
    expect(registered.body.ok).toBe(true)
    expect(registered.body.id).toBeTruthy()

    const duplicate = await api<{ error: string }>(page, '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        firstName: 'Iris',
        lastName: 'Duplicate',
      }),
    })
    expect(duplicate).toMatchObject({ status: 409, body: { error: 'email_taken' } })

    const resetUnknown = await api<{ ok: boolean }>(page, '/api/auth/request-password-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'personne-inconnue@liveinblack.dev' }),
    })
    expect(resetUnknown).toMatchObject({ status: 200, body: { ok: true } })

    const resendVerified = await api<{ ok: boolean }>(page, '/api/auth/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'client@liveinblack.dev' }),
    })
    expect(resendVerified).toMatchObject({ status: 200, body: { ok: true } })
  })

  test('seeded email verification token unlocks a pure client login', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })

    const invalid = await api<{ error: string }>(page, '/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nonverifie@liveinblack.dev', token: 'wrong-token' }),
    })
    expect(invalid).toMatchObject({ status: 400, body: { error: 'invalid_or_expired_token' } })

    const verified = await api<{ ok: boolean }>(page, '/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nonverifie@liveinblack.dev', token: 'e2e-verify-email-token' }),
    })
    expect(verified).toMatchObject({ status: 200, body: { ok: true } })

    await login(page, 'nonverifie@liveinblack.dev')
    await page.goto('/profile', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Nia Verification|profil/i)
  })

  test('seeded reset token changes password and consumes the token once', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    const reset = await api<{ ok: boolean }>(page, '/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'reset@liveinblack.dev', token: 'e2e-reset-password-token', password: resetNewPassword }),
    })
    expect(reset).toMatchObject({ status: 200, body: { ok: true } })

    const reused = await api<{ error: string }>(page, '/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'reset@liveinblack.dev', token: 'e2e-reset-password-token', password: 'ResetDev9999!' }),
    })
    expect(reused).toMatchObject({ status: 400, body: { error: 'invalid_or_expired_token' } })

    await login(page, 'reset@liveinblack.dev', resetNewPassword)
    await page.goto('/profile', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Remi Reset|profil/i)
  })

  test('profile email change can be requested, cancelled and confirmed by token', async ({ page }) => {
    await login(page, 'client@liveinblack.dev')

    const pendingEmail = `client-pending-${Date.now()}@liveinblack.dev`
    const requested = await api<{ ok: boolean; pendingEmail: string }>(page, '/api/profil/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newEmail: pendingEmail, currentPassword: password }),
    })
    expect(requested).toMatchObject({ status: 200, body: { ok: true, pendingEmail } })

    const cancelled = await api<{ ok: boolean }>(page, '/api/profil/email', { method: 'DELETE' })
    expect(cancelled).toMatchObject({ status: 200, body: { ok: true } })

    const confirmed = await api<{ ok: boolean; email: string }>(page, '/api/profil/confirmer-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'email-change-new@liveinblack.dev', token: 'e2e-change-email-token' }),
    })
    expect(confirmed).toMatchObject({ status: 200, body: { ok: true, email: 'email-change-new@liveinblack.dev' } })

    await login(page, 'email-change-new@liveinblack.dev')
    const profile = await api<{ ok: boolean; profile: { email: string } }>(page, '/api/profil')
    expect(profile).toMatchObject({ status: 200, body: { ok: true, profile: { email: 'email-change-new@liveinblack.dev' } } })
  })

  test('verify email page consumes a seeded token and unlocks login', async ({ page }) => {
    await page.goto('/verify-email?email=nonverifie-ui%40liveinblack.dev&token=e2e-verify-email-ui-token', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { name: 'Email vérifié' })).toBeVisible()
    await expect(page.getByText('nonverifie-ui@liveinblack.dev')).toBeVisible()

    await login(page, 'nonverifie-ui@liveinblack.dev')
    await page.goto('/profile', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Uma Verification|profil/i)
  })

  test('reset password page changes the password and rejects token replay', async ({ page }) => {
    await page.goto('/reset-password?email=reset-ui%40liveinblack.dev&token=e2e-reset-password-ui-token', { waitUntil: 'networkidle' })

    await expect(page.getByRole('heading', { name: 'Nouveau mot de passe' })).toBeVisible()
    await page.getByLabel('Nouveau mot de passe').fill(resetUiNewPassword)
    await page.getByLabel('Confirmer le mot de passe').fill(resetUiNewPassword)
    await page.getByRole('button', { name: 'Changer mon mot de passe' }).click()

    await expect(page.getByRole('heading', { name: 'Mot de passe changé' })).toBeVisible()
    await login(page, 'reset-ui@liveinblack.dev', resetUiNewPassword)

    const replay = await api<{ error: string }>(page, '/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'reset-ui@liveinblack.dev', token: 'e2e-reset-password-ui-token', password: 'ResetUi9999!' }),
    })
    expect(replay).toMatchObject({ status: 400, body: { error: 'invalid_or_expired_token' } })
  })

  test('confirm email page applies a pending email change from the public link', async ({ page }) => {
    await page.goto('/confirmer-email?email=email-change-ui-new%40liveinblack.dev&token=e2e-change-email-ui-token', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { name: 'Adresse e-mail mise à jour' })).toBeVisible()
    await expect(page.getByText('email-change-ui-new@liveinblack.dev')).toBeVisible()

    await login(page, 'email-change-ui-new@liveinblack.dev')
    const profile = await api<{ ok: boolean; profile: { email: string } }>(page, '/api/profil')
    expect(profile).toMatchObject({ status: 200, body: { ok: true, profile: { email: 'email-change-ui-new@liveinblack.dev' } } })
  })

  test('public auth link pages show clear missing and expired states', async ({ page }) => {
    await page.goto('/verify-email', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Lien de vérification introuvable' })).toBeVisible()

    await page.goto('/reset-password', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Lien de réinitialisation introuvable' })).toBeVisible()

    await page.goto('/verify-email?email=nonverifie-expired%40liveinblack.dev&token=e2e-verify-email-expired-token', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Lien invalide ou expiré' })).toBeVisible()
    await expect(page.getByRole('button', { name: "Renvoyer l'email de vérification" })).toBeVisible()

    await page.goto('/reset-password?email=reset-expired%40liveinblack.dev&token=e2e-reset-password-expired-token', { waitUntil: 'networkidle' })
    await page.getByLabel('Nouveau mot de passe').fill('ResetExpired5678!')
    await page.getByLabel('Confirmer le mot de passe').fill('ResetExpired5678!')
    await page.getByRole('button', { name: 'Changer mon mot de passe' }).click()
    await expect(page.getByRole('heading', { name: 'Lien invalide ou expiré' })).toBeVisible()

    await page.goto('/confirmer-email?email=email-change-expired-new%40liveinblack.dev&token=e2e-change-email-expired-token', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Lien invalide ou expiré' })).toBeVisible()
  })
})
