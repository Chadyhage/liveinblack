import Report from '../models/Report'
import User from '../models/User'
import { validateModerationTargetUserId, validateReportReason } from './messagingModerationUtils'

export interface ReportUserCaller {
  id: string
}

export interface ReportUserInput {
  targetUserId: string
  reason: string
}

export interface ReportUserDependencies {
  normalizeObjectId: (id: string) => string
  notifyUserById: (
    userId: string,
    buildEmail: () => Promise<unknown> | unknown,
  ) => Promise<void>
  notifyAllAgents: (
    buildEmail: () => Promise<unknown> | unknown,
  ) => Promise<void>
  reportReceivedAgainstAccountEmail: (
    reason: string,
    helpUrl: string,
    site: string,
  ) => Promise<unknown> | unknown
  newReportToReviewEmail: (
    subject: string,
    moderationUrl: string,
    site: string,
  ) => Promise<unknown> | unknown
}

export async function reportUserForCaller(
  caller: ReportUserCaller,
  input: ReportUserInput,
  site: string,
  {
    normalizeObjectId,
    notifyUserById,
    notifyAllAgents,
    reportReceivedAgainstAccountEmail,
    newReportToReviewEmail,
  }: ReportUserDependencies,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const targetValidation = validateModerationTargetUserId(input.targetUserId, normalizeObjectId)
  if (!targetValidation.ok) return targetValidation

  const reasonValidation = validateReportReason(input.reason)
  if (!reasonValidation.ok) return reasonValidation

  const { targetUserId } = targetValidation
  const { reason } = reasonValidation

  const target = await User.findById(targetUserId).lean()
  if (!target) return { ok: false, status: 404, error: 'user_not_found' }
  if (targetUserId === caller.id) return { ok: false, status: 400, error: 'cannot_report_self' }

  const callerUser = await User.findById(caller.id).lean()
  const fromName = callerUser ? `${callerUser.firstName ?? ''} ${callerUser.lastName ?? ''}`.trim() || callerUser.email : ''
  const targetName = `${target.firstName ?? ''} ${target.lastName ?? ''}`.trim() || target.email

  await Report.create({
    fromId: caller.id,
    fromName,
    targetId: targetUserId,
    targetName,
    reason,
  })

  await notifyUserById(targetUserId, () =>
    reportReceivedAgainstAccountEmail(reason, `${site}/help`, site),
  )
  await notifyAllAgents(() =>
    newReportToReviewEmail(`Utilisateur — ${targetName}`, `${site}/agent/signalements`, site),
  )

  return { ok: true }
}
