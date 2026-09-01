import { createHmac, timingSafeEqual } from 'node:crypto'

export function verifyVercelSignature(rawBody: string, signature: string | null, secret: string) {
  if (!signature || !secret) return false

  const normalized = signature.replace(/^sha1=/i, '')
  const expected = createHmac('sha1', secret).update(rawBody).digest('hex')
  const left = Buffer.from(expected)
  const right = Buffer.from(normalized)

  return left.length === right.length && timingSafeEqual(left, right)
}
