import { describe, expect, it } from 'vitest'
import {
  applicationApprovedEmail,
  newDeviceLoginEmail,
  ticketPurchaseConfirmedEmail,
} from '..'

describe('design des e-mails LIVE IN BLACK', () => {
  it('utilise le fond des modales et une marque correctement composée', () => {
    const email = newDeviceLoginEmail(
      { deviceLabel: 'Safari sur iPhone', approxLocation: 'Lomé', when: 'Aujourd’hui à 18:42' },
      'https://liveinblack.com/profile/parametres',
    )

    expect(email.html).toContain('background:#191218')
    expect(email.html).toContain('LIVE <span style="color:#F53D8D;">IN</span> BLACK')
    expect(email.html).toContain('/images/email-icons/shield-check.png')
    expect(email.html).not.toContain('/images/mascot/')
    expect(email.html).not.toContain('/images/live-in-black/')
  })

  it('associe une véritable icône à chaque famille métier', () => {
    const application = applicationApprovedEmail('prestataire')
    const ticket = ticketPurchaseConfirmedEmail({
      eventId: 'event-1',
      eventName: 'Moonlight Experience',
      placeLabel: 'Pass Premium',
      quantity: 1,
      totalLabel: '15 000 FCFA',
      ticketUrl: 'https://liveinblack.com/profile/billets',
    })

    expect(application.html).toContain('/images/email-icons/file-check-2.png')
    expect(ticket.html).toContain('/images/email-icons/ticket-check.png')
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
