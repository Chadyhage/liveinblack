import { describe, expect, it } from 'vitest'
import { verificationTokenIdentifier } from '../token-identifier'

describe('verificationTokenIdentifier', () => {
  it('isole les liens de vérification, reset et changement d’email', () => {
    const verify = verificationTokenIdentifier('user-1', 'alice@example.com', 'verify-email')
    const reset = verificationTokenIdentifier('user-1', 'alice@example.com', 'reset-password')
    const change = verificationTokenIdentifier('user-1', 'alice@example.com', 'change-email')

    expect(new Set([verify, reset, change]).size).toBe(3)
  })

  it('lie le jeton au compte et normalise l’adresse', () => {
    expect(verificationTokenIdentifier('user-1', ' Alice@Example.COM ', 'reset-password')).toBe(
      'reset-password:user-1:alice@example.com'
    )
    expect(verificationTokenIdentifier('user-2', 'alice@example.com', 'reset-password')).not.toBe(
      verificationTokenIdentifier('user-1', 'alice@example.com', 'reset-password')
    )
  })
})
