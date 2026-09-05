import crypto from 'crypto'

export const BENIN_TIME_ZONE = 'Africa/Porto-Novo'
export const POSTPONEMENT_REFUND_WINDOW_MS = 24 * 60 * 60 * 1000
export const CANCELLATION_OPTION_DEADLINE_MS = 48 * 60 * 60 * 1000
export const CANCELLATION_OPTION_MIN_FACE_VALUE_XOF = 5_000
export const CANCELLATION_OPTION_CAP_XOF = 5_000

export type RefundCause = 'cancellation_option' | 'event_cancelled' | 'postponed_declined'

export interface RefundableOrderLines {
  isTable: boolean
  qty: number
  unitPriceMinor: number
  feeMinor: number
  cancellationProtectionFeeMinor: number
  preorders: Array<{ price: number; qty: number }>
}

export function orderSeatCount(order: Pick<RefundableOrderLines, 'isTable' | 'qty'>): number {
  return order.isTable ? 1 : Math.max(0, Math.floor(Number(order.qty) || 0))
}

export function orderFacialMinor(order: Pick<RefundableOrderLines, 'isTable' | 'qty' | 'unitPriceMinor'>): number {
  return Math.max(0, Math.round(Number(order.unitPriceMinor) || 0) * orderSeatCount(order))
}

export function orderOptionMinor(order: Pick<RefundableOrderLines, 'preorders' | 'cancellationProtectionFeeMinor'>): number {
  const preorders = order.preorders.reduce((sum, item) => sum + Math.max(0, Math.round(Number(item.price) || 0)) * Math.max(0, Math.floor(Number(item.qty) || 0)), 0)
  return preorders + Math.max(0, Math.round(Number(order.cancellationProtectionFeeMinor) || 0))
}

export function computeRefundableMinor(order: RefundableOrderLines, cause: RefundCause): number {
  const facial = orderFacialMinor(order)
  if (cause === 'cancellation_option') return facial
  return facial + Math.max(0, Math.round(Number(order.feeMinor) || 0)) + orderOptionMinor(order)
}

export function computeCancellationOptionFeeXOF(unitPriceMinor: number, qty: number): number {
  const facial = Math.max(0, Math.round(Number(unitPriceMinor) || 0)) * Math.max(0, Math.floor(Number(qty) || 0))
  if (facial < CANCELLATION_OPTION_MIN_FACE_VALUE_XOF) return 0
  return Math.min(Math.round(facial * 0.1), CANCELLATION_OPTION_CAP_XOF)
}

export function cancellationOptionDeadline(closingDate: Date | null | undefined): Date | null {
  if (!closingDate) return null
  const time = closingDate.getTime()
  if (Number.isNaN(time)) return null
  return new Date(time - CANCELLATION_OPTION_DEADLINE_MS)
}

export function isBeforeCancellationOptionDeadline(closingDate: Date | null | undefined, now = new Date()): boolean {
  const deadline = cancellationOptionDeadline(closingDate)
  return Boolean(deadline && now.getTime() < deadline.getTime())
}

export function buildPostponementRefundWindowCloseDate(notificationTime = new Date()): Date {
  return new Date(notificationTime.getTime() + POSTPONEMENT_REFUND_WINDOW_MS)
}

export function generateRefundPickupCode(): string {
  return crypto.randomBytes(18).toString('base64url').toUpperCase()
}

export function hashRefundPickupCode(code: string): string {
  return crypto.createHash('sha256').update(String(code).trim().toUpperCase()).digest('hex')
}

function refundSecretKey(): Buffer {
  const secret = process.env.REFUND_CODE_SECRET || process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'live-in-black-local-refund-secret'
  return crypto.createHash('sha256').update(secret).digest()
}

export function encryptRefundPickupCode(code: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', refundSecretKey(), iv)
  const encrypted = Buffer.concat([cipher.update(String(code).trim().toUpperCase(), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.')
}

export function decryptRefundPickupCode(value: string | null | undefined): string | null {
  if (!value) return null
  const [ivRaw, tagRaw, encryptedRaw] = value.split('.')
  if (!ivRaw || !tagRaw || !encryptedRaw) return null
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', refundSecretKey(), Buffer.from(ivRaw, 'base64url'))
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, 'base64url')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

export function encryptRefundSensitiveValue(value: string): string {
  return encryptRefundPickupCode(value)
}

export function decryptRefundSensitiveValue(value: string | null | undefined): string | null {
  return decryptRefundPickupCode(value)
}

export function maskPaymentDestination(value: string | null | undefined): string | null {
  const raw = String(value || '').trim()
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length >= 6) return `${raw.slice(0, 4)}••••${raw.slice(-2)}`
  if (raw.length > 4) return `${raw.slice(0, 2)}••${raw.slice(-2)}`
  return '••••'
}
