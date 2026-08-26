import { expect, test } from 'playwright/test'

test.describe('public forms and search', () => {
  test('event search keeps the query visible and supports empty states', async ({ page }) => {
    await page.goto('/events')

    const search = page.getByRole('search').filter({ has: page.getByLabel('Rechercher un événement') })
    await expect(search.getByLabel('Rechercher un événement')).toBeVisible()

    await search.getByLabel('Rechercher un événement').fill('zzzz-evenement-introuvable')
    await search.getByRole('button', { name: /rechercher/i }).click()

    await expect(page).toHaveURL(/\/events\?q=zzzz-evenement-introuvable/)
    await expect(page.getByText(/Aucun événement trouvé/i)).toBeVisible()
    await expect(page.getByRole('link', { name: /Voir tous les événements/i })).toBeVisible()
  })

  test('global header search calls the quick search API and shows a result panel', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/home')

    const headerSearch = page.getByRole('search').filter({ has: page.getByLabel(/Recherche globale/i) }).first()
    const searchInput = headerSearch.getByLabel(/Recherche globale/i)
    const results = page.getByRole('region', { name: /Résultats de recherche/i })
    await expect(searchInput).toBeVisible()

    for (let attempt = 0; attempt < 3 && !(await results.isVisible().catch(() => false)); attempt += 1) {
      await searchInput.fill('')
      await searchInput.pressSequentially('afro')
      await results.waitFor({ state: 'visible', timeout: 2_000 }).catch(() => {})
    }

    await expect(results).toBeVisible()
    await expect(results).toContainText(/Événements|Organisateurs|Prestataires|Aucun résultat/i, {
      timeout: 15_000,
    })
  })

  test('contact form validates required fields before submitting', async ({ page }) => {
    await page.goto('/contact')
    await page.waitForLoadState('networkidle')

    const submit = page.getByRole('button', { name: /Envoyer le message/i })
    const nameError = page.getByText('Ton nom est requis.')
    await expect(submit).toBeVisible()

    for (let attempt = 0; attempt < 3 && !(await nameError.isVisible().catch(() => false)); attempt += 1) {
      await submit.click()
      await nameError.waitFor({ state: 'visible', timeout: 2_000 }).catch(() => {})
    }

    await expect(nameError).toBeVisible()
    await expect(page.getByText('Ton email est requis.')).toBeVisible()
    await expect(page.getByText('Un sujet est requis.')).toBeVisible()
    await expect(page.getByText('Un message est requis.')).toBeVisible()

    await page.getByLabel('Email').fill('pas-un-email')
    await page.getByRole('button', { name: /Envoyer le message/i }).click()
    await expect(page.getByText('Format d’email invalide.')).toBeVisible()
  })

  test('login and register modes expose expected fields', async ({ page }) => {
    await page.goto('/login')

    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Mot de passe')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Connexion$/i })).toBeVisible()

    await page.goto('/login?mode=register&role=client')
    await expect(page.getByRole('heading', { name: /Rejoins Live in Black/i })).toBeVisible()
    await expect(page.getByLabel('Prénom')).toBeVisible()
    await expect(page.getByLabel('Nom', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
  })
})
