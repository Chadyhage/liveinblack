import { describe, it, expect } from 'vitest'
import { requireAgent } from '../agentGuard'

describe('requireAgent', () => {
  it('refuse un appelant non connecté', () => {
    expect(requireAgent(null)).toBe(false)
    expect(requireAgent(undefined)).toBe(false)
  })
  it('refuse un compte dont le rôle actif n’est pas agent', () => {
    expect(requireAgent({ activeRole: 'client' })).toBe(false)
    expect(requireAgent({ activeRole: 'organisateur' })).toBe(false)
    expect(requireAgent({ activeRole: 'prestataire' })).toBe(false)
  })
  it('autorise un compte agent', () => {
    expect(requireAgent({ activeRole: 'agent' })).toBe(true)
  })
})
