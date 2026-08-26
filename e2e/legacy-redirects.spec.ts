import { expect, test } from 'playwright/test'

const redirects = [
  { from: '/', to: '/home' },
  { from: '/accueil', to: '/home' },
  { from: '/c-est-quoi', to: '/about' },
  { from: '/connexion', to: '/login' },
  { from: '/evenements', to: '/events' },
  { from: '/organisateurs', to: '/organizers' },
  { from: '/prestataires', to: '/providers' },
  { from: '/recherche', to: '/search' },
  { from: '/cgu', to: '/terms' },
  { from: '/mentions-legales', to: '/legal-notice' },
  { from: '/confidentialite', to: '/privacy' },
]

const protectedRedirects = [
  { from: '/messagerie', to: '/messages' },
  { from: '/ma-page-organisateur', to: '/organizer-studio' },
  { from: '/mes-evenements', to: '/my-events' },
  { from: '/proposer-services', to: '/offer-services' },
  { from: '/admin', to: '/agent' },
]

test.describe('legacy redirects', () => {
  test('French and legacy aliases land on current routes', async ({ page }) => {
    test.setTimeout(60_000)

    for (const redirect of redirects) {
      await page.goto(redirect.from, { waitUntil: 'domcontentloaded' })
      await expect(page).toHaveURL(new RegExp(`${redirect.to}(\\?|$)`))
    }
  })

  test('protected legacy aliases preserve the destination through login', async ({ page }) => {
    test.setTimeout(60_000)

    for (const redirect of protectedRedirects) {
      await page.goto(redirect.from, { waitUntil: 'domcontentloaded' })
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(redirect.to)}`))
    }
  })
})
