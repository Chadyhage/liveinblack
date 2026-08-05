import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { signTicketToken, verifyTicketToken, extractTicketCode } from '../ticketToken'

describe('ticketToken', () => {
  const prevSecret = process.env.AUTH_SECRET

  beforeAll(() => {
    process.env.AUTH_SECRET = 'test-secret-for-ticket-token'
  })

  afterAll(() => {
    process.env.AUTH_SECRET = prevSecret
  })

  const solo = { ticketCode: 'ABCD2345', seatVersion: 0, entryNonce: null }
  const seat = { ticketCode: 'WXYZ6789', seatVersion: 1, entryNonce: 'abc123nonce' }

  it('round-trips a freshly signed token for a solo ticket', () => {
    const token = signTicketToken(solo)
    expect(verifyTicketToken(token, solo)).toBe(true)
  })

  it('round-trips a freshly signed token for a table seat with a nonce', () => {
    const token = signTicketToken(seat)
    expect(verifyTicketToken(token, seat)).toBe(true)
  })

  it('extracts the ticketCode without validating', () => {
    const token = signTicketToken(seat)
    expect(extractTicketCode(token)).toBe('WXYZ6789')
  })

  it('returns null when the token has no separator', () => {
    expect(extractTicketCode('nodothere')).toBeNull()
  })

  it('rejects a token whose signature was tampered with', () => {
    const token = signTicketToken(solo)
    const tampered = token.slice(0, -1) + (token.at(-1) === 'a' ? 'b' : 'a')
    expect(verifyTicketToken(tampered, solo)).toBe(false)
  })

  it('rejects a token replayed against a different ticketCode', () => {
    const token = signTicketToken(solo)
    expect(verifyTicketToken(token, { ...solo, ticketCode: 'OTHR0000' })).toBe(false)
  })

  it('goes stale automatically once seatVersion changes (seat reassigned)', () => {
    const token = signTicketToken(seat)
    const reassigned = { ...seat, seatVersion: seat.seatVersion + 1 }
    expect(verifyTicketToken(token, reassigned)).toBe(false)
  })

  it('goes stale automatically once entryNonce rotates (seat revoked/reassigned)', () => {
    const token = signTicketToken(seat)
    const rotated = { ...seat, entryNonce: 'a-different-nonce' }
    expect(verifyTicketToken(token, rotated)).toBe(false)
  })

  it('rejects a malformed token with no dot separator', () => {
    expect(verifyTicketToken('garbage-no-separator', solo)).toBe(false)
  })

  it('rejects an empty signature', () => {
    expect(verifyTicketToken('ABCD2345.', solo)).toBe(false)
  })
})
