import mongoose from 'mongoose'

export type ModerationTargetValidationResult =
  | { ok: false; status: number; error: string }
  | { ok: true; targetUserId: string }

export function validateModerationTargetUserId(
  targetUserIdRaw: string | null | undefined,
  normalizeObjectId: (id: string) => string,
): ModerationTargetValidationResult {
  const trimmed = targetUserIdRaw?.trim()
  if (!trimmed) return { ok: false, status: 400, error: 'invalid_input' }
  if (!mongoose.isValidObjectId(trimmed)) return { ok: false, status: 404, error: 'user_not_found' }
  return { ok: true, targetUserId: normalizeObjectId(trimmed) }
}

export function normalizeBlockedTargetUserId(
  targetUserIdRaw: string | null | undefined,
  normalizeObjectId: (id: string) => string,
): { ok: false; status: number; error: string } | { ok: true; targetUserId: string } {
  const trimmed = targetUserIdRaw?.trim()
  if (!trimmed) return { ok: false, status: 400, error: 'invalid_input' }
  return {
    ok: true,
    targetUserId: mongoose.isValidObjectId(trimmed) ? normalizeObjectId(trimmed) : trimmed,
  }
}

export function validateReportReason(reasonRaw: string | null | undefined): { ok: false; status: number; error: string } | { ok: true; reason: string } {
  const reason = reasonRaw?.trim()
  if (!reason || reason.length > 1000) return { ok: false, status: 400, error: 'reason_required' }
  return { ok: true, reason }
}
