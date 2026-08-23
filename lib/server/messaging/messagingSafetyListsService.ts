import Report from '@/lib/models/Report'
import User from '@/lib/models/User'

export interface SafetyListsCaller {
  id: string
}

export interface MyReportView {
  id: string
  targetId: string
  targetName: string
  reason: string
  createdAt: string
}

export interface BlockedUserView {
  userId: string
  name: string
  email: string
}

export interface ListMyReportsResult {
  ok: true
  reports: MyReportView[]
}

export interface ListBlockedUsersResult {
  ok: true
  blocked: BlockedUserView[]
}

export async function listSafetyReports(caller: SafetyListsCaller): Promise<ListMyReportsResult> {
  const reports = await Report.find({ fromId: caller.id }).sort({ createdAt: -1 }).lean()
  return {
    ok: true,
    reports: reports.map((report) => ({
      id: String(report._id),
      targetId: report.targetId,
      targetName: report.targetName,
      reason: report.reason,
      createdAt: new Date(report.createdAt as unknown as string).toISOString(),
    })),
  }
}

export async function listBlockedSafetyUsers(caller: SafetyListsCaller): Promise<ListBlockedUsersResult> {
  const me = await User.findById(caller.id).lean()
  const ids = me?.blockedUserIds ?? []
  if (ids.length === 0) return { ok: true, blocked: [] }

  const users = await User.find({ _id: { $in: ids } }).lean()
  return {
    ok: true,
    blocked: users.map((user) => ({
      userId: String(user._id),
      name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email,
      email: user.email,
    })),
  }
}
