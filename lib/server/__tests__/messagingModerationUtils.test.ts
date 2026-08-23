import { describe, expect, it } from 'vitest'
import { normalizeBlockedTargetUserId, validateModerationTargetUserId, validateReportReason } from '../messaging/messagingModerationUtils'

describe('messagingModerationUtils', () => {
  const normalizeObjectId = (id: string) => `normalized:${id.toLowerCase()}`

  it('valide et normalise une cible de modération', () => {
    expect(validateModerationTargetUserId('507F1F77BCF86CD799439011', normalizeObjectId)).toEqual({
      ok: true,
      targetUserId: 'normalized:507f1f77bcf86cd799439011',
    })
  })

  it('refuse une cible vide ou invalide pour blocage/signalement', () => {
    expect(validateModerationTargetUserId('   ', normalizeObjectId)).toEqual({
      ok: false,
      status: 400,
      error: 'invalid_input',
    })
    expect(validateModerationTargetUserId('not-an-id', normalizeObjectId)).toEqual({
      ok: false,
      status: 404,
      error: 'user_not_found',
    })
  })

  it('normalise la cible de déblocage seulement si l’id est valide', () => {
    expect(normalizeBlockedTargetUserId('507F1F77BCF86CD799439011', normalizeObjectId)).toEqual({
      ok: true,
      targetUserId: 'normalized:507f1f77bcf86cd799439011',
    })
    expect(normalizeBlockedTargetUserId('legacy-non-object-id', normalizeObjectId)).toEqual({
      ok: true,
      targetUserId: 'legacy-non-object-id',
    })
  })

  it('valide et trim la raison de signalement', () => {
    expect(validateReportReason('  Spam répété  ')).toEqual({
      ok: true,
      reason: 'Spam répété',
    })
  })

  it('refuse une raison vide ou trop longue', () => {
    expect(validateReportReason('   ')).toEqual({
      ok: false,
      status: 400,
      error: 'reason_required',
    })
    expect(validateReportReason('x'.repeat(1001))).toEqual({
      ok: false,
      status: 400,
      error: 'reason_required',
    })
  })
})
