import type { OrderDoc } from '@/lib/models/Order'
import { buildPostponementRefundWindowCloseDate, computeRefundableMinor } from '@/lib/shared/refundPolicy'
import { parseBeninLocalDateTime } from './organizerEventUtils'

export function grossRefundMajor(order: Pick<OrderDoc, 'isTable' | 'qty' | 'unitPriceMinor' | 'preorders' | 'currency'>): number {
  const seatCount = order.isTable ? 1 : order.qty
  const preorderTotal = order.preorders.reduce((sum, preorder) => sum + preorder.price * preorder.qty, 0)
  const grossMinor = Math.max(0, order.unitPriceMinor * seatCount + preorderTotal)
  return grossMinor / (order.currency === 'XOF' ? 1 : 100)
}

export function resolveRefundWindowDays(_days: number | undefined): number {
  void _days
  return 1
}

export function buildRefundWindowCloseDate(now: number, _days: number | undefined): Date {
  void _days
  return buildPostponementRefundWindowCloseDate(new Date(now))
}

export function refundableEventCancellationMajor(order: Pick<OrderDoc, 'isTable' | 'qty' | 'unitPriceMinor' | 'feeMinor' | 'cancellationProtectionFeeMinor' | 'preorders' | 'currency'>): number {
  return computeRefundableMinor(order, 'event_cancelled') / (order.currency === 'XOF' ? 1 : 100)
}

export function isPastOrInvalidEventDate(date: string, time: string | undefined, now: number): boolean {
  const nextTime = time?.trim() || '00:00'
  const nextDateTime = parseBeninLocalDateTime(`${date.trim()}T${nextTime}`)
  if (!nextDateTime) return true
  return Number.isNaN(nextDateTime.getTime()) || nextDateTime.getTime() <= now
}
