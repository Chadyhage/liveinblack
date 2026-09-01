import { describe, expect, it } from 'vitest'
import {
  applicationApprovedEmail,
  newDeviceLoginEmail,
  ticketPurchaseConfirmedEmail,
} from '..'

describe('design des e-mails LIVE IN BLACK', () => {
  it('utilise le fond des modales et une marque plus sobre', () => {
    const email = newDeviceLoginEmail(
      { deviceLabel: 'Safari sur iPhone', approxLocation: 'Lomé', when: 'Aujourd’hui à 18:42' },
      'https://liveinblack.com/profile/parametres',
    )

    expect(email.html).toContain('background:#191218')
    expect(email.html).toContain('/branding/liveinblack-logo-horizontal.png')
    expect(email.html).toContain('Sécurité du compte')
    expect(email.html).not.toContain('/branding/liveinblack-wordmark.png')
    expect(email.html).not.toContain('/branding/liveinblack-logo-stacked.png')
    expect(email.html).not.toContain('/images/email-icons/shield-check.png')
    expect(email.html).not.toContain('/images/mascot/')
    expect(email.html).not.toContain('/images/live-in-black/')
  })

  it('garde les accents utiles sans répéter le branding dans les cartes', () => {
    const application = applicationApprovedEmail('prestataire')
    const ticket = ticketPurchaseConfirmedEmail({
      eventId: 'event-1',
      eventName: 'Moonlight Experience',
      placeLabel: 'Pass Premium',
      quantity: 1,
      totalLabel: '15 000 FCFA',
      ticketUrl: 'https://liveinblack.com/profile/billets',
    })

    expect(application.html).toContain('Candidature')
    expect(application.html).not.toContain('/images/email-icons/file-check-2.png')
    expect(application.html).not.toContain('/branding/liveinblack-wordmark.png')
    expect(ticket.html).toContain('border:1px solid #3c2838;border-radius:10px;')
    expect(ticket.html).toContain('/images/email-icons/calendar-days.png')
    expect(ticket.html).toContain('/images/email-icons/briefcase-business.png')
    expect(ticket.html).toContain('/images/email-icons/newspaper.png')
  })

  it('conserve des attributs de style valides pour les polices', () => {
    const email = applicationApprovedEmail('organisateur')

    expect(email.html).toContain("font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI'")
    expect(email.html).not.toContain('font-family:-apple-system, BlinkMacSystemFont, "Segoe UI"')
  })
})
