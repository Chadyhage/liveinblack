import { expect, test, type Page } from 'playwright/test'
import { loginSeededUser } from './helpers/auth'

test.skip(process.env.LIB_RUN_SEEDED_E2E !== '1', 'Seeded E2E requires npm run seed:e2e and LIB_RUN_SEEDED_E2E=1')


async function login(page: Page, email: string) {
  await loginSeededUser(page, email)
}

async function signMedia(page: Page, body: Record<string, unknown>) {
  return page.evaluate(async (body) => {
    const response = await fetch('/api/uploads/media/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { status: response.status, body: await response.json() }
  }, body)
}

test.describe.serial('seeded public media upload signatures', () => {
  test('organizer can request signed image and video uploads for event surfaces', async ({ page }) => {
    await login(page, 'organisateur@liveinblack.dev')

    const image = await signMedia(page, { purpose: 'event', contentType: 'image/png', size: 123_456 })
    expect(image.status).toBe(200)
    expect(image.body).toMatchObject({
      ok: true,
      upload: {
        uploadPreset: 'e2e-public-preset',
        resourceType: 'image',
        allowedFormats: 'png',
        deliveryType: 'upload',
      },
    })
    expect(image.body.upload.apiKey).toBe(process.env.CLOUDINARY_API_KEY)
    expect(image.body.upload.uploadUrl).toBe('https://api.cloudinary.com/v1_1/liveinblack-e2e/image/upload')
    expect(image.body.upload.folder).toMatch(/^media\/pending\//)
    expect(image.body.upload.signature).toMatch(/^[a-f0-9]{40}$/)
    expect(image.body.upload.intentToken.length).toBeGreaterThan(40)

    const video = await signMedia(page, { purpose: 'organizer-gallery', contentType: 'video/webm', size: 1_000_000 })
    expect(video.status).toBe(200)
    expect(video.body.upload).toMatchObject({
      resourceType: 'video',
      allowedFormats: 'webm',
    })
    expect(video.body.upload.uploadUrl).toBe('https://api.cloudinary.com/v1_1/liveinblack-e2e/video/upload')
  })

  test('provider can request catalog media signatures but a client cannot', async ({ page }) => {
    await login(page, 'prestataire@liveinblack.dev')
    const provider = await signMedia(page, { purpose: 'provider-catalog', contentType: 'image/webp', size: 222_222 })
    expect(provider.status).toBe(200)
    expect(provider.body.upload).toMatchObject({
      resourceType: 'image',
      allowedFormats: 'webp',
      uploadPreset: 'e2e-public-preset',
    })

    await login(page, 'client@liveinblack.dev')
    const forbidden = await signMedia(page, { purpose: 'provider-catalog', contentType: 'image/webp', size: 222_222 })
    expect(forbidden).toMatchObject({ status: 403, body: { error: 'forbidden' } })
  })

  test('signature endpoint rejects invalid media payloads before issuing credentials', async ({ page }) => {
    await login(page, 'organisateur@liveinblack.dev')

    const unsupported = await signMedia(page, { purpose: 'event', contentType: 'application/pdf', size: 10_000 })
    expect(unsupported).toMatchObject({ status: 400, body: { error: 'invalid_media' } })

    const tooLarge = await signMedia(page, { purpose: 'event', contentType: 'image/png', size: 30_000_001 })
    expect(tooLarge).toMatchObject({ status: 400, body: { error: 'invalid_media' } })
  })
})
