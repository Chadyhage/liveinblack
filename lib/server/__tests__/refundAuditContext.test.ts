import { describe, expect, it } from 'vitest'
import { auditContextFromRequest } from '../refunds/refundCases'

describe('refund audit context', () => {
  it('extrait ip et user-agent depuis la requête HTTP', () => {
    const req = new Request('https://liveinblack.com/api/refunds/case/contest', {
      headers: {
        'x-forwarded-for': '203.0.113.10, 10.0.0.1',
        'user-agent': 'LiveInBlackMobile/1.0',
      },
    })

    expect(auditContextFromRequest(req)).toEqual({
      ip: '203.0.113.10',
      userAgent: 'LiveInBlackMobile/1.0',
    })
  })

  it('préfère x-real-ip quand il est présent', () => {
    const req = new Request('https://liveinblack.com/api/refunds/case/confirm', {
      headers: {
        'x-real-ip': '198.51.100.7',
        'x-forwarded-for': '203.0.113.10',
      },
    })

    expect(auditContextFromRequest(req).ip).toBe('198.51.100.7')
  })
})
