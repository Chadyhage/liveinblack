import { describe, expect, it } from 'vitest'
import { hasAuthSessionCookie } from '../authSessionCookie'

describe('hasAuthSessionCookie', () => {
  it.each(['authjs.session-token', '__Secure-authjs.session-token', '__Host-authjs.session-token', 'next-auth.session-token', '__Secure-next-auth.session-token'])('reconnaît %s', (name) => {
    expect(hasAuthSessionCookie([{ name }])).toBe(true)
  })
  it('ignore les cookies sans rapport', () => {
    expect(hasAuthSessionCookie([{ name: 'theme' }, { name: 'authjs.session-token.invalid' }])).toBe(false)
  })
})
