import type { DefaultSession } from 'next-auth'
import type { Role, AccountStatus, RoleApprovalStatus } from '@/lib/server/permissions'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      roles: Role[]
      activeRole: Role
      status: AccountStatus
      orgStatus: RoleApprovalStatus
      prestStatus: RoleApprovalStatus
    } & DefaultSession['user']
  }

  interface User {
    roles: Role[]
    activeRole: Role
    status: AccountStatus
    orgStatus?: RoleApprovalStatus
    prestStatus?: RoleApprovalStatus
    sessionVersion: number
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    roles?: Role[]
    activeRole?: Role
    status?: AccountStatus
    orgStatus?: RoleApprovalStatus
    prestStatus?: RoleApprovalStatus
    sessionVersion?: number
    checkedAt?: number
  }
}
