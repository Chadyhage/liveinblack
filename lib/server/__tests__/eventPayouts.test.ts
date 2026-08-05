import { describe, expect, it } from 'vitest'
import { classifyFedapayPayoutStatus } from '../eventPayouts'

describe('classifyFedapayPayoutStatus', () => {
  it.each(['sent', 'processed', 'transferred', 'paid', 'successful', 'succeeded'])(
    'classe %s comme un reversement réussi',
    (status) => {
      expect(classifyFedapayPayoutStatus(status)).toBe('succeeded')
    }
  )

  it.each(['failed', 'declined', 'canceled', 'cancelled', 'expired'])(
    'classe %s comme un reversement échoué',
    (status) => {
      expect(classifyFedapayPayoutStatus(status)).toBe('failed')
    }
  )

  it.each(['pending', 'started', 'processing', '', undefined])(
    'ne finalise pas un statut non terminal (%s)',
    (status) => {
      expect(classifyFedapayPayoutStatus(status)).toBe('pending')
    }
  )
})
