import type { OrderDoc } from '@/lib/models/Order'

export const DEFAULT_REFUND_WINDOW_DAYS = 7

export function grossRefundMajor(order: Pick<OrderDoc, 'isTable' | 'qty' | 'unitPriceMinor' | 'preorders' | 'currency'>): number {
  const seatCount = order.isTable ? 1 : order.qty
  const preorderTotal = order.preorders.reduce((sum, preorder) => sum + preorder.price * preorder.qty, 0)
  const grossMinor = Math.max(0, order.unitPriceMinor * seatCount + preorderTotal)
  return grossMinor / (order.currency === 'XOF' ? 1 : 100)
}

export function resolveRefundWindowDays(days: number | undefined): number {
  return days && days > 0 ? days : DEFAULT_REFUND_WINDOW_DAYS
}

export function buildRefundWindowCloseDate(now: number, days: number | undefined): Date {
  const windowDays = resolveRefundWindowDays(days)
  return new Date(now + windowDays * 24 * 60 * 60 * 1000)
}

export function isPastOrInvalidEventDate(date: string, time: string | undefined, now: number): boolean {
  const nextTime = time?.trim() || '00:00'
  const nextDateTime = new Date(`${date.trim()}T${nextTime}`)
  return Number.isNaN(nextDateTime.getTime()) || nextDateTime.getTime() <= now
}
